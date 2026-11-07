import type { PaseoApi } from "./paseo-api";
import { renameProjectBestEffort } from "./cli";

export const CHATS_PROJECT_NAME = "Chats";

/**
 * One project groups every chat. A workspace's explicit `projectId` is authoritative even when
 * its folder is not under the project root, so a changed chat root keeps the same group.
 *
 * The SDK cannot add a bare project, so `workspaces.open(root)` creates one rooted at the chat
 * root and its placeholder workspace is archived right away.
 */
export async function ensureChatsProject(
  paseo: PaseoApi,
  knownProjectId: string | null,
  root: string,
): Promise<string> {
  if (knownProjectId) {
    const { projects } = await paseo.projects.list();
    if (projects.some((project) => project.projectId === knownProjectId)) return knownProjectId;
  }
  const placeholder = await paseo.workspaces.open(root);
  const projectId = placeholder.projectId;
  if (!projectId) throw new Error("The daemon did not report a project for the chat folder.");
  await placeholder.archive().catch((error: unknown) => {
    console.warn(`[new-chat] could not archive the placeholder workspace: ${String(error)}`);
  });
  void renameProjectBestEffort(projectId, CHATS_PROJECT_NAME);
  return projectId;
}
