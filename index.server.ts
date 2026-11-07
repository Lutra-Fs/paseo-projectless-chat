import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createChatService } from "./server/chats";
import { pluginDataDir } from "./server/paths";
import { ChatStore } from "./server/store";
import { abandonChatRpc, bindChatRpc, chatRootInfoRpc, prepareChatRpc } from "./shared/rpc";
import { chatSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(chatSettings);
  const chats = createChatService({ store: new ChatStore(pluginDataDir()), settings });

  server.handle(prepareChatRpc, (input, { paseo }) => chats.prepare(paseo, input));
  server.handle(bindChatRpc, (input) => chats.bind(input));
  server.handle(abandonChatRpc, (input) => chats.abandon(input));
  server.handle(chatRootInfoRpc, () => chats.rootInfo());

  // Archiving keeps every file; the index only remembers when, for a later explicit cleanup.
  const removeArchiveHook = server.addHook("workspace.archive.after", async ({ workspace }) => {
    await chats.markArchived(workspace.id, workspace.archivedAt ?? new Date().toISOString());
  });

  return () => {
    removeArchiveHook();
  };
}
