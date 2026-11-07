import { randomBytes } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { chatFolderName, dayBucket, isChatFolderShape } from "../shared/folder-name";

export const MARKER = ".paseo-chat.json";
const MAX_ATTEMPTS = 20;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function shortId(): string {
  return Array.from(randomBytes(8), (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/**
 * Claims `<root>/<day>/<slug>-<id>` with a non-recursive mkdir, so two racing creations can
 * never share a folder: the loser sees EEXIST and draws another id. No `git init`.
 */
export async function claimChatFolder(input: {
  root: string;
  text: string;
  now: Date;
  nonce: string;
}): Promise<{ dir: string; chatId: string }> {
  const bucket = join(input.root, dayBucket(input.now));
  await mkdir(bucket, { recursive: true });
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const dir = join(bucket, chatFolderName(input.text, shortId()));
    try {
      await mkdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    const chatId = basename(dir);
    const marker = { plugin: "paseo-new-chat", chatId, nonce: input.nonce, createdAt: input.now.toISOString() };
    await writeFile(join(dir, MARKER), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
    return { dir, chatId };
  }
  throw new Error(`Could not claim a chat folder under ${bucket}.`);
}

/** Whether `dir` sits exactly where this plugin creates chats under `root`. Never true for user folders. */
export function isManagedChatFolder(root: string, dir: string): boolean {
  const rel = relative(root, dir);
  if (!rel || rel.startsWith("..")) return false;
  return isChatFolderShape(rel.split(sep));
}

/**
 * Recreates a managed chat folder that disappeared (a cleanup tool, a deleted day bucket).
 * The folder was an empty app-made directory to begin with, so recreating it is harmless.
 */
export async function healChatFolder(root: string, dir: string): Promise<boolean> {
  if (!isManagedChatFolder(root, dir)) return false;
  await mkdir(dir, { recursive: true });
  return true;
}

/** Removes a folder only while it holds nothing but this plugin's marker. */
export async function removeIfUntouched(root: string, dir: string): Promise<boolean> {
  if (!isManagedChatFolder(root, dir)) return false;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
  if (entries.some((entry) => entry !== MARKER)) return false;
  await rm(dir, { recursive: true, force: true });
  return true;
}
