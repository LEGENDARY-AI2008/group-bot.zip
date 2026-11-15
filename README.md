# Group Bot

WhatsApp group-management bot with a pairing website. Each person opens the site,
enters their own number, gets a code, links it in WhatsApp, and their bot starts.

## Run locally

```bash
cp .env.example .env
npm install
npm start
```

Open http://localhost:3000, enter a number with country code (no +), then link it in
WhatsApp: Settings > Linked devices > Link a device > Link with phone number instead.

## Deploy on Render

- New Web Service, build command `npm install`, start command `npm start`.
- Use a paid instance (free ones sleep and the bots go offline).
- Add a Disk, e.g. mounted at `/data`, then set env vars:
  - `SESSIONS_DIR=/data/sessions`
  - `DB_PATH=/data/bot.db`
  - `MAX_SESSIONS=20` (raise it based on your instance memory; each number uses RAM)

Without a disk, every redeploy wipes the sessions and everyone has to pair again.

## Commands (20 group commands + menu + ping)

add, kick, promote, demote, tagall, tagadmins, hidetag, groupname, groupdesc,
grouplink, resetgrouplink, invite, announce, open, close, welcome, goodbye,
pin, unpin, groupstatus

Admin-only commands work for group admins and for the owner of the linked account.
The bot's number must be a group admin for add, kick, promote, demote, open, close,
name/description/link changes and pin.

## Adding more commands

Add an entry to `src/commands/group.js` (or a new file imported in `src/handler.js`):

```js
mycommand: {
  groupOnly: true, adminOnly: true, botAdminOnly: false,
  async run(ctx) { return ctx.reply('hello'); },
},
```

`ctx` gives you `sock`, `bot` (the paired number), `msg`, `jid`, `args`, `metadata`, `reply`, `botJid`.

## Notes

- Settings (welcome/goodbye text) are stored per paired number and per group in SQLite.
- Pairing endpoint is rate limited to 5 requests per IP per 10 minutes.
- Unfinished pairings are cleaned up after 3 minutes.
- Newer WhatsApp accounts can use LID-style ids in groups; if admin checks misbehave
  for some members, test with a normal number first and tell me what you see.
