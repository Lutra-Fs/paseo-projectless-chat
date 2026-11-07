# Paseo Projectless Chat

A [Paseo](https://paseo.sh) plugin that adds **New chat**: start a chat without picking a project or folder. See [OVERVIEW.md](OVERVIEW.md) for what it does and its settings.

## Install

```bash
paseo plugin install git:Lutra-Fs/paseo-projectless-chat
```

Requires Paseo `>=0.15.3` with `pluginsEnabled` on. Plugins are trusted, unsandboxed code.

## How it is built

- **Sidebar → New chat page** (`client/new-chat-screen.tsx`). Sidebar items cannot open agents, so the item opens a plugin screen carrying a one-time `nonce`; the screen collects the first message and model.
- **`chat.prepare`** (`server/chats.ts`) claims `$PASEO_HOME/scratch/<YYYY-MM-DD>/<slug>-<id>` with a non-recursive `mkdir`, makes sure the shared **Chats** project exists, and pre-assigns the agent id. Same nonce → same chat.
- The client then calls `workspaces.create` once with `projectId`, `firstAgentContext` (so Paseo names the workspace from the message), a pre-assigned `agentId`, and `idempotencyKey: nonce`; `chat.bind` records the workspace and `navigation.openAgent` hands over to Paseo's native chat page.
- The plugin index lives in `$PASEO_HOME/plugin-data/paseo-projectless-chat/state.json`. Archiving keeps files; nothing is deleted automatically.

## Develop

```bash
npm install
npm run typecheck
npm test
paseo plugin install "$PWD"
```
