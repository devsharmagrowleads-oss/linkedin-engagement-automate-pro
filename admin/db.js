const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'admin.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL,
    team TEXT NOT NULL DEFAULT 'default',
    linkedin_name TEXT DEFAULT 'Unknown',
    linkedin_url TEXT DEFAULT '',
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_name, team)
  );

  CREATE TABLE IF NOT EXISTS session_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_id TEXT NOT NULL UNIQUE,
    window TEXT,
    status TEXT,
    posts_scrolled INTEGER DEFAULT 0,
    posts_matched INTEGER DEFAULT 0,
    posts_reacted INTEGER DEFAULT 0,
    posts_skipped INTEGER DEFAULT 0,
    started_at TEXT,
    ended_at TEXT,
    reported_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_reports_user ON session_reports(user_id);
  CREATE INDEX IF NOT EXISTS idx_reports_date ON session_reports(reported_at);
  CREATE INDEX IF NOT EXISTS idx_users_team ON users(team);
`);

const stmts = {
  upsertUser: db.prepare(`
    INSERT INTO users (user_name, team, linkedin_name, linkedin_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_name, team) DO UPDATE SET
      linkedin_name = excluded.linkedin_name,
      linkedin_url = excluded.linkedin_url,
      last_seen = datetime('now')
  `),

  getUserId: db.prepare(`
    SELECT id FROM users WHERE user_name = ? AND team = ?
  `),

  insertReport: db.prepare(`
    INSERT OR IGNORE INTO session_reports
    (user_id, session_id, window, status, posts_scrolled, posts_matched, posts_reacted, posts_skipped, started_at, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getAllUsers: db.prepare(`
    SELECT u.*,
      (SELECT COUNT(*) FROM session_reports sr WHERE sr.user_id = u.id) as total_sessions,
      (SELECT COUNT(*) FROM session_reports sr WHERE sr.user_id = u.id AND date(sr.reported_at) = date('now')) as sessions_today,
      (SELECT COALESCE(SUM(sr.posts_reacted), 0) FROM session_reports sr WHERE sr.user_id = u.id) as total_reactions,
      (SELECT COALESCE(SUM(sr.posts_reacted), 0) FROM session_reports sr WHERE sr.user_id = u.id AND date(sr.reported_at) = date('now')) as reactions_today
    FROM users u
    ORDER BY u.last_seen DESC
  `),

  getUserSessions: db.prepare(`
    SELECT * FROM session_reports WHERE user_id = ? ORDER BY reported_at DESC LIMIT ? OFFSET ?
  `),

  getTeamStats: db.prepare(`
    SELECT
      u.team,
      COUNT(DISTINCT u.id) as members,
      COUNT(sr.id) as total_sessions,
      COALESCE(SUM(sr.posts_reacted), 0) as total_reactions
    FROM users u
    LEFT JOIN session_reports sr ON sr.user_id = u.id
    GROUP BY u.team
    ORDER BY u.team
  `),

  getRecentActivity: db.prepare(`
    SELECT sr.*, u.user_name, u.team, u.linkedin_name
    FROM session_reports sr
    JOIN users u ON u.id = sr.user_id
    ORDER BY sr.reported_at DESC
    LIMIT ?
  `),
};

function upsertUser(userName, team, linkedinName, linkedinUrl) {
  stmts.upsertUser.run(userName, team, linkedinName || 'Unknown', linkedinUrl || '');
  const row = stmts.getUserId.get(userName, team);
  return row ? row.id : null;
}

function insertReport(userId, data) {
  return stmts.insertReport.run(
    userId,
    data.sessionId,
    data.window || 'unknown',
    data.status || 'unknown',
    data.postsScrolled || 0,
    data.postsMatched || 0,
    data.postsReacted || 0,
    data.postsSkipped || 0,
    data.startedAt || null,
    data.endedAt || null
  );
}

function getAllUsers(inactiveHours) {
  const users = stmts.getAllUsers.all();
  const threshold = new Date(Date.now() - inactiveHours * 60 * 60 * 1000).toISOString();
  return users.map(u => ({
    ...u,
    inactive: u.last_seen < threshold,
    idle: u.last_seen < new Date(Date.now() - (inactiveHours / 2) * 60 * 60 * 1000).toISOString(),
  }));
}

function getUserSessions(userId, limit = 50, offset = 0) {
  return stmts.getUserSessions.all(userId, limit, offset);
}

function getTeamStats() {
  return stmts.getTeamStats.all();
}

function getRecentActivity(limit = 50) {
  return stmts.getRecentActivity.all(limit);
}

module.exports = {
  upsertUser,
  insertReport,
  getAllUsers,
  getUserSessions,
  getTeamStats,
  getRecentActivity,
};
