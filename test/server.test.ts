import { mkdtemp, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PaseoApi } from "../server/paseo-api";
import { createChatService } from "../server/chats";
import { claimChatFolder, healChatFolder, isManagedChatFolder, MARKER, removeIfUntouched } from "../server/folders";
import { paseoHome } from "../server/paths";
import { rootProblem } from "../server/root";
import { ChatStore } from "../server/store";

let base: string;
beforeEach(async () => {
  // Real path: chat roots are stored resolved, and macOS's tmpdir is a symlink into /private.
  base = await realpath(await mkdtemp(join(tmpdir(), "projectless-chat-")));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("paseoHome", () => {
  it("follows PASEO_HOME and defaults to ~/.paseo", () => {
    expect(paseoHome({ PASEO_HOME: "/srv/paseo" })).toBe("/srv/paseo");
    expect(paseoHome({})).toMatch(/\.paseo$/);
  });
});

describe("folders", () => {
  it("claims distinct folders under a day bucket, with a marker and no git", async () => {
    const now = new Date(2026, 10, 7);
    const claims = await Promise.all(
      Array.from({ length: 20 }, (_, i) => claimChatFolder({ root: base, text: "hello world", now, nonce: `n${i}` })),
    );
    expect(new Set(claims.map((claim) => claim.dir)).size).toBe(20);
    for (const { dir } of claims) {
      expect(dir.startsWith(join(base, "2026-11-07", "hello-world-"))).toBe(true);
      expect(await readdir(dir)).toEqual([MARKER]);
      expect(isManagedChatFolder(base, dir)).toBe(true);
    }
  });

  it("never treats other folders as managed", () => {
    expect(isManagedChatFolder(base, join(base, "my-project"))).toBe(false);
    expect(isManagedChatFolder(base, "/etc")).toBe(false);
    expect(isManagedChatFolder(base, join(base, "2026-11-07", "abcdefgh", "src"))).toBe(false);
  });

  it("removes a folder only while untouched", async () => {
    const { dir } = await claimChatFolder({ root: base, text: "x", now: new Date(), nonce: "n" });
    await writeFile(join(dir, "notes.md"), "keep me");
    expect(await removeIfUntouched(base, dir)).toBe(false);
    await rm(join(dir, "notes.md"));
    expect(await removeIfUntouched(base, dir)).toBe(true);
    await expect(readdir(dir)).rejects.toThrow();
  });

  it("heals a vanished managed folder", async () => {
    const { dir } = await claimChatFolder({ root: base, text: "x", now: new Date(), nonce: "n" });
    await rm(dir, { recursive: true });
    expect(await healChatFolder(base, dir)).toBe(true);
    expect(await readdir(dir)).toEqual([]);
    expect(await healChatFolder(base, join(base, "elsewhere"))).toBe(false);
  });
});

describe("rootProblem", () => {
  it("refuses relative paths and folders inside a git repository", async () => {
    expect(await rootProblem("relative/path")).toEqual({ code: "not_absolute" });
    await mkdir(join(base, "repo", ".git"), { recursive: true });
    expect(await rootProblem(join(base, "repo", "chats", "not-yet-created"))).toMatchObject({ code: "inside_git" });
    expect(await rootProblem(join(base, "plain"))).toBeNull();
  });
});

/** Only what ensureChatsProject touches. */
function fakePaseo() {
  const calls = { opened: [] as string[], archived: 0 };
  const projects: { projectId: string }[] = [];
  const paseo = {
    projects: { list: async () => ({ projects }) },
    workspaces: {
      open: async (cwd: string) => {
        calls.opened.push(cwd);
        projects.push({ projectId: "prj_chats" });
        return { projectId: "prj_chats", archive: async () => void calls.archived++ };
      },
    },
  } as unknown as PaseoApi;
  return { paseo, calls, projects };
}

function settingsWith(chatRoot: string) {
  return {
    read: async () => ({ status: "ready" as const, revision: "1", values: { chatRoot, defaultModel: "" } }),
    subscribe: () => () => {},
  };
}

describe("chat service", () => {
  it("prepares once per nonce, creating the Chats project once", async () => {
    const root = join(base, "chats");
    const { paseo, calls } = fakePaseo();
    const chats = createChatService({ store: new ChatStore(join(base, "data")), settings: settingsWith(root) });

    const first = await chats.prepare(paseo, { nonce: "nonce-0001", text: "Plan a trip" });
    const again = await chats.prepare(paseo, { nonce: "nonce-0001", text: "Plan a trip" });
    const second = await chats.prepare(paseo, { nonce: "nonce-0002", text: "Another" });

    expect(again).toEqual(first);
    expect(second.dir).not.toBe(first.dir);
    expect(first.projectId).toBe("prj_chats");
    expect(first.agentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.status).toBe("preparing");
    expect(calls.opened).toEqual([root]);
    expect(calls.archived).toBe(1);

    const bound = await chats.bind({ nonce: "nonce-0001", workspaceId: "wks_1" });
    expect(bound).toMatchObject({ status: "active", workspaceId: "wks_1" });
    expect((await chats.prepare(paseo, { nonce: "nonce-0001", text: "Plan a trip" })).status).toBe("active");
  });

  it("keeps the same project after the root changes; old chats keep their folders", async () => {
    const { paseo, calls } = fakePaseo();
    const store = new ChatStore(join(base, "data"));
    const a = await createChatService({ store, settings: settingsWith(join(base, "one")) }).prepare(paseo, {
      nonce: "nonce-000a",
      text: "a",
    });
    const b = await createChatService({ store, settings: settingsWith(join(base, "two")) }).prepare(paseo, {
      nonce: "nonce-000b",
      text: "b",
    });
    expect(a.dir.startsWith(join(base, "one"))).toBe(true);
    expect(b.dir.startsWith(join(base, "two"))).toBe(true);
    expect(b.projectId).toBe(a.projectId);
    expect(calls.opened).toHaveLength(1);
    const state = JSON.parse(await readFile(join(base, "data", "state.json"), "utf8"));
    expect(state.roots).toEqual([join(base, "one"), join(base, "two")]);
  });

  it("abandons only unbound, untouched chats", async () => {
    const { paseo } = fakePaseo();
    const chats = createChatService({ store: new ChatStore(join(base, "data")), settings: settingsWith(join(base, "s")) });
    const draft = await chats.prepare(paseo, { nonce: "nonce-000c", text: "x" });
    expect(await chats.abandon({ nonce: "nonce-000c" })).toEqual({ removed: true });
    await expect(readdir(draft.dir)).rejects.toThrow();

    await chats.prepare(paseo, { nonce: "nonce-000d", text: "y" });
    await chats.bind({ nonce: "nonce-000d", workspaceId: "wks_2" });
    expect(await chats.abandon({ nonce: "nonce-000d" })).toEqual({ removed: false });
  });

  it("refuses a root inside a git repository", async () => {
    await mkdir(join(base, "repo", ".git"), { recursive: true });
    const { paseo } = fakePaseo();
    const chats = createChatService({
      store: new ChatStore(join(base, "data")),
      settings: settingsWith(join(base, "repo", "chats")),
    });
    await expect(chats.prepare(paseo, { nonce: "nonce-000e", text: "x" })).rejects.toThrow(/Git repository/);
    expect((await chats.rootInfo()).rootError).toMatchObject({ code: "inside_git", repo: expect.stringMatching(/repo$/) });
  });
});
