import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { delimiter, join } from "node:path";

const TIMEOUT_MS = 10_000;

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** `PASEO_CLI` (set by Paseo desktop), then `paseo` on PATH. */
async function findCli(): Promise<string | null> {
  const configured = process.env.PASEO_CLI;
  if (configured && (await executable(configured))) return configured;
  const names = process.platform === "win32" ? ["paseo.cmd", "paseo.exe", "paseo"] : ["paseo"];
  for (const entry of (process.env.PATH ?? "").split(delimiter)) {
    for (const name of names) {
      const candidate = join(entry || process.cwd(), name);
      if (await executable(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * The SDK has no project rename, so the CLI does it. Best effort: without a CLI the project
 * keeps the name derived from its folder and everything else works the same.
 */
export async function renameProjectBestEffort(projectId: string, name: string): Promise<boolean> {
  const cli = await findCli();
  if (!cli) return false;
  return new Promise((resolveRename) => {
    execFile(
      cli,
      ["project", "rename", projectId, name, "--json"],
      { timeout: TIMEOUT_MS, env: process.env, shell: process.platform === "win32" },
      (error) => {
        if (error) console.warn(`[projectless-chat] project rename via CLI failed: ${error.message}`);
        resolveRename(!error);
      },
    );
  });
}
