import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const dbPath = process.env.DB_PATH || './data/bot.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Settings are stored per bot number AND per group, so each paired
// number keeps its own welcome/goodbye settings.
db.exec(`
  CREATE TABLE IF NOT EXISTS group_settings (
    bot TEXT NOT NULL,
    jid TEXT NOT NULL,
    welcome_enabled INTEGER NOT NULL DEFAULT 0,
    welcome_text TEXT,
    goodbye_enabled INTEGER NOT NULL DEFAULT 0,
    goodbye_text TEXT,
    PRIMARY KEY (bot, jid)
  )
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
