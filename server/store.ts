import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { ChatStatusSchema } from "../shared/rpc";

export const ChatRecordSchema = z.object({
  nonce: z.string(),
  chatId: z.string(),
  dir: z.string(),
  /** The root the chat was created under; kept so a changed root never orphans old chats. */
  root: z.string(),
  projectId: z.string(),
  agentId: z.string(),
  workspaceId: z.string().nullable(),
  status: ChatStatusSchema,
  createdAt: z.string(),
  archivedAt: z.string().nullable().default(null),
});
export type ChatRecord = z.infer<typeof ChatRecordSchema>;

const StateSchema = z.object({
  version: z.literal(1),
  chatsProjectId: z.string().nullable().default(null),
  /** Every root ever used, so cleanup, self-heal and recognition cover old locations. */
  roots: z.array(z.string()).default([]),
  chats: z.record(z.string(), ChatRecordSchema).default({}),
});
export type ChatState = z.infer<typeof StateSchema>;

const EMPTY: ChatState = { version: 1, chatsProjectId: null, roots: [], chats: {} };

/**
 * The plugin's own index, one JSON file. Paseo already persists workspaces and agents; this only
 * maps them to the folders this plugin created. Writes are serialized and atomic (tmp + rename).
 */
export class ChatStore {
  private readonly file: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(directory: string) {
    this.file = join(directory, "state.json");
  }

  async read(): Promise<ChatState> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
      throw error;
    }
    const parsed = StateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error(`Unreadable chat index ${this.file}: ${parsed.error.message}`);
    return parsed.data;
  }

  /** Runs `change` with exclusive access; its returned state is persisted before the next change runs. */
  update<T>(change: (state: ChatState) => Promise<{ state: ChatState; result: T }>): Promise<T> {
    const run = this.queue.then(async () => {
      const { state, result } = await change(await this.read());
      await this.write(state);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async write(state: ChatState): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tmp, this.file);
  }
}
