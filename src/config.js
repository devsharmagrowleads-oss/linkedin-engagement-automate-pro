const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const KEYWORDS_PATH = path.join(__dirname, '..', 'config', 'keywords.json');

function loadKeywords() {
  const raw = fs.readFileSync(KEYWORDS_PATH, 'utf-8');
  const config = JSON.parse(raw);

  // Ensure arrays exist (but allow empty — reactToAll mode and KeywordMatcher handle it)
  if (!Array.isArray(config.primary)) config.primary = [];
  if (!Array.isArray(config.secondary)) config.secondary = [];

  return config;
}

const config = {
  // Session windows
  morningWindow: process.env.MORNING_WINDOW || '08:00-10:00',
  afternoonWindow: process.env.AFTERNOON_WINDOW || '12:00-14:00',
  eveningWindow: process.env.EVENING_WINDOW || '17:00-19:00',

  // Daily targets
  dailyTargetMin: parseInt(process.env.DAILY_TARGET_MIN, 10) || 45,
  dailyTargetMax: parseInt(process.env.DAILY_TARGET_MAX, 10) || 55,

  // Timing
  maxJitterMinutes: parseInt(process.env.MAX_JITTER_MINUTES, 10) || 30,
  maxSessionMinutes: parseInt(process.env.MAX_SESSION_MINUTES, 10) || 25,

  // Browser
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  viewportWidth: parseInt(process.env.VIEWPORT_WIDTH, 10) || 1366,
  viewportHeight: parseInt(process.env.VIEWPORT_HEIGHT, 10) || 768,

  // Paths
  browserProfileDir: path.join(__dirname, '..', 'browser-profile'),
  dbPath: path.join(__dirname, '..', 'data', 'growleads.db'),
  errorsDir: path.join(__dirname, '..', 'data', 'errors'),
  lockfilePath: path.join(__dirname, '..', 'data', 'session.lock'),

  // Keywords (loaded on demand)
  loadKeywords,
};

module.exports = config;
