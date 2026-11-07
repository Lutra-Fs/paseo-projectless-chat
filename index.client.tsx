import type { PluginClientContext } from "@getpaseo/plugin/client";
import { clearDrafts } from "./client/drafts";
import { messages } from "./client/messages";
import { newNonce } from "./client/nonce";
import { NewChatScreen } from "./client/new-chat-screen";
import { ProjectlessChatSettings } from "./client/settings-screen";
import { NEW_CHAT_SCREEN, NewChatSidebarItem } from "./client/sidebar-item";

/**
 * Naming: the plugin is "Projectless chat" (its settings page too); the action it adds is
 * "New chat"; the sidebar group the chats live in is the "Chats" project.
 */
export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addScreen({ id: NEW_CHAT_SCREEN, title: messages.message("newChat.title"), Component: NewChatScreen }),
    client.addSidebarHeaderItem({ id: "new-chat", title: messages.message("newChat.title"), Component: NewChatSidebarItem }),
    client.addCommandCenterItem({
      id: "new-chat",
      title: messages.message("newChat.title"),
      icon: "MessageSquarePlus",
      keywords: ["chat", "projectless", "no project", "聊天", "无项目"],
      context: "global",
      onSelect: ({ openScreen }) => openScreen({ screenId: NEW_CHAT_SCREEN, params: { nonce: newNonce() } }),
    }),
    client.addSettingsScreen({
      id: "projectless-chat",
      title: messages.message("plugin.name"),
      icon: "MessageSquarePlus",
      Component: ProjectlessChatSettings,
    }),
  ];
  return () => {
    for (const cleanup of cleanups) cleanup();
    clearDrafts();
  };
}
