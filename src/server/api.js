const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../database/db');
const log = require('../utils/logger');

const router = express.Router();

// ── Status & Dashboard Data ─────────────────────────────────────────

router.get('/status', (req, res) => {
  const progress = db.getDailyProgress();
  const sessions = db.getSessionsToday();
  const running = sessions.find(s => s.status === 'running');
  const lockExists = fs.existsSync(config.lockfilePath);

  // Check if browser profile exists (has user logged in before?)
  const profileExists = fs.existsSync(config.browserProfileDir)
    && fs.readdirSync(config.browserProfileDir).length > 0;

  // Check if last session had a session-expired error
  const lastError = db.db.prepare(`
    SELECT error_message FROM sessions
    WHERE status = 'error' ORDER BY started_at DESC LIMIT 1
  `).get();
  const needsRelogin = lastError && lastError.error_message === 'Session expired';

  res.json({
    status: running ? 'running' : 'idle',
    lockActive: lockExists,
    loggedIn: profileExists,
    needsRelogin: needsRelogin || !profileExists,
    daily: {
      target: progress.target || 0,
      achieved: progress.achieved || 0,
    },
    sessionsToday: sessions.length,
    completedToday: sessions.filter(s => s.status === 'completed').length,
    currentSession: running || null,
  });
});

router.get('/stats', (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const stats = db.db.prepare(`
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
  `).all(days);

  const matchLevels = db.db.prepare(`
    SELECT match_level, COUNT(*) as count
    FROM reactions
    WHERE reacted_at >= date('now', '-' || ? || ' days')
    GROUP BY match_level
  `).all(days);

  res.json({ stats, matchLevels });
});

// ── Recent Reactions ────────────────────────────────────────────────

router.get('/reactions', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  const reactions = db.db.prepare(`
    SELECT * FROM reactions
    ORDER BY reacted_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.db.prepare('SELECT COUNT(*) as count FROM reactions').get();

  res.json({ reactions, total: total.count });
});

// ── Session History ─────────────────────────────────────────────────

router.get('/sessions', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const sessions = db.db.prepare(`
    SELECT * FROM sessions
    ORDER BY started_at DESC
    LIMIT ?
  `).all(limit);

  res.json({ sessions });
});

// ── Keywords Config ─────────────────────────────────────────────────

const KEYWORDS_PATH = path.join(__dirname, '..', '..', 'config', 'keywords.json');

router.get('/keywords', (req, res) => {
  try {
    const raw = fs.readFileSync(KEYWORDS_PATH, 'utf-8');
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read keywords config' });
  }
});

router.post('/keywords', (req, res) => {
  try {
    const data = req.body;

    // Validate structure
    if (!data.primary || !Array.isArray(data.primary)) {
      return res.status(400).json({ error: '"primary" must be an array' });
    }
    if (!data.secondary || !Array.isArray(data.secondary)) {
      return res.status(400).json({ error: '"secondary" must be an array' });
    }
    if (!data.reactionMap || typeof data.reactionMap !== 'object') {
      return res.status(400).json({ error: '"reactionMap" must be an object' });
    }

    // Clean empty strings
    data.primary = data.primary.filter(k => k.trim());
    data.secondary = data.secondary.filter(k => k.trim());

    fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(data, null, 2));
    log.info('Keywords config updated via dashboard');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save keywords config' });
  }
});

// ── Settings (.env) ─────────────────────────────────────────────────

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

router.get('/settings', (req, res) => {
  try {
    const raw = fs.readFileSync(ENV_PATH, 'utf-8');
    const settings = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      settings[key.trim()] = rest.join('=').trim();
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

router.post('/settings', (req, res) => {
  try {
    const settings = req.body;
    const lines = [
      '# Session time windows (HH:MM-HH:MM)',
      `MORNING_WINDOW=${settings.MORNING_WINDOW || '08:00-10:00'}`,
      `AFTERNOON_WINDOW=${settings.AFTERNOON_WINDOW || '12:00-14:00'}`,
      `EVENING_WINDOW=${settings.EVENING_WINDOW || '17:00-19:00'}`,
      '',
      '# Daily reaction target range',
      `DAILY_TARGET_MIN=${settings.DAILY_TARGET_MIN || '45'}`,
      `DAILY_TARGET_MAX=${settings.DAILY_TARGET_MAX || '55'}`,
      '',
      '# Max jitter delay in minutes before starting a session',
      `MAX_JITTER_MINUTES=${settings.MAX_JITTER_MINUTES || '30'}`,
      '',
      '# Max session duration in minutes',
      `MAX_SESSION_MINUTES=${settings.MAX_SESSION_MINUTES || '25'}`,
      '',
      '# Timezone',
      `TIMEZONE=${settings.TIMEZONE || 'Asia/Kolkata'}`,
      '',
      '# Browser viewport',
      `VIEWPORT_WIDTH=${settings.VIEWPORT_WIDTH || '1366'}`,
      `VIEWPORT_HEIGHT=${settings.VIEWPORT_HEIGHT || '768'}`,
      '',
    ];

    fs.writeFileSync(ENV_PATH, lines.join('\n'));
    log.info('Settings updated via dashboard');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ── Session Control ─────────────────────────────────────────────────

let activeSessionProcess = null;

router.post('/session/start', (req, res) => {
  if (activeSessionProcess) {
    return res.status(409).json({ error: 'A session is already running' });
  }

  const { spawn } = require('child_process');
  const indexPath = path.join(__dirname, '..', 'index.js');

  activeSessionProcess = spawn('node', [indexPath], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, FORCE_NO_JITTER: '1' },
    stdio: 'pipe',
  });

  let output = '';
  activeSessionProcess.stdout.on('data', (data) => {
    output += data.toString();
  });
  activeSessionProcess.stderr.on('data', (data) => {
    output += data.toString();
  });

  activeSessionProcess.on('close', (code) => {
    log.info(`Session process exited with code ${code}`);
    activeSessionProcess = null;
  });

  res.json({ success: true, message: 'Session started' });
});

router.post('/session/stop', (req, res) => {
  if (!activeSessionProcess) {
    // Also try to remove lockfile
    if (fs.existsSync(config.lockfilePath)) {
      fs.unlinkSync(config.lockfilePath);
    }
    return res.json({ success: true, message: 'No session running' });
  }

  activeSessionProcess.kill('SIGTERM');
  activeSessionProcess = null;

  if (fs.existsSync(config.lockfilePath)) {
    fs.unlinkSync(config.lockfilePath);
  }

  res.json({ success: true, message: 'Session stopped' });
});

// ── Login ───────────────────────────────────────────────────────────

let loginProcess = null;

router.post('/login/start', (req, res) => {
  if (loginProcess) {
    return res.status(409).json({ error: 'Login browser already open' });
  }

  const { spawn } = require('child_process');
  const loginPath = path.join(__dirname, '..', 'login.js');

  loginProcess = spawn('node', [loginPath], {
    cwd: path.join(__dirname, '..', '..'),
    stdio: 'pipe',
  });

  loginProcess.on('close', () => {
    loginProcess = null;
  });

  res.json({ success: true, message: 'Login browser opened. Complete login in the browser window.' });
});

// ── Error Logs ──────────────────────────────────────────────────────

router.get('/errors', (req, res) => {
  const errorsDir = config.errorsDir;
  if (!fs.existsSync(errorsDir)) {
    return res.json({ errors: [] });
  }

  const files = fs.readdirSync(errorsDir)
    .filter(f => f.endsWith('.png'))
    .sort()
    .reverse()
    .slice(0, 20);

  const errors = db.db.prepare(`
    SELECT * FROM sessions
    WHERE status = 'error'
    ORDER BY started_at DESC
    LIMIT 20
  `).all();

  res.json({ errors, screenshots: files });
});

module.exports = router;
