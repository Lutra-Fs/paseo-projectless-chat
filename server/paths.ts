import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** The daemon's home, resolved as the daemon resolves it (`resolvePaseoHome`). The subprocess inherits its env. */
export function paseoHome(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.PASEO_HOME || "~/.paseo";
  const expanded = raw === "~" ? homedir() : raw.replace(/^~(?=[\\/])/, homedir());
  return resolve(expanded);
}

export const pluginDataDir = (env?: NodeJS.ProcessEnv) =>
  join(paseoHome(env), "plugin-data", "paseo-projectless-chat");

/** Named like the Chats project, so a project the CLI could not rename still reads "chats". */
export const defaultChatRoot = (env?: NodeJS.ProcessEnv) => join(paseoHome(env), "chats");
