import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { newNonce } from "./nonce";

export const NEW_CHAT_SCREEN = "new";

/** Sidebar items cannot navigate to agents; they open the New Chat page, which can. */
export function NewChatSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="MessageSquarePlus"
      active={currentScreen?.screenId === NEW_CHAT_SCREEN}
      onPress={() => openScreen({ screenId: NEW_CHAT_SCREEN, params: { nonce: newNonce() } })}
    />
  );
}
