# End-to-end test on a real machine

Two parts. Part 1 is automated and runs against a **separate, throwaway daemon** so your real Paseo is untouched. Part 2 is the UI, checked by a person in the Paseo app.

## Part 1: automated (an agent can run this)

Paste this into Claude Code on the machine (Sonnet is enough):

> Run the end-to-end test of the Paseo plugin in this repository, following docs/E2E.md Part 1 exactly. Do not touch my normal Paseo daemon or `~/.paseo`; use only the throwaway daemon home and port below. Do not change plugin code. At the end, stop the throwaway daemon and report every PASS/FAIL/WARN line, plus anything unexpected from the daemon log.

Steps:

1. Get the code and dependencies:
   ```bash
   git clone https://github.com/Lutra-Fs/paseo-projectless-chat && cd paseo-projectless-chat && npm ci
   ```
   (Or `git pull && npm ci` in an existing clone.) Then `npm run typecheck && npm test`.
2. Find the `paseo` CLI: `command -v paseo`. On macOS with only the desktop app, look for the CLI bundled in `/Applications/Paseo.app` (for example `find /Applications/Paseo.app -name paseo -type f -perm -u+x`). Use the same CLI for every command below and export it, e.g. `export PASEO_CLI="$(command -v paseo)"`.
3. Create the throwaway daemon (home `~/.paseo-e2e`, port 6799):
   ```bash
   export E2E_HOME="$HOME/.paseo-e2e"
   mkdir -p "$E2E_HOME"
   paseo daemon config set daemon.listen 127.0.0.1:6799 --home "$E2E_HOME"
   paseo daemon config set pluginsEnabled true --home "$E2E_HOME"
   paseo daemon start --home "$E2E_HOME"
   ```
   If `config set` refuses before the home exists, start once, stop, then set and start again.
4. Install the plugin **from GitHub** (this is the path users take):
   ```bash
   paseo plugin install git:Lutra-Fs/paseo-projectless-chat --home "$E2E_HOME"
   paseo plugin ls --home "$E2E_HOME"
   ```
   Status must be `running`. If not, `paseo plugin logs paseo-projectless-chat --home "$E2E_HOME"` and stop here with the error.
5. List models, then pick a cheap, fast one (e.g. a Haiku or mini model):
   ```bash
   node scripts/e2e.mjs --url ws://127.0.0.1:6799/ws
   ```
6. Run the flow. Agents will be asked to write one file each in their chat folder; `--allow-permissions` approves those prompts automatically:
   ```bash
   node scripts/e2e.mjs --url ws://127.0.0.1:6799/ws --model <provider/model> --allow-permissions
   ```
7. Restart and check recovery:
   ```bash
   paseo daemon restart --home "$E2E_HOME"
   node scripts/e2e.mjs --url ws://127.0.0.1:6799/ws --after-restart --allow-permissions
   ```
8. Clean up: `paseo daemon stop --home "$E2E_HOME"`. Keep `~/.paseo-e2e` until the results are reviewed; it holds `daemon.log` and the chat folders under `chats/`.

Expected: every line PASS. `WARN project is named Chats` means the daemon could not find the `paseo` CLI (the project then keeps the name `chats`); report it, it is not a failure.

## Part 2: UI (a person, about 10 minutes)

On your normal Paseo with the plugin installed (`paseo plugin install git:Lutra-Fs/paseo-projectless-chat`). Desktop first, then web or phone if you use them.

1. Settings → Plugins lists the plugin as **Projectless Chat** (Chinese UI: 无项目聊天). Sidebar shows **New chat** (新聊天). Pressing it opens a page with a message box and a model chip. **⌘K → "New chat"** opens the same page.
2. Model chip lists your models; the choice sticks for that page. Settings → Plugins → Projectless chat → Default model changes the initial choice.
3. Typing Chinese with an IME: pressing Enter to confirm a candidate must **not** send. Enter sends, Shift+Enter makes a new line (desktop/web). On phones, the send button sends.
4. Type a message, leave the page, come back via browser back: the draft is still there. **Discard** empties it.
5. Send. You land on Paseo's normal chat page and the reply streams. The sidebar has the chat under **Chats** (or `chats`), titled from your message.
6. Ask it to create a file. The permission prompt appears in the normal approval UI; approve it. The file appears in `~/.paseo/chats/<date>/<folder>/`.
7. Rename the chat: its folder name stays the same.
8. Send a second message from Paseo's own composer: slash commands and @ files work here.
9. Archive the chat: its folder and files remain on disk.
10. Note what the chat page still shows of a "project": the project header, the folder path, Git/Changes panels, branch pickers. Screenshots help decide whether a core Paseo change is worth proposing.
11. Switch the app language to Chinese and back: the New chat page and settings follow without losing the draft.
12. Settings → Plugins → Projectless chat → Chat folder: enter a path inside a Git repository → it is refused. Enter another plain folder → the next new chat goes there; earlier chats stay where they were, still under the same Chats group.
