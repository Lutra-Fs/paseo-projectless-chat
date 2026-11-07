import { mkdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { RootProblem } from "../shared/rpc";

/** Why a chat root cannot be used, or null. */
export async function rootProblem(root: string): Promise<RootProblem | null> {
  if (!isAbsolute(root)) return { code: "not_absolute" };
  const repo = await enclosingGitRoot(root);
  return repo ? { code: "inside_git", repo } : null;
}

/** English wording for errors that reach a toast or log as raw daemon text. */
export function describeRootProblem(problem: RootProblem): string {
  return problem.code === "not_absolute"
    ? "The chat folder must be an absolute path on the daemon host."
    : `The chat folder is inside the Git repository ${problem.repo}; chats would inherit its Git status.`;
}

/**
 * Creates the root and returns its real path. Symlinks are followed rather than refused, so a
 * root moved elsewhere with a link keeps working.
 */
export async function prepareRoot(root: string): Promise<string> {
  const problem = await rootProblem(root);
  if (problem) throw new Error(describeRootProblem(problem));
  await mkdir(root, { recursive: true });
  return realpath(root);
}

/** The nearest ancestor (or `start` itself) holding `.git`, checked on the real path. */
async function enclosingGitRoot(start: string): Promise<string | null> {
  let directory = await nearestExistingRealPath(resolve(start));
  for (;;) {
    if (await exists(join(directory, ".git"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

async function nearestExistingRealPath(path: string): Promise<string> {
  let candidate = path;
  for (;;) {
    try {
      return await realpath(candidate);
    } catch {
      const parent = dirname(candidate);
      if (parent === candidate) return candidate;
      candidate = parent;
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
