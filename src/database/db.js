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
`);

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
    INSERT OR IGNORE INTO reactions (session_id, post_urn, author, content_snippet, reaction_type, match_level, matched_keyword)
    VALUES (?, ?, ?, ?, ?, ?, ?)
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

function logReaction(sessionId, post, reactionType, matchLevel, matchedKeyword) {
  const result = stmts.insertReaction.run(
    sessionId,
    post.urn,
    post.author || 'Unknown',
    (post.text || '').substring(0, 200),
    reactionType,
    matchLevel,
    matchedKeyword
  );

  if (result.changes > 0) {
    const today = getTodayStr();
    stmts.incrementAchieved.run(today);
    return true;
  }
  return false;
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

module.exports = {
  db,
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
};
