import type { PluginClientContext } from "@getpaseo/plugin/client";
import { clearDrafts } from "./client/drafts";
import { newNonce } from "./client/nonce";
import { NewChatScreen } from "./client/new-chat-screen";
import { NewChatSettings } from "./client/settings-screen";
import { NEW_CHAT_SCREEN, NewChatSidebarItem } from "./client/sidebar-item";

export default function contribute(client: PluginClientContext) {
  const cleanups = [
    client.addScreen({ id: NEW_CHAT_SCREEN, title: "New chat", Component: NewChatScreen }),
    client.addSidebarHeaderItem({ id: "new-chat", title: "New chat", Component: NewChatSidebarItem }),
    client.addCommandCenterItem({
      id: "new-chat",
      title: "New chat",
      icon: "MessageSquarePlus",
      keywords: ["chat", "scratch", "no project"],
      context: "global",
      onSelect: ({ openScreen }) => openScreen({ screenId: NEW_CHAT_SCREEN, params: { nonce: newNonce() } }),
    }),
    client.addSettingsScreen({ id: "new-chat", title: "New chat", icon: "MessageSquarePlus", Component: NewChatSettings }),
  ];
  return () => {
    for (const cleanup of cleanups) cleanup();
    clearDrafts();
  };
}
