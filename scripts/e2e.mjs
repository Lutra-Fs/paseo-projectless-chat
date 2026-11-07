#!/usr/bin/env node
/**
 * End-to-end check of the projectless chat flow against a running daemon with this plugin installed.
 * It drives the same calls the New chat page makes (chat.prepare → workspaces.create → chat.bind)
 * and then checks folders, project grouping, titles, permissions, follow-ups and archive.
 *
 *   node scripts/e2e.mjs --url ws://127.0.0.1:6799/ws --model claude/<model-id> [--allow-permissions]
 *   node scripts/e2e.mjs --url ... --after-restart        # run after restarting the daemon
 *
 * Without --model it lists the models the daemon offers and exits.
 * State between the two runs is kept in --report (default ./e2e-report.json).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createPaseoApi } from "@getpaseo/client";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";

const PLUGIN = "paseo-projectless-chat";
const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "ws://127.0.0.1:6767/ws" },
    password: { type: "string" },
    model: { type: "string" },
    "allow-permissions": { type: "boolean", default: false },
    "after-restart": { type: "boolean", default: false },
    "turn-timeout": { type: "string", default: "300" },
    report: { type: "string", default: "e2e-report.json" },
  },
});
const turnTimeoutMs = Number(args["turn-timeout"]) * 1000;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
const note = (message) => console.log(`      ${message}`);
/** Best-effort behaviour: reported, never fails the run. */
function warn(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "WARN"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const dc = new DaemonClient({
  url: args.url,
  clientId: "projectless-chat-e2e",
  ...(args.password ? { password: args.password } : {}),
});
await dc.connect();
const paseo = createPaseoApi(dc);
const rpc = (method, input) => dc.invokePluginRpc(PLUGIN, method, input);

async function listModels() {
  const snapshot = await paseo.providers.waitForReady({ timeoutMs: 60_000 });
  const compact = new Map((snapshot.compactSnapshot?.entries ?? []).map((e) => [e.provider, e.models ?? []]));
  return snapshot.entries
    .filter((e) => e.enabled !== false && e.status === "ready")
    .flatMap((e) => (e.models?.length ? e.models : compact.get(e.provider) ?? []).map((m) => `${e.provider}/${m.id}`));
}

/** Waits for the turn, answering permission prompts when allowed; otherwise leaves them for a human in the app. */
async function finishTurn(label, agentId) {
  const agent = paseo.agents.ref(agentId);
  for (let round = 0; round < 10; round++) {
    const run = await agent.waitForFinish(turnTimeoutMs);
    if (run.status !== "permission") return run;
    const pending = run.final?.pendingPermissions ?? (await agent.refresh())?.agent.pendingPermissions ?? [];
    for (const request of pending) {
      note(`${label}: permission requested — ${request.title ?? request.name ?? request.kind}`);
      if (args["allow-permissions"]) {
        await agent.respondToPermission({ requestId: request.id, response: { behavior: "allow" } });
      } else {
        note(`${label}: approve or deny it in the Paseo app now (waiting)…`);
      }
    }
  }
  return { status: "timeout", lastMessage: null, error: "too many permission rounds", final: null };
}

async function newChat(nonce, text, model) {
  const chat = await rpc("chat.prepare", { nonce, text });
  if (chat.status !== "active") {
    const workspace = await paseo.workspaces.create({
      idempotencyKey: nonce,
      source: { kind: "directory", path: chat.dir, projectId: chat.projectId },
      firstAgentContext: { prompt: text },
      agent: { agentId: chat.agentId, cwd: chat.dir, config: { provider: model }, prompt: text },
    });
    await rpc("chat.bind", { nonce, workspaceId: workspace.id });
  }
  return rpc("chat.prepare", { nonce, text });
}

async function workspaceById(id) {
  const { entries } = await paseo.workspaces.list({ filter: { includeBackground: true }, page: { limit: 200 } });
  return entries.find((w) => w.id === id) ?? null;
}

try {
  const info = await rpc("chat.root-info", {}).catch((error) => ({ error }));
  check("plugin is installed and answers", !info.error, info.error ?? info.effectiveRoot);
  if (info.error) throw new Error("Install the plugin on this daemon first.");

  if (!args["after-restart"]) {
    const models = await listModels();
    if (!args.model) {
      console.log("Models offered by this daemon (pass one with --model):");
      for (const m of models) console.log(`  ${m}`);
      process.exit(0);
    }
    check("model is offered", models.includes(args.model), args.model);

    const run = Date.now().toString(36);
    const promptA = "Create a file named e2e-a.txt in the current directory containing the single word alpha. Then reply with DONE.";
    const promptB = "在当前目录创建文件 e2e-b.txt，内容只有 beta 一个词。然后回复：完成";
    const a = await newChat(`e2ea${run}`, promptA, args.model);
    const b = await newChat(`e2eb${run}`, promptB, args.model);
    note(`A: ${a.dir}`);
    note(`B: ${b.dir}`);

    check("each chat has its own folder", a.dir !== b.dir);
    check("both chats are in one project", a.projectId === b.projectId, a.projectId);
    check("folders are under the chat root", a.dir.startsWith(info.effectiveRoot) && b.dir.startsWith(info.effectiveRoot));
    check("folder name carries the first words (English)", /create-a-file-named/.test(a.chatId), a.chatId);
    // B's prompt is Chinese with ASCII words mixed in: only the ASCII words reach the folder name.
    check("folder name is ASCII for Chinese text", /^[a-z0-9-]+$/.test(b.chatId) && /[a-z0-9]{8}$/.test(b.chatId), b.chatId);
    check("no git repository is created", !existsSync(join(a.dir, ".git")) && !existsSync(join(b.dir, ".git")));
    const again = await newChat(`e2ea${run}`, promptA, args.model);
    check("same nonce reuses the chat", again.agentId === a.agentId && again.workspaceId === a.workspaceId);

    const [runA, runB] = await Promise.all([finishTurn("A", a.agentId), finishTurn("B", b.agentId)]);
    check("chat A first turn finishes", runA.status === "idle", runA.status + (runA.error ? ` ${runA.error}` : ""));
    check("chat B first turn finishes", runB.status === "idle", runB.status + (runB.error ? ` ${runB.error}` : ""));
    check("A's file is in A's folder only", existsSync(join(a.dir, "e2e-a.txt")) && !existsSync(join(b.dir, "e2e-a.txt")), readdirSync(a.dir).join(","));
    check("B's file is in B's folder only", existsSync(join(b.dir, "e2e-b.txt")) && !existsSync(join(a.dir, "e2e-b.txt")), readdirSync(b.dir).join(","));

    const agentA = (await paseo.agents.ref(a.agentId).refresh())?.agent;
    check("agent cwd is the chat folder", agentA?.cwd === a.dir, agentA?.cwd);
    check("agent title comes from the first message", Boolean(agentA?.title), agentA?.title);

    await new Promise((r) => setTimeout(r, 10_000)); // metadata generation is asynchronous
    const wsA = await workspaceById(a.workspaceId);
    const { projects } = await paseo.projects.list();
    const chatsProject = projects.find((p) => p.projectId === a.projectId);
    check("workspace has a title", Boolean(wsA?.title || wsA?.name), wsA?.title ?? wsA?.name);
    warn("project is named Chats (needs the paseo CLI on the daemon's PATH or PASEO_CLI)", chatsProject?.projectDisplayName === "Chats", chatsProject?.projectDisplayName);

    await paseo.agents.ref(a.agentId).send("What is the name of the file you created? Answer with the file name only.");
    const follow = await finishTurn("A follow-up", a.agentId);
    check("follow-up message works", follow.status === "idle" && /e2e-a\.txt/i.test(follow.lastMessage ?? ""), follow.lastMessage?.slice(0, 80));

    const before = readdirSync(b.dir).sort().join(",");
    await paseo.workspaces.archive(b.workspaceId);
    await new Promise((r) => setTimeout(r, 2000));
    check("archiving keeps the folder and its files", existsSync(b.dir) && readdirSync(b.dir).sort().join(",") === before, before);

    writeFileSync(args.report, JSON.stringify({ a, b, results }, null, 2));
    console.log(`\nNow restart the daemon, then run again with --after-restart (state saved in ${args.report}).`);
  } else {
    const saved = JSON.parse(readFileSync(args.report, "utf8"));
    const a = await rpc("chat.prepare", { nonce: saved.a.nonce, text: "x" });
    check("chat index survives restart", a.status === "active" && a.workspaceId === saved.a.workspaceId);
    const agent = (await paseo.agents.ref(a.agentId).refresh())?.agent;
    check("agent survives restart", agent?.cwd === saved.a.dir, agent?.title);
    await paseo.agents.ref(a.agentId).send("Reply with the single word RESUMED.");
    const resumed = await finishTurn("A after restart", a.agentId);
    check("chat can be resumed after restart", resumed.status === "idle", resumed.lastMessage?.slice(0, 80));
    const b = await rpc("chat.prepare", { nonce: saved.b.nonce, text: "x" });
    check("archived chat's folder still exists", existsSync(b.dir));
  }
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  await dc.close().catch(() => {});
  process.exitCode = failed.length ? 1 : 0;
}
