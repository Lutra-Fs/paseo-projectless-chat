import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** A one-time key per New Chat page: retries and remounts of the same page reuse one chat. */
export const NonceSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const ChatStatusSchema = z.enum(["preparing", "active"]);

export const PreparedChatSchema = z.object({
  nonce: z.string(),
  chatId: z.string(),
  dir: z.string(),
  projectId: z.string(),
  /** Pre-assigned so the combined workspace+agent create is idempotent and the id is known. */
  agentId: z.string(),
  workspaceId: z.string().nullable(),
  status: ChatStatusSchema,
});
export type PreparedChat = z.infer<typeof PreparedChatSchema>;

/** Claims a folder for the first message and makes sure the Chats project exists. */
export const prepareChatRpc = defineRpc({
  name: "chat.prepare",
  input: z.object({ nonce: NonceSchema, text: z.string().min(1).max(200_000) }),
  output: PreparedChatSchema,
});

/** Records the workspace the daemon created for a prepared chat. */
export const bindChatRpc = defineRpc({
  name: "chat.bind",
  input: z.object({ nonce: NonceSchema, workspaceId: z.string().min(1) }),
  output: PreparedChatSchema,
});

/** Drops a chat that never got a workspace; removes its folder only while it holds nothing but the marker. */
export const abandonChatRpc = defineRpc({
  name: "chat.abandon",
  input: z.object({ nonce: NonceSchema }),
  output: z.object({ removed: z.boolean() }),
});

/** Facts the settings page shows: where new chats go, and why a custom root was refused. */
export const chatRootInfoRpc = defineRpc({
  name: "chat.root-info",
  input: z.object({}),
  output: z.object({
    defaultRoot: z.string(),
    effectiveRoot: z.string(),
    rootError: z.string().nullable(),
    chatCount: z.number().int().nonnegative(),
  }),
});
