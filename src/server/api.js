const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../database/db');
const log = require('../utils/logger');

const router = express.Router();

// ── Startup cleanup: mark any stale 'running' sessions as stopped ────
// This handles the case where the server crashed or restarted while
// a session was running. Without this, the dashboard would show
// "Running" forever for the orphaned session.
db.forceEndRunningSessions();

// Also clean up any orphaned lockfile from a dead session process
try {
  if (fs.existsSync(config.lockfilePath)) {
    const lockPid = parseInt(fs.readFileSync(config.lockfilePath, 'utf-8').trim(), 10);
    let alive = false;
    if (lockPid && !isNaN(lockPid)) {
      try { process.kill(lockPid, 0); alive = true; } catch { alive = false; }
    }
    if (!alive) {
      fs.unlinkSync(config.lockfilePath);
      log.info('Cleaned up orphaned lockfile from dead session process');
    }
  }
} catch {}

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

  // Clean up on client disconnect or error to prevent memory leaks
  const cleanup = () => sseClients.delete(res);
  req.on('close', cleanup);
  res.on('error', cleanup);
});

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      // Client disconnected — remove on next cleanup cycle
      sseClients.delete(client);
    }
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
  'USER_NAME', 'TEAM', 'ADMIN_API_URL',
  // Comment settings (OPENAI_API_KEY intentionally excluded — security)
  'ENABLE_COMMENTS', 'COMMENT_DRY_RUN', 'OPENAI_MODEL',
  'DAILY_COMMENT_MIN', 'DAILY_COMMENT_MAX',
  'COMMENT_MIN_GAP', 'COMMENT_MAX_GAP',
];

// ── Constants ────────────────────────────────────────────────────────

const LOCK_STALE_TTL = 30 * 60 * 1000; // 30 minutes — lock older than this is considered stale

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

    // Comment progress
    let commentDaily = { target: 0, achieved: 0 };
    try {
      commentDaily = db.getCommentDailyProgress();
    } catch {}

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
      commentDaily: {
        target: commentDaily.target || 0,
        achieved: commentDaily.achieved || 0,
      },
      account: config.account || 'default',
      commentsEnabled: config.enableComments,
      hasOpenAIKey: !!config.openaiApiKey,
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

// ── Comments ─────────────────────────────────────────────────────────

router.get('/comments', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const comments = db.getCommentsPaginated(limit, offset);
    const total = db.getCommentsCount();
    res.json({ comments, total });
  } catch (err) {
    log.error(`Comments error: ${err.message}`);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

router.get('/comment-stats', (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 365);
    const stats = db.getCommentStatsByDays(days);
    res.json({ stats });
  } catch (err) {
    log.error(`Comment stats error: ${err.message}`);
    res.status(500).json({ error: 'Failed to get comment stats' });
  }
});

// ── Persona / Commenting Config ──────────────────────────────────────

const COMMENTING_PATH = path.join(__dirname, '..', '..', 'config', 'commenting.json');

router.get('/persona', (req, res) => {
  try {
    const raw = fs.readFileSync(COMMENTING_PATH, 'utf-8');
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read commenting config' });
  }
});

router.post('/persona', (req, res) => {
  try {
    const data = req.body;

    // Validate
    if (typeof data.persona !== 'string' || data.persona.trim().length < 10) {
      return res.status(400).json({ error: 'Persona must be at least 10 characters' });
    }

    const clean = {
      persona: data.persona.trim().substring(0, 2000),
      bannedPhrases: Array.isArray(data.bannedPhrases)
        ? data.bannedPhrases.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim())
        : ['as an AI', 'language model'],
      minEngagementReactions: Math.max(0, parseInt(data.minEngagementReactions) || 5),
      minEngagementComments: Math.max(0, parseInt(data.minEngagementComments) || 2),
      minLength: Math.max(5, parseInt(data.minLength) || 15),
      maxLength: Math.min(1000, parseInt(data.maxLength) || 300),
    };

    // Ensure minLength < maxLength
    if (clean.minLength >= clean.maxLength) {
      return res.status(400).json({ error: 'minLength must be less than maxLength' });
    }

    fs.writeFileSync(COMMENTING_PATH, JSON.stringify(clean, null, 2));
    log.info('Commenting config updated via dashboard');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save commenting config' });
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
    // Enforce whitelist: only accept known setting keys from the request body
    const settings = {};
    for (const key of ALLOWED_SETTINGS) {
      if (req.body[key] !== undefined) {
        settings[key] = req.body[key];
      }
    }
    // Write-only keys: accepted in POST but never returned by GET
    if (req.body.OPENAI_API_KEY) {
      settings.OPENAI_API_KEY = req.body.OPENAI_API_KEY;
    }
    if (req.body.ADMIN_API_KEY) {
      settings.ADMIN_API_KEY = req.body.ADMIN_API_KEY;
    }

    // Validate time windows: format + start < end
    for (const key of ['MORNING_WINDOW', 'AFTERNOON_WINDOW', 'EVENING_WINDOW']) {
      if (!settings[key]) continue;
      const val = sanitizeValue(settings[key]);
      if (!TIME_WINDOW_RE.test(val)) {
        return res.status(400).json({ error: `${key} must be in HH:MM-HH:MM format` });
      }
      const [start, end] = val.split('-');
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        return res.status(400).json({ error: `${key} start time must be before end time` });
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
    for (const key of ['DAILY_TARGET_MIN', 'DAILY_TARGET_MAX', 'MAX_JITTER_MINUTES', 'MAX_SESSION_MINUTES', 'VIEWPORT_WIDTH', 'VIEWPORT_HEIGHT', 'SKIP_DAY_PERCENT', 'BROWSE_ONLY_PERCENT', 'WINDOW_VARIANCE_MINUTES', 'DAILY_COMMENT_MIN', 'DAILY_COMMENT_MAX', 'COMMENT_MIN_GAP', 'COMMENT_MAX_GAP']) {
      if (settings[key] && !NUMERIC_RE.test(sanitizeValue(settings[key]))) {
        return res.status(400).json({ error: `${key} must be a number` });
      }
    }

    // Validate viewport dimensions (reasonable browser window sizes)
    const vw = parseInt(sanitizeValue(settings.VIEWPORT_WIDTH || '0'));
    const vh = parseInt(sanitizeValue(settings.VIEWPORT_HEIGHT || '0'));
    if (settings.VIEWPORT_WIDTH && (vw < 800 || vw > 3840)) {
      return res.status(400).json({ error: 'VIEWPORT_WIDTH must be between 800 and 3840' });
    }
    if (settings.VIEWPORT_HEIGHT && (vh < 600 || vh > 2160)) {
      return res.status(400).json({ error: 'VIEWPORT_HEIGHT must be between 600 and 2160' });
    }

    // Validate percentage fields (0-100)
    for (const key of ['SKIP_DAY_PERCENT', 'BROWSE_ONLY_PERCENT']) {
      if (settings[key]) {
        const val = parseInt(sanitizeValue(settings[key]));
        if (val < 0 || val > 100) {
          return res.status(400).json({ error: `${key} must be between 0 and 100` });
        }
      }
    }

    // Validate min <= max pairs
    const pairs = [
      ['DAILY_TARGET_MIN', 'DAILY_TARGET_MAX', 'Daily target'],
      ['DAILY_COMMENT_MIN', 'DAILY_COMMENT_MAX', 'Daily comment target'],
      ['COMMENT_MIN_GAP', 'COMMENT_MAX_GAP', 'Comment gap'],
    ];
    for (const [minKey, maxKey, label] of pairs) {
      const minVal = parseInt(sanitizeValue(settings[minKey] || '0'));
      const maxVal = parseInt(sanitizeValue(settings[maxKey] || '0'));
      if (settings[minKey] && settings[maxKey] && minVal > maxVal) {
        return res.status(400).json({ error: `${label} min cannot be greater than max` });
      }
    }

    // Read existing .env to preserve values not sent by the form (like OPENAI_API_KEY)
    let existingEnv = {};
    try {
      const raw = fs.readFileSync(ENV_PATH, 'utf-8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [key, ...rest] = trimmed.split('=');
        existingEnv[key.trim()] = rest.join('=').trim();
      }
    } catch {}

    const s = (key, def) => sanitizeValue(settings[key] || existingEnv[key] || def);

    const lines = [
      '# Session time windows (HH:MM-HH:MM)',
      `MORNING_WINDOW=${s('MORNING_WINDOW', '08:00-10:00')}`,
      `AFTERNOON_WINDOW=${s('AFTERNOON_WINDOW', '12:00-14:00')}`,
      `EVENING_WINDOW=${s('EVENING_WINDOW', '17:00-19:00')}`,
      '',
      '# Daily reaction target range (keep low to avoid detection)',
      `DAILY_TARGET_MIN=${s('DAILY_TARGET_MIN', '0')}`,
      `DAILY_TARGET_MAX=${s('DAILY_TARGET_MAX', '45')}`,
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
      `SKIP_DAY_PERCENT=${s('SKIP_DAY_PERCENT', '15')}`,
      '',
      '# Anti-detection: browse-only session probability (0-100)',
      `BROWSE_ONLY_PERCENT=${s('BROWSE_ONLY_PERCENT', '15')}`,
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
      '# Auto-Comment (OpenAI)',
      `ENABLE_COMMENTS=${s('ENABLE_COMMENTS', 'false')}`,
      `COMMENT_DRY_RUN=${s('COMMENT_DRY_RUN', 'false')}`,
      `OPENAI_API_KEY=${s('OPENAI_API_KEY', '')}`,
      `OPENAI_MODEL=${s('OPENAI_MODEL', 'gpt-4o-mini')}`,
      `DAILY_COMMENT_MIN=${s('DAILY_COMMENT_MIN', '3')}`,
      `DAILY_COMMENT_MAX=${s('DAILY_COMMENT_MAX', '8')}`,
      `COMMENT_MIN_GAP=${s('COMMENT_MIN_GAP', '3')}`,
      `COMMENT_MAX_GAP=${s('COMMENT_MAX_GAP', '8')}`,
      '',
    ];

    fs.writeFileSync(ENV_PATH, lines.join('\n'));

    // Hot-reload: update in-memory config so dashboard reflects changes immediately
    // (child session processes always read .env fresh on spawn, but the dashboard
    // server itself needs this to show accurate status like commentsEnabled)
    try {
      config.reload();
    } catch (reloadErr) {
      log.warn(`Config reload failed (dashboard may show stale values): ${reloadErr.message}`);
    }

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

  // Check for lockfile from a terminal-started session
  if (fs.existsSync(config.lockfilePath)) {
    try {
      const lockAge = Date.now() - fs.statSync(config.lockfilePath).mtimeMs;
      // Read PID from lockfile and check if the process is actually alive
      const lockPid = parseInt(fs.readFileSync(config.lockfilePath, 'utf-8').trim(), 10);
      let processAlive = false;
      if (lockPid && !isNaN(lockPid)) {
        try { process.kill(lockPid, 0); processAlive = true; } catch { processAlive = false; }
      }

      if (processAlive && lockAge < LOCK_STALE_TTL) {
        return res.status(409).json({ error: 'Another session is running (started from terminal). Stop it first.' });
      }
      // Process is dead or lock is stale — clean up and proceed
      fs.unlinkSync(config.lockfilePath);
      db.forceEndRunningSessions();
    } catch {}
  }

  const indexPath = path.join(__dirname, '..', 'index.js');

  activeSessionProcess = spawn('node', [indexPath], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, FORCE_NO_JITTER: '1', FORCE_NO_SKIP: '1' },
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

  activeSessionProcess.on('error', (err) => {
    log.error(`Session process spawn error: ${err.message}`);
    // Clean up lockfile so next Start doesn't get blocked
    try { if (fs.existsSync(config.lockfilePath)) fs.unlinkSync(config.lockfilePath); } catch {}
    db.forceEndRunningSessions();
    broadcast({ type: 'session_ended', code: 'error' });
    activeSessionProcess = null;
  });

  activeSessionProcess.on('close', (code) => {
    log.info(`Session process exited with code ${code}`);
    // Clean up lockfile in case the child didn't (crash, SIGKILL, etc.)
    try { if (fs.existsSync(config.lockfilePath)) fs.unlinkSync(config.lockfilePath); } catch {}
    // Clean up any 'running' sessions in DB that the child process didn't finalize
    db.forceEndRunningSessions();
    broadcast({ type: 'session_ended', code });
    activeSessionProcess = null;
  });

  broadcast({ type: 'session_started' });
  res.json({ success: true, message: 'Session started' });
});

router.post('/session/stop', (req, res) => {
  let killed = false;

  // Case 1: Session spawned by this dashboard process
  if (activeSessionProcess) {
    try {
      activeSessionProcess.kill();
    } catch (e) {
      log.warn(`Failed to kill session process: ${e.message}`);
    }
    killed = true;
  }

  // Case 2: Session started from terminal (npm start) — read PID from lockfile
  if (!killed && fs.existsSync(config.lockfilePath)) {
    try {
      const pid = parseInt(fs.readFileSync(config.lockfilePath, 'utf-8').trim(), 10);
      if (pid && !isNaN(pid)) {
        process.kill(pid); // cross-platform: SIGTERM on Mac/Linux, TerminateProcess on Windows
        log.info(`Killed external session process (PID ${pid})`);
        killed = true;
      }
    } catch (e) {
      // Process already dead or invalid PID — that's fine
      log.warn(`Could not kill external process: ${e.message}`);
    }
  }

  // Always clean up lockfile
  try {
    if (fs.existsSync(config.lockfilePath)) {
      fs.unlinkSync(config.lockfilePath);
    }
  } catch {}

  // Always clean up DB: mark any 'running' sessions as 'stopped'
  // This is critical because killed processes can't update the DB themselves
  db.forceEndRunningSessions();

  broadcast({ type: 'session_ended', code: killed ? 'stopped' : null });
  res.json({ success: true, message: killed ? 'Session stopped' : 'No active session found' });
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

  loginProcess.on('error', (err) => {
    log.error(`Login process spawn error: ${err.message}`);
    loginProcess = null;
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
