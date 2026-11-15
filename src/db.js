import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const dbPath = process.env.DB_PATH || './data/bot.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Everything is stored per bot number (each paired number is its own bot) and,
// where it applies, per group.
db.exec(`
  CREATE TABLE IF NOT EXISTS group_settings (
    bot TEXT NOT NULL,
    jid TEXT NOT NULL,
    welcome_enabled INTEGER NOT NULL DEFAULT 0,
    welcome_text TEXT,
    goodbye_enabled INTEGER NOT NULL DEFAULT 0,
    goodbye_text TEXT,
    PRIMARY KEY (bot, jid)
  );

  -- on/off switches and small settings per group (antilink, slowmode, ...)
  CREATE TABLE IF NOT EXISTS flags (
    bot TEXT NOT NULL,
    jid TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (bot, jid, key)
  );

  -- per member state: warn counts, jail, mute, ban
  CREATE TABLE IF NOT EXISTS member_state (
    bot TEXT NOT NULL,
    jid TEXT NOT NULL,
    user TEXT NOT NULL,
    kind TEXT NOT NULL,
    value TEXT,
    until INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bot, jid, user, kind)
  );

  -- settings for the whole bot number (mode, prefix, sudo list, anticall)
  CREATE TABLE IF NOT EXISTS bot_settings (
    bot TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (bot, key)
  );
`);

const ALLOWED = ['welcome_enabled', 'welcome_text', 'goodbye_enabled', 'goodbye_text'];

export function getGroup(bot, jid) {
  db.prepare('INSERT OR IGNORE INTO group_settings (bot, jid) VALUES (?, ?)').run(bot, jid);
  return db.prepare('SELECT * FROM group_settings WHERE bot = ? AND jid = ?').get(bot, jid);
}

export function setGroupField(bot, jid, field, value) {
  if (!ALLOWED.includes(field)) throw new Error(`Field not allowed: ${field}`);
  getGroup(bot, jid);
  db.prepare(`UPDATE group_settings SET ${field} = ? WHERE bot = ? AND jid = ?`).run(value, bot, jid);
}

// ---- flags -------------------------------------------------------------
export function getFlag(bot, jid, key, def = null) {
  const row = db.prepare('SELECT value FROM flags WHERE bot = ? AND jid = ? AND key = ?').get(bot, jid, key);
  return row ? row.value : def;
}

export function setFlag(bot, jid, key, value) {
  db.prepare(
    'INSERT INTO flags (bot, jid, key, value) VALUES (?, ?, ?, ?) ON CONFLICT(bot, jid, key) DO UPDATE SET value = excluded.value'
  ).run(bot, jid, key, String(value));
}

// ---- member state ------------------------------------------------------
export function getMember(bot, jid, user, kind) {
  return db
    .prepare('SELECT value, until FROM member_state WHERE bot = ? AND jid = ? AND user = ? AND kind = ?')
    .get(bot, jid, user, kind);
}

export function setMember(bot, jid, user, kind, value = '', until = 0) {
  db.prepare(
    `INSERT INTO member_state (bot, jid, user, kind, value, until) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(bot, jid, user, kind) DO UPDATE SET value = excluded.value, until = excluded.until`
  ).run(bot, jid, user, kind, String(value), until);
}

export function delMember(bot, jid, user, kind) {
  db.prepare('DELETE FROM member_state WHERE bot = ? AND jid = ? AND user = ? AND kind = ?').run(bot, jid, user, kind);
}

export function clearMembers(bot, jid, kind) {
  db.prepare('DELETE FROM member_state WHERE bot = ? AND jid = ? AND kind = ?').run(bot, jid, kind);
}

export function listMembers(bot, jid, kind) {
  return db
    .prepare('SELECT user, value, until FROM member_state WHERE bot = ? AND jid = ? AND kind = ? ORDER BY user')
    .all(bot, jid, kind);
}

// ---- bot settings ------------------------------------------------------
export function getBotSetting(bot, key, def = null) {
  const row = db.prepare('SELECT value FROM bot_settings WHERE bot = ? AND key = ?').get(bot, key);
  return row ? row.value : def;
}

export function setBotSetting(bot, key, value) {
  db.prepare(
    'INSERT INTO bot_settings (bot, key, value) VALUES (?, ?, ?) ON CONFLICT(bot, key) DO UPDATE SET value = excluded.value'
  ).run(bot, key, String(value));
}
