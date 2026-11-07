# New Chat

Start a chat without picking a project or folder. Press **New chat** in the sidebar, type your first message, pick a model and send. You land in Paseo's own chat page, and every message after the first uses Paseo's normal composer, tools and approvals.

## How it works

- When you send the first message, the plugin creates a folder on the daemon host: `$PASEO_HOME/scratch/<date>/<first words>-<id>`. It does not run `git init`.
- The chat becomes an ordinary Paseo workspace in a single project named **Chats**, so it shows up in the sidebar, survives restarts and can be resumed like any other workspace.
- Paseo names the chat from your first message. Renaming it later does not rename its folder.
- Archiving a chat keeps its files. **Discard** on the New chat page removes the folder only if the chat was never sent and the folder holds nothing else.

## Settings

Settings → Plugins → New chat:

- **Default model**: the model the New chat page starts with. Automatic uses the first ready provider's default model.
- **Chat folder** (advanced): where new chats are created on the daemon host. A folder inside a Git repository is refused. Existing chats keep their folders; nothing is moved.

## Limits

- The first message is plain text: slash commands, @ files, voice and attachments work from the second message on.
- On a remote host the plugin must be installed on that host's daemon, and folders are created there.
- Renaming the project to "Chats" uses the `paseo` CLI. Without it, the project keeps its folder's name, `scratch`.
