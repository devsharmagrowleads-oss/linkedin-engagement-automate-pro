const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const log = require('../utils/logger');

// Ensure data directory exists
const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL'); // Safe with WAL, reduces fsync overhead
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    window TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    posts_scrolled INTEGER DEFAULT 0,
    posts_matched INTEGER DEFAULT 0,
    posts_reacted INTEGER DEFAULT 0,
    posts_skipped INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running',
    error_message TEXT
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    post_urn TEXT NOT NULL UNIQUE,
    post_url TEXT DEFAULT '',
    author TEXT,
    content_snippet TEXT,
    reaction_type TEXT NOT NULL,
    match_level TEXT NOT NULL,
    matched_keyword TEXT,
    reacted_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS daily_targets (
    date TEXT PRIMARY KEY,
    target INTEGER NOT NULL,
    achieved INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_reactions_urn ON reactions(post_urn);
  CREATE INDEX IF NOT EXISTS idx_reactions_date ON reactions(reacted_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);

  CREATE TABLE IF NOT EXISTS cooldowns (
    key TEXT PRIMARY KEY,
    until TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS skip_days (
    date TEXT PRIMARY KEY
  );
`);

// Migration: add post_url column if it doesn't exist (for existing databases)
try {
  db.exec(`ALTER TABLE reactions ADD COLUMN post_url TEXT DEFAULT ''`);
} catch (e) {
  // Column already exists — ignore
}

// Prepared statements
const stmts = {
  // Sessions
  insertSession: db.prepare(`
    INSERT INTO sessions (id, date, window, started_at, status)
    VALUES (?, ?, ?, datetime('now'), 'running')
  `),

  updateSession: db.prepare(`
    UPDATE sessions SET ended_at = datetime('now'), posts_scrolled = ?, posts_matched = ?,
    posts_reacted = ?, posts_skipped = ?, status = ?, error_message = ?
    WHERE id = ?
  `),

  getSessionsToday: db.prepare(`
    SELECT * FROM sessions WHERE date = ? ORDER BY started_at
  `),

  // Reactions
  insertReaction: db.prepare(`
    INSERT OR IGNORE INTO reactions (session_id, post_urn, post_url, author, content_snippet, reaction_type, match_level, matched_keyword)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  isAlreadyReacted: db.prepare(`
    SELECT 1 FROM reactions WHERE post_urn = ?
  `),

  getReactionsToday: db.prepare(`
    SELECT COUNT(*) as count FROM reactions WHERE reacted_at >= date('now')
  `),

  getReactionsSummary: db.prepare(`
    SELECT reaction_type, COUNT(*) as count FROM reactions
    WHERE session_id = ? GROUP BY reaction_type
  `),

  getMatchLevelSummary: db.prepare(`
    SELECT match_level, COUNT(*) as count FROM reactions
    WHERE session_id = ? GROUP BY match_level
  `),

  // Daily targets
  getOrCreateDailyTarget: db.prepare(`
    INSERT OR IGNORE INTO daily_targets (date, target, achieved) VALUES (?, ?, 0)
  `),

  getDailyTarget: db.prepare(`
    SELECT * FROM daily_targets WHERE date = ?
  `),

  incrementAchieved: db.prepare(`
    UPDATE daily_targets SET achieved = achieved + 1 WHERE date = ?
  `),

  // Maintenance
  pruneOldReactions: db.prepare(`
    DELETE FROM reactions WHERE reacted_at < datetime('now', '-30 days')
  `),

  // API queries (previously inline in api.js)
  getLastError: db.prepare(`
    SELECT error_message FROM sessions
    WHERE status = 'error' ORDER BY started_at DESC LIMIT 1
  `),

  getStatsByDays: db.prepare(`
    SELECT
      date(reacted_at) as day,
      COUNT(*) as total,
      SUM(CASE WHEN reaction_type = 'like' THEN 1 ELSE 0 END) as likes,
      SUM(CASE WHEN reaction_type = 'celebrate' THEN 1 ELSE 0 END) as celebrates,
      SUM(CASE WHEN reaction_type = 'insightful' THEN 1 ELSE 0 END) as insightfuls,
      SUM(CASE WHEN reaction_type = 'love' THEN 1 ELSE 0 END) as loves,
      SUM(CASE WHEN reaction_type = 'support' THEN 1 ELSE 0 END) as supports,
      SUM(CASE WHEN reaction_type = 'funny' THEN 1 ELSE 0 END) as funnys
    FROM reactions
    WHERE reacted_at >= date('now', '-' || ? || ' days')
    GROUP BY date(reacted_at)
    ORDER BY day DESC
  `),

  getMatchLevelsByDays: db.prepare(`
    SELECT match_level, COUNT(*) as count
    FROM reactions
    WHERE reacted_at >= date('now', '-' || ? || ' days')
    GROUP BY match_level
  `),

  getReactionsPaginated: db.prepare(`
    SELECT * FROM reactions ORDER BY reacted_at DESC LIMIT ? OFFSET ?
  `),

  getReactionsCount: db.prepare(`
    SELECT COUNT(*) as count FROM reactions WHERE reacted_at >= date('now', '-30 days')
  `),

  getRecentSessions: db.prepare(`
    SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?
  `),

  getErrorSessions: db.prepare(`
    SELECT * FROM sessions WHERE status = 'error' ORDER BY started_at DESC LIMIT 20
  `),

  // Cooldown management
  setCooldown: db.prepare(`
    INSERT OR REPLACE INTO cooldowns (key, until) VALUES (?, ?)
  `),
  getCooldown: db.prepare(`
    SELECT until FROM cooldowns WHERE key = ?
  `),
  clearCooldown: db.prepare(`
    DELETE FROM cooldowns WHERE key = ?
  `),

  // Skip day management
  markSkipDay: db.prepare(`
    INSERT OR IGNORE INTO skip_days (date) VALUES (?)
  `),
  isSkipDay: db.prepare(`
    SELECT 1 FROM skip_days WHERE date = ?
  `),
};

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function startSession(windowName) {
  const sessionId = generateSessionId();
  const today = getTodayStr();
  stmts.insertSession.run(sessionId, today, windowName);
  log.info(`Session started: ${sessionId} (${windowName})`);
  return sessionId;
}

function endSession(sessionId, stats) {
  stmts.updateSession.run(
    stats.postsScrolled || 0,
    stats.postsMatched || 0,
    stats.postsReacted || 0,
    stats.postsSkipped || 0,
    stats.status || 'completed',
    stats.errorMessage || null,
    sessionId
  );
}

// Wrap insert + increment in a transaction (single disk write, atomic)
const _logReactionTx = db.transaction((sessionId, urn, postUrl, author, snippet, reactionType, matchLevel, matchedKeyword) => {
  const result = stmts.insertReaction.run(sessionId, urn, postUrl, author, snippet, reactionType, matchLevel, matchedKeyword);
  if (result.changes > 0) {
    stmts.incrementAchieved.run(getTodayStr());
    return true;
  }
  return false;
});

function logReaction(sessionId, post, reactionType, matchLevel, matchedKeyword) {
  return _logReactionTx(
    sessionId,
    post.urn,
    post.postUrl || '',
    post.author || 'Unknown',
    (post.text || '').substring(0, 200),
    reactionType,
    matchLevel,
    matchedKeyword
  );
}

function isAlreadyReacted(urn) {
  return !!stmts.isAlreadyReacted.get(urn);
}

function getDailyProgress() {
  const today = getTodayStr();
  const target = stmts.getDailyTarget.get(today);
  const reacted = stmts.getReactionsToday.get();
  return {
    target: target ? target.target : 0,
    achieved: reacted.count,
  };
}

function ensureDailyTarget(min, max) {
  const today = getTodayStr();
  const target = min + Math.floor(Math.random() * (max - min + 1));
  stmts.getOrCreateDailyTarget.run(today, target);
  return stmts.getDailyTarget.get(today);
}

function getSessionsToday() {
  return stmts.getSessionsToday.all(getTodayStr());
}

function getSessionSummary(sessionId) {
  const reactions = stmts.getReactionsSummary.all(sessionId);
  const matchLevels = stmts.getMatchLevelSummary.all(sessionId);
  return { reactions, matchLevels };
}

function pruneOldData() {
  const result = stmts.pruneOldReactions.run();
  if (result.changes > 0) {
    log.info(`Pruned ${result.changes} old reaction records (>30 days)`);
  }
}

// API query functions (encapsulated — api.js should never use db directly)
function getLastError() {
  return stmts.getLastError.get();
}

function getStatsByDays(days) {
  return stmts.getStatsByDays.all(days);
}

function getMatchLevelsByDays(days) {
  return stmts.getMatchLevelsByDays.all(days);
}

function getReactionsPaginated(limit, offset) {
  return stmts.getReactionsPaginated.all(limit, offset);
}

function getReactionsCount() {
  const row = stmts.getReactionsCount.get();
  return row ? row.count : 0;
}

function getRecentSessions(limit) {
  return stmts.getRecentSessions.all(limit);
}

function getErrorSessions() {
  return stmts.getErrorSessions.all();
}

// Cooldown: set a cooldown that expires at a given ISO timestamp
function setCooldown(key, hoursFromNow) {
  const until = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
  stmts.setCooldown.run(key, until);
  log.info(`Cooldown set: ${key} until ${until}`);
}

function isCooldownActive(key) {
  const row = stmts.getCooldown.get(key);
  if (!row) return false;
  if (new Date(row.until) > new Date()) return true;
  // Expired — clean up
  stmts.clearCooldown.run(key);
  return false;
}

// Skip days: mark today as a skip day
function markSkipDay(date) {
  stmts.markSkipDay.run(date);
}

function isSkipDay(date) {
  return !!stmts.isSkipDay.get(date);
}

module.exports = {
  startSession,
  endSession,
  logReaction,
  isAlreadyReacted,
  getDailyProgress,
  ensureDailyTarget,
  getSessionsToday,
  getSessionSummary,
  pruneOldData,
  getTodayStr,
  // API queries
  getLastError,
  getStatsByDays,
  getMatchLevelsByDays,
  getReactionsPaginated,
  getReactionsCount,
  getRecentSessions,
  getErrorSessions,
  // Cooldown & skip days
  setCooldown,
  isCooldownActive,
  markSkipDay,
  isSkipDay,
};
