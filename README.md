<<<<<<< HEAD
# IBK Nexus MD

A modular WhatsApp Multi-Device assistant built with Node.js and Baileys. It combines group administration, configurable protection, conversational AI, reminders, games, media tools, SQLite persistence, health monitoring, and a local plugin architecture.

> **Repository/source note:** The supplied GitLab URL for `fanueldx25/panda-md2` could not be retrieved in the execution environment (the GitLab page, raw-file endpoint, API endpoint, and direct clone were unavailable). This repository is therefore an independently written, clean-room implementation based on the requested bot category and current public Baileys documentation. It is not represented as a line-by-line reverse engineering, fork, or reproduction of `panda-md2`.

## Feature set

### WhatsApp connection
- Multi-device WhatsApp Web session using Baileys.
- QR pairing in the terminal, or optional phone-number pairing code.
- Session state saved locally in `auth/`.
- Reconnection with capped exponential backoff.
- Logged-out session detection rather than endless reconnect loops.
- Incoming-message de-duplication and event filtering.

### Command system
- Modular command registry with aliases, categories, descriptions, and per-command cooldowns.
- Group-specific command prefixes.
- Owner-only, group-only, administrator-only, and bot-administrator checks.
- Automatic help catalogue.
- Local plugin modules; no remote code execution or automatic installation of untrusted plugins.

### Group management and protection
- Group information and administrator list.
- Configurable welcome and goodbye messages (`$user`, `$group` placeholders).
- Group rules that administrators can set and members can read.
- Link protection with administrator exemptions.
- Anti-flood detection with a short cooldown.
- Member warning records, warning lookup, and reset.
- Temporary member mutes, kick, promote, and demote commands.
- Message deletion and group polls.

### AI and productivity
- Optional OpenAI-compatible chat completion integration.
- Per-user/per-chat conversation memory stored in SQLite.
- `.forgetai` command to delete the caller's saved AI history.
- Persistent reminders that survive process restarts.

### Media and entertainment
- Convert received or quoted images to WebP WhatsApp stickers.
- Dice, rock-paper-scissors, and short quiz games.
- Message reactions.

### Operations
- SQLite database with WAL mode.
- Structured Pino logs with basic secret redaction.
- `/healthz` endpoint for process/WhatsApp connection health.
- Token-protected `/metrics` endpoint for runtime and database counters.
- Dockerfile, Docker Compose volumes, and PM2 ecosystem configuration.

## Requirements

- Node.js 20 or later (Node.js 22 recommended).
- npm 10 or later.
- A WhatsApp account to link as a companion device.
- Persistent storage for `auth/` and `data/`.

This project pins `@whiskeysockets/baileys` to `6.7.24`. Baileys 7 introduces breaking changes, so this implementation deliberately targets the patched 6.x line rather than adopting a release candidate without migrating and testing the socket integration. Review the Baileys migration guide before changing major versions.

## Quick start (local)

### 1. Get the project

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/ibk-nexus-md.git
cd ibk-nexus-md
```

Or download the repository ZIP and extract it.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
BOT_NAME=IBK Nexus MD
PREFIX=.
OWNER_NUMBERS=2348012345678
PAIRING_NUMBER=
AUTH_DIR=./auth
DATABASE_PATH=./data/nexus.sqlite
PORT=3000
LOG_LEVEL=info
AUTO_READ=false
FLOOD_LIMIT=6
FLOOD_WINDOW_SECONDS=8
COMMAND_COOLDOWN_SECONDS=2
WARN_LIMIT=3
MAX_REMINDER_HOURS=168

# Optional AI support
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
AI_MAX_TOKENS=700
AI_MEMORY_TURNS=8

# Optional token-protected metrics endpoint
HEALTH_TOKEN=
```

`OWNER_NUMBERS` must contain phone numbers in international format without `+`, spaces, or punctuation. Separate multiple owners with commas. Example: `2348012345678,447700900123`.

### 4. Link WhatsApp

**QR method (default):** leave `PAIRING_NUMBER` empty and run:

```bash
npm start
```

A QR code appears in the terminal. On the phone, open WhatsApp → Linked devices → Link a device, then scan it.

**Pairing-code method:** stop the app, set `PAIRING_NUMBER` to the WhatsApp phone number in international format without `+`, then restart:

```env
PAIRING_NUMBER=2348012345678
```

The pairing code will appear in the terminal. On the phone, open WhatsApp → Linked devices → Link with phone number instead, then enter the code. Do not share QR codes or pairing codes with anyone.

### 5. Verify the service

Open:

```text
http://localhost:3000/healthz
```

A healthy response looks like:

```json
{
  "status": "ok",
  "whatsapp": "open",
  "uptimeSeconds": 42
}
```

The endpoint returns HTTP 503 while WhatsApp is not connected. Metrics require a configured `HEALTH_TOKEN`:

```bash
curl -H "Authorization: Bearer YOUR_HEALTH_TOKEN" http://localhost:3000/metrics
```

## Commands

The default prefix is `.`. Group administrators can change a group's prefix using `.setprefix !`.

| Command | Purpose | Access |
|---|---|---|
| `.help` | Command catalogue | Everyone |
| `.ping` | Response time | Everyone |
| `.uptime` | Runtime and memory | Everyone |
| `.botinfo` | Bot/database summary | Everyone |
| `.id` | Chat, sender, quote and mention IDs | Everyone |
| `.myactivity` | Your chat activity counters | Everyone |
| `.ai <question>` | Ask the configured AI | Everyone, when configured |
| `.forgetai` | Delete your AI memory in this chat | Everyone |
| `.remind 25m <text>` | Schedule a reminder | Everyone |
| `.react ❤️` | React to a quoted message | Everyone |
| `.sticker` | Convert a received/quoted image to a sticker | Everyone |
| `.roll 2d20` | Roll dice | Everyone |
| `.rps rock` | Rock-paper-scissors | Everyone |
| `.quiz` | Start a quiz | Everyone |
| `.quizanswer 2` | Answer the current quiz | Everyone |
| `.groupinfo` | Group metadata | Group |
| `.admins` | List group admins | Group |
| `.rules` | Display group rules | Group |
| `.setrules <text>` | Update group rules | Group admins |
| `.welcome on/off` | Toggle welcome messages | Group admins |
| `.setwelcome <text>` | Set welcome template | Group admins |
| `.goodbye on/off` | Toggle goodbye messages | Group admins |
| `.setgoodbye <text>` | Set goodbye template | Group admins |
| `.antilink on/off` | Toggle link protection | Group admins + bot admin |
| `.antiflood on/off` | Toggle anti-flood protection | Group admins + bot admin |
| `.warn @member <reason>` | Add a warning | Group admins |
| `.warnings @member` | Check warnings | Group admins |
| `.clearwarn @member` | Reset warnings | Group admins |
| `.mute @member 10m` | Temporarily mute a member | Group admins + bot admin |
| `.unmute @member` | Remove a mute | Group admins |
| `.kick @member` | Remove a member | Group admins + bot admin |
| `.promote @member` | Promote a member | Group admins + bot admin |
| `.demote @member` | Demote a member | Group admins + bot admin |
| `.delete` | Delete a quoted message | Group admins |
| `.poll Question? \| Option A \| Option B` | Create a poll | Group |
| `.setprefix !` | Change prefix for current group | Group admins |

For commands using `@member`, mention the member or reply to one of their messages. The bot must have group administrator rights for commands that delete other members' messages or change membership roles. A mute is enforced by removing messages while its timer is active; it does not change WhatsApp's native participant permissions.

## Optional AI setup

Add an API key to `.env`:

```env
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-4o-mini
```

The integration uses the OpenAI-compatible `/chat/completions` endpoint. You can supply another compatible provider by changing `OPENAI_BASE_URL`, `OPENAI_MODEL`, and the key. Do not commit your `.env` file. AI history is stored on disk in the SQLite database; users can call `.forgetai` to clear their own history in the current chat.

## Docker deployment

The included Compose file uses persistent named volumes for the WhatsApp auth state and SQLite database.

```bash
cp .env.example .env
# Edit .env before starting.
docker compose up -d --build
docker compose logs -f nexus-md
```

To stop:

```bash
docker compose down
```

Do not remove the named volumes when updating the container. Removing the auth volume unlinks the WhatsApp session; removing the data volume deletes the database.

## VPS deployment with PM2

```bash
npm install
npm install --global pm2
cp .env.example .env
# Edit .env
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Keep one running instance for one WhatsApp session. Back up `auth/` and `data/` securely. Restrict access to the auth directory and never upload session credentials to GitHub.

## Hosting notes

This is a **long-running WebSocket worker**, not a serverless function. Do not deploy it as a Vercel Function: WhatsApp requires a continuously connected socket and persistent authentication storage. Use a VPS, Docker-capable host, or a worker service with a persistent disk. Ensure both `AUTH_DIR` and `DATABASE_PATH` point to persistent storage. Run one bot process per linked account/session.

## Add a local plugin

Create a file in `src/plugins/`, export an array of command definitions, then import and add it in `src/registry.js`:

```js
export default [
  {
    name: 'hello',
    aliases: ['hi'],
    category: 'Custom',
    description: 'Reply with a greeting',
    handler: async ctx => ctx.reply('Hello from your custom plugin.')
  }
];
```

The dispatcher supports these optional properties:

- `groupOnly: true`
- `ownerOnly: true`
- `adminOnly: true`
- `botAdminOnly: true`
- `cooldown: 5000` (milliseconds)
- `hidden: true`

Do not add arbitrary remote-code installers. Review plugin source before loading it because plugins run with the bot process's permissions and can access its WhatsApp session and database.

## Data and privacy

- `auth/` contains WhatsApp session credentials. Treat it like a password vault.
- `data/nexus.sqlite` contains group settings, moderation records, reminders, AI conversation history and basic activity counts.
- `.forgetai` deletes the caller's AI history from the current chat.
- Activity counters are limited to chat and sender identifiers, counts, and last-seen timestamps.
- `HEALTH_TOKEN` protects the metrics endpoint. `/healthz` intentionally exposes only connection state and uptime for health probes.
- The bot does not include unsolicited bulk DM/broadcast commands, remote shell commands, credential extraction, or stealth surveillance features.

## WhatsApp and compliance notice

This project uses an **unofficial WhatsApp Web client library**. It is not affiliated with or endorsed by WhatsApp. Use it only with an account you control, respect group rules and participant privacy, and avoid unsolicited messages or high-volume automation. WhatsApp may restrict accounts that violate its terms. For production customer communication and business messaging, prefer the official WhatsApp Business Platform and its opt-in/message-template rules.

## Troubleshooting

**The QR code does not appear**
- Ensure `PAIRING_NUMBER` is empty to use QR mode.
- Check that the terminal can render text output.
- Remove stale auth files only when you intend to pair the device again.

**The bot keeps reconnecting**
- Check network connectivity and whether the linked device was removed from WhatsApp.
- Inspect terminal logs for the disconnect status.
- If the session is logged out, remove the local `auth/` folder and pair again.

**Moderation commands cannot delete messages or update members**
- Promote the bot's linked WhatsApp account to group administrator.
- Make sure the issuing user is also a group administrator.

**SQLite native module fails to install**
- Use Node.js 20 or 22 and a supported platform.
- On Linux, install the build tools (`python3`, `make`, `g++`) before `npm install`.

## Checks

Run syntax checks with:

```bash
npm run check
```

The syntax check validates the project JavaScript files. Live pairing, message delivery, image processing, AI provider calls and group actions must be tested with a real WhatsApp account and configured environment.

## License

MIT. See [LICENSE](./LICENSE). Baileys and other dependencies remain under their respective licenses.
=======
# IBK-Nexus-MD
A bot operator
>>>>>>> fcecc2ee8e7752198821a14bca3019cf91963337
