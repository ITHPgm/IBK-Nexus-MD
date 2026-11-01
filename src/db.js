import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY (scope, key)
  );
  CREATE TABLE IF NOT EXISTS warnings (
    chat_id TEXT NOT NULL, user_id TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL, PRIMARY KEY(chat_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS muted_users (
    chat_id TEXT NOT NULL, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
    reason TEXT DEFAULT '', PRIMARY KEY(chat_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS ai_memory (
    chat_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
    content TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ai_memory_lookup ON ai_memory(chat_id, user_id, created_at);
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL, text TEXT NOT NULL, due_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reminders_due ON reminders(due_at);
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT, user_id TEXT,
    action TEXT NOT NULL, details TEXT DEFAULT '', created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS message_stats (
    chat_id TEXT NOT NULL, user_id TEXT NOT NULL, messages INTEGER NOT NULL DEFAULT 0,
    last_seen INTEGER NOT NULL, PRIMARY KEY(chat_id, user_id)
  );
`);

export function getSetting(scope, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE scope = ? AND key = ?').get(scope, key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(scope, key, value) {
  db.prepare(`INSERT INTO settings(scope,key,value) VALUES(?,?,?)
    ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value`)
    .run(scope, key, JSON.stringify(value));
}

export function addWarning(chatId, userId) {
  const now = Date.now();
  db.prepare(`INSERT INTO warnings(chat_id,user_id,count,updated_at) VALUES(?,?,1,?)
    ON CONFLICT(chat_id,user_id) DO UPDATE SET count=count+1,updated_at=excluded.updated_at`)
    .run(chatId, userId, now);
  return db.prepare('SELECT count FROM warnings WHERE chat_id=? AND user_id=?').get(chatId, userId)?.count || 1;
}

export function getWarnings(chatId, userId) {
  return db.prepare('SELECT count FROM warnings WHERE chat_id=? AND user_id=?').get(chatId, userId)?.count || 0;
}

export function clearWarnings(chatId, userId) {
  db.prepare('DELETE FROM warnings WHERE chat_id=? AND user_id=?').run(chatId, userId);
}

export function muteUser(chatId, userId, expiresAt, reason = '') {
  db.prepare(`INSERT INTO muted_users(chat_id,user_id,expires_at,reason) VALUES(?,?,?,?)
    ON CONFLICT(chat_id,user_id) DO UPDATE SET expires_at=excluded.expires_at,reason=excluded.reason`)
    .run(chatId, userId, expiresAt, reason);
}

export function unmuteUser(chatId, userId) {
  return db.prepare('DELETE FROM muted_users WHERE chat_id=? AND user_id=?').run(chatId, userId).changes > 0;
}

export function isMuted(chatId, userId) {
  const row = db.prepare('SELECT expires_at FROM muted_users WHERE chat_id=? AND user_id=?').get(chatId, userId);
  if (!row) return false;
  if (row.expires_at <= Date.now()) { unmuteUser(chatId, userId); return false; }
  return true;
}

export function saveAiTurn(chatId, userId, role, content, maxTurns) {
  const insert = db.prepare('INSERT INTO ai_memory(chat_id,user_id,role,content,created_at) VALUES(?,?,?,?,?)');
  insert.run(chatId, userId, role, content.slice(0, 12000), Date.now());
  db.prepare(`DELETE FROM ai_memory WHERE chat_id=? AND user_id=? AND id NOT IN (
    SELECT id FROM ai_memory WHERE chat_id=? AND user_id=? ORDER BY id DESC LIMIT ?
  )`).run(chatId, userId, chatId, userId, Math.max(2, maxTurns * 2));
}

export function getAiHistory(chatId, userId) {
  return db.prepare('SELECT role,content FROM ai_memory WHERE chat_id=? AND user_id=? ORDER BY id ASC')
    .all(chatId, userId);
}

export function addReminder(chatId, userId, text, dueAt) {
  return db.prepare('INSERT INTO reminders(chat_id,user_id,text,due_at,created_at) VALUES(?,?,?,?,?)')
    .run(chatId, userId, text, dueAt, Date.now()).lastInsertRowid;
}

export function getDueReminders(now = Date.now()) {
  return db.prepare('SELECT * FROM reminders WHERE due_at <= ? ORDER BY due_at ASC LIMIT 30').all(now);
}

export function deleteReminder(id) {
  db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
}

export function countUserReminders(chatId, userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM reminders WHERE chat_id=? AND user_id=?').get(chatId, userId).n;
}

export function audit(chatId, userId, action, details = '') {
  db.prepare('INSERT INTO audit_log(chat_id,user_id,action,details,created_at) VALUES(?,?,?,?,?)')
    .run(chatId || null, userId || null, action, String(details).slice(0, 1000), Date.now());
}

export function recordMessage(chatId, userId) {
  db.prepare(`INSERT INTO message_stats(chat_id,user_id,messages,last_seen) VALUES(?,?,1,?)
    ON CONFLICT(chat_id,user_id) DO UPDATE SET messages=messages+1,last_seen=excluded.last_seen`)
    .run(chatId, userId, Date.now());
}

export function getUserStats(chatId, userId) {
  return db.prepare('SELECT messages,last_seen FROM message_stats WHERE chat_id=? AND user_id=?').get(chatId, userId) || { messages: 0, last_seen: null };
}

export function getDatabaseStats() {
  return {
    chatsWithActivity: db.prepare('SELECT COUNT(DISTINCT chat_id) AS n FROM message_stats').get().n,
    usersTracked: db.prepare('SELECT COUNT(*) AS n FROM message_stats').get().n,
    remindersPending: db.prepare('SELECT COUNT(*) AS n FROM reminders').get().n,
    auditEvents: db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n
  };
}
