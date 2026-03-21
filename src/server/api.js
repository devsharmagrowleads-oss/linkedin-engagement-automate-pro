const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../database/db');
const log = require('../utils/logger');

const router = express.Router();

// ── SSE (Server-Sent Events) for live session progress ──────────────

const sseClients = new Set();

router.get('/events', (req, res) => {
  if (sseClients.size >= 10) {
    return res.status(503).end();
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('data: {"type":"connected"}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    client.write(data);
  }
}

// ── Validation helpers ──────────────────────────────────────────────

const TIME_WINDOW_RE = /^\d{2}:\d{2}-\d{2}:\d{2}$/;
const NUMERIC_RE = /^\d+$/;

function sanitizeValue(value) {
  // Strip newlines, carriage returns, and null bytes to prevent .env injection
  return String(value).replace(/[\r\n\0]/g, '').trim();
}

// Whitelist of allowed settings keys
const ALLOWED_SETTINGS = [
  'MORNING_WINDOW', 'AFTERNOON_WINDOW', 'EVENING_WINDOW',
  'DAILY_TARGET_MIN', 'DAILY_TARGET_MAX',
  'MAX_JITTER_MINUTES', 'MAX_SESSION_MINUTES',
  'TIMEZONE', 'LOCALE', 'VIEWPORT_WIDTH', 'VIEWPORT_HEIGHT',
  'SKIP_DAY_PERCENT', 'BROWSE_ONLY_PERCENT', 'WINDOW_VARIANCE_MINUTES',
  'USER_NAME', 'TEAM', 'ADMIN_API_URL', 'ADMIN_API_KEY',
];

// ── Cached checks for /status hot path ──────────────────────────────

let profileExistsCache = { value: false, checkedAt: 0 };
const PROFILE_CACHE_TTL = 30000; // 30 seconds

function checkProfileExists() {
  const now = Date.now();
  if (now - profileExistsCache.checkedAt < PROFILE_CACHE_TTL) {
    return profileExistsCache.value;
  }
  try {
    // Check for a known Chromium profile file instead of listing the entire directory
    const result = fs.existsSync(path.join(config.browserProfileDir, 'Default'))
      || fs.existsSync(path.join(config.browserProfileDir, 'Local State'));
    profileExistsCache = { value: result, checkedAt: now };
    return result;
  } catch {
    return false;
  }
}

// ── Status & Dashboard Data ─────────────────────────────────────────

router.get('/status', (req, res) => {
  try {
    const progress = db.getDailyProgress();
    const sessions = db.getSessionsToday();
    const running = sessions.find(s => s.status === 'running');
    const lockExists = fs.existsSync(config.lockfilePath);

    const profileExists = checkProfileExists();
    const needsRelogin = !profileExists;

    res.json({
      status: running ? 'running' : 'idle',
      lockActive: lockExists,
      loggedIn: profileExists,
      loginInProgress: !!loginProcess,
      needsRelogin,
      daily: {
        target: progress.target || 0,
        achieved: progress.achieved || 0,
      },
      sessionsToday: sessions.length,
      completedToday: sessions.filter(s => s.status === 'completed').length,
      currentSession: running || null,
    });
  } catch (err) {
    log.error(`Status error: ${err.message}`);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

router.get('/stats', (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 365);
    const stats = db.getStatsByDays(days);
    const matchLevels = db.getMatchLevelsByDays(days);
    res.json({ stats, matchLevels });
  } catch (err) {
    log.error(`Stats error: ${err.message}`);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ── Recent Reactions ────────────────────────────────────────────────

router.get('/reactions', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const reactions = db.getReactionsPaginated(limit, offset);
    const total = db.getReactionsCount();
    res.json({ reactions, total });
  } catch (err) {
    log.error(`Reactions error: ${err.message}`);
    res.status(500).json({ error: 'Failed to get reactions' });
  }
});

// ── Session History ─────────────────────────────────────────────────

router.get('/sessions', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const sessions = db.getRecentSessions(limit);
    res.json({ sessions });
  } catch (err) {
    log.error(`Sessions error: ${err.message}`);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
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

    if (!data.primary || !Array.isArray(data.primary)) {
      return res.status(400).json({ error: '"primary" must be an array' });
    }
    if (!data.secondary || !Array.isArray(data.secondary)) {
      return res.status(400).json({ error: '"secondary" must be an array' });
    }
    if (!data.reactionMap || typeof data.reactionMap !== 'object') {
      return res.status(400).json({ error: '"reactionMap" must be an object' });
    }

    // Only write validated fields (prevent arbitrary key injection)
    const clean = {
      reactToAll: data.reactToAll === true,
      primary: data.primary.filter(k => typeof k === 'string' && k.trim()).map(k => k.trim()),
      secondary: data.secondary.filter(k => typeof k === 'string' && k.trim()).map(k => k.trim()),
      reactionMap: {},
      fuzzyThreshold: Math.min(Math.max(parseFloat(data.fuzzyThreshold) || 0.3, 0), 1),
    };

    // Validate reaction map entries
    const validReactions = ['celebrate', 'insightful', 'love', 'support', 'funny'];
    for (const key of validReactions) {
      const arr = data.reactionMap[key];
      clean.reactionMap[key] = Array.isArray(arr)
        ? arr.filter(k => typeof k === 'string' && k.trim()).map(k => k.trim())
        : [];
    }

    fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(clean, null, 2));
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
      const k = key.trim();
      // Only return whitelisted settings
      if (ALLOWED_SETTINGS.includes(k)) {
        settings[k] = rest.join('=').trim();
      }
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

router.post('/settings', (req, res) => {
  try {
    const settings = req.body;

    // Validate time windows
    for (const key of ['MORNING_WINDOW', 'AFTERNOON_WINDOW', 'EVENING_WINDOW']) {
      if (settings[key] && !TIME_WINDOW_RE.test(sanitizeValue(settings[key]))) {
        return res.status(400).json({ error: `${key} must be in HH:MM-HH:MM format` });
      }
    }

    // Validate timezone — check against Intl API
    if (settings.TIMEZONE) {
      const tz = sanitizeValue(settings.TIMEZONE);
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
      } catch {
        return res.status(400).json({ error: `TIMEZONE "${tz}" is not a valid IANA timezone identifier` });
      }
    }

    // Validate numeric fields
    for (const key of ['DAILY_TARGET_MIN', 'DAILY_TARGET_MAX', 'MAX_JITTER_MINUTES', 'MAX_SESSION_MINUTES', 'VIEWPORT_WIDTH', 'VIEWPORT_HEIGHT', 'SKIP_DAY_PERCENT', 'BROWSE_ONLY_PERCENT', 'WINDOW_VARIANCE_MINUTES']) {
      if (settings[key] && !NUMERIC_RE.test(sanitizeValue(settings[key]))) {
        return res.status(400).json({ error: `${key} must be a number` });
      }
    }

    const s = (key, def) => sanitizeValue(settings[key] || def);

    const lines = [
      '# Session time windows (HH:MM-HH:MM)',
      `MORNING_WINDOW=${s('MORNING_WINDOW', '08:00-10:00')}`,
      `AFTERNOON_WINDOW=${s('AFTERNOON_WINDOW', '12:00-14:00')}`,
      `EVENING_WINDOW=${s('EVENING_WINDOW', '17:00-19:00')}`,
      '',
      '# Daily reaction target range (keep low to avoid detection)',
      `DAILY_TARGET_MIN=${s('DAILY_TARGET_MIN', '15')}`,
      `DAILY_TARGET_MAX=${s('DAILY_TARGET_MAX', '25')}`,
      '',
      '# Max jitter delay in minutes before starting a session',
      `MAX_JITTER_MINUTES=${s('MAX_JITTER_MINUTES', '30')}`,
      '',
      '# Max session duration in minutes',
      `MAX_SESSION_MINUTES=${s('MAX_SESSION_MINUTES', '25')}`,
      '',
      '# Timezone',
      `TIMEZONE=${s('TIMEZONE', 'Asia/Kolkata')}`,
      '',
      '# Browser locale (should match timezone region)',
      `LOCALE=${s('LOCALE', 'en-IN')}`,
      '',
      '# Browser viewport',
      `VIEWPORT_WIDTH=${s('VIEWPORT_WIDTH', '1366')}`,
      `VIEWPORT_HEIGHT=${s('VIEWPORT_HEIGHT', '768')}`,
      '',
      '# Anti-detection: skip day probability (0-100)',
      `SKIP_DAY_PERCENT=${s('SKIP_DAY_PERCENT', '20')}`,
      '',
      '# Anti-detection: browse-only session probability (0-100)',
      `BROWSE_ONLY_PERCENT=${s('BROWSE_ONLY_PERCENT', '20')}`,
      '',
      '# Anti-detection: window time variance in minutes',
      `WINDOW_VARIANCE_MINUTES=${s('WINDOW_VARIANCE_MINUTES', '45')}`,
      '',
      '# User identity (for admin tracking)',
      `USER_NAME=${s('USER_NAME', 'YourName')}`,
      `TEAM=${s('TEAM', 'default')}`,
      `ADMIN_API_URL=${s('ADMIN_API_URL', '')}`,
      `ADMIN_API_KEY=${s('ADMIN_API_KEY', '')}`,
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

  const indexPath = path.join(__dirname, '..', 'index.js');

  activeSessionProcess = spawn('node', [indexPath], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, FORCE_NO_JITTER: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Stream stdout/stderr to SSE clients for live progress
  const forwardOutput = (stream) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer
      for (const line of lines) {
        if (line.trim()) {
          broadcast({ type: 'session_log', message: line.trim() });
        }
      }
    });
  };
  forwardOutput(activeSessionProcess.stdout);
  forwardOutput(activeSessionProcess.stderr);

  activeSessionProcess.on('close', (code) => {
    log.info(`Session process exited with code ${code}`);
    broadcast({ type: 'session_ended', code });
    activeSessionProcess = null;
  });

  broadcast({ type: 'session_started' });
  res.json({ success: true, message: 'Session started' });
});

router.post('/session/stop', (req, res) => {
  if (!activeSessionProcess) {
    if (fs.existsSync(config.lockfilePath)) {
      fs.unlinkSync(config.lockfilePath);
    }
    return res.json({ success: true, message: 'No session running' });
  }

  activeSessionProcess.kill('SIGTERM');
  // Let the 'close' handler set activeSessionProcess = null (not here — avoids race)

  if (fs.existsSync(config.lockfilePath)) {
    fs.unlinkSync(config.lockfilePath);
  }

  res.json({ success: true, message: 'Session stopping' });
});

// ── Login ───────────────────────────────────────────────────────────

let loginProcess = null;

router.post('/login/start', (req, res) => {
  if (loginProcess) {
    return res.status(409).json({ error: 'Login browser already open' });
  }

  const loginPath = path.join(__dirname, '..', 'login.js');

  loginProcess = spawn('node', [loginPath], {
    cwd: path.join(__dirname, '..', '..'),
    stdio: 'pipe',
  });

  loginProcess.on('close', () => {
    loginProcess = null;
    // Invalidate profile cache so status updates immediately
    profileExistsCache.checkedAt = 0;
  });

  res.json({ success: true, message: 'Login browser opened. Complete login in the browser window.' });
});

router.get('/login/status', (req, res) => {
  res.json({
    inProgress: !!loginProcess,
    loggedIn: checkProfileExists(),
  });
});

// ── Error Logs ──────────────────────────────────────────────────────

router.get('/errors', (req, res) => {
  try {
    const errorsDir = config.errorsDir;
    let screenshots = [];
    if (fs.existsSync(errorsDir)) {
      screenshots = fs.readdirSync(errorsDir)
        .filter(f => f.endsWith('.png'))
        .sort()
        .reverse()
        .slice(0, 20);
    }

    const errors = db.getErrorSessions();
    res.json({ errors, screenshots });
  } catch (err) {
    log.error(`Errors endpoint: ${err.message}`);
    res.status(500).json({ error: 'Failed to get errors' });
  }
});

module.exports = router;
