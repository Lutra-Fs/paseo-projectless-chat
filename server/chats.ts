import { randomUUID } from "node:crypto";
import type { PaseoApi } from "./paseo-api";
import type { PluginSettings } from "@getpaseo/plugin/server";
import type { PreparedChat } from "../shared/rpc";
import type { chatSettings } from "../shared/settings";
import { ensureChatsProject } from "./chats-project";
import { claimChatFolder, healChatFolder, removeIfUntouched } from "./folders";
import { defaultChatRoot } from "./paths";
import { prepareRoot, rootProblem } from "./root";
import type { ChatRecord, ChatStore } from "./store";

type Settings = PluginSettings<typeof chatSettings.schema>;

function toPrepared(record: ChatRecord): PreparedChat {
  const { nonce, chatId, dir, projectId, agentId, workspaceId, status } = record;
  return { nonce, chatId, dir, projectId, agentId, workspaceId, status };
}

async function configuredRoot(settings: Settings): Promise<string> {
  const state = await settings.read();
  const custom = state.status === "ready" ? state.values.chatRoot : "";
  return custom || defaultChatRoot();
}

export function createChatService(deps: { store: ChatStore; settings: Settings; now?: () => Date }) {
  const { store, settings } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async prepare(paseo: PaseoApi, input: { nonce: string; text: string }): Promise<PreparedChat> {
      return store.update(async (state) => {
        const existing = state.chats[input.nonce];
        if (existing) {
          await healChatFolder(existing.root, existing.dir);
          return { state, result: toPrepared(existing) };
        }
        const root = await prepareRoot(await configuredRoot(settings));
        const projectId = await ensureChatsProject(paseo, state.chatsProjectId, root);
        const created = now();
        const { dir, chatId } = await claimChatFolder({ root, text: input.text, now: created, nonce: input.nonce });
        const record: ChatRecord = {
          nonce: input.nonce,
          chatId,
          dir,
          root,
          projectId,
          agentId: randomUUID(),
          workspaceId: null,
          status: "preparing",
          createdAt: created.toISOString(),
          archivedAt: null,
        };
        return {
          state: {
            ...state,
            chatsProjectId: projectId,
            roots: state.roots.includes(root) ? state.roots : [...state.roots, root],
            chats: { ...state.chats, [input.nonce]: record },
          },
          result: toPrepared(record),
        };
      });
    },

    async bind(input: { nonce: string; workspaceId: string }): Promise<PreparedChat> {
      return store.update(async (state) => {
        const record = state.chats[input.nonce];
        if (!record) throw new Error("Unknown chat.");
        const bound: ChatRecord = { ...record, workspaceId: input.workspaceId, status: "active" };
        return { state: { ...state, chats: { ...state.chats, [input.nonce]: bound } }, result: toPrepared(bound) };
      });
    },

    async abandon(input: { nonce: string }): Promise<{ removed: boolean }> {
      return store.update<{ removed: boolean }>(async (state) => {
        const record = state.chats[input.nonce];
        if (!record || record.status !== "preparing") return { state, result: { removed: false } };
        const removed = await removeIfUntouched(record.root, record.dir);
        if (!removed) return { state, result: { removed: false } };
        const { [input.nonce]: _dropped, ...chats } = state.chats;
        return { state: { ...state, chats }, result: { removed: true } };
      });
    },

    async markArchived(workspaceId: string, archivedAt: string): Promise<void> {
      await store.update(async (state) => {
        const entry = Object.values(state.chats).find((chat) => chat.workspaceId === workspaceId);
        if (!entry) return { state, result: undefined };
        const chats = { ...state.chats, [entry.nonce]: { ...entry, archivedAt } };
        return { state: { ...state, chats }, result: undefined };
      });
    },

    async rootInfo() {
      const effectiveRoot = await configuredRoot(settings);
      const state = await store.read();
      return {
        defaultRoot: defaultChatRoot(),
        effectiveRoot,
        rootError: await rootProblem(effectiveRoot),
        chatCount: Object.keys(state.chats).length,
      };
    },
  };
}
