const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const KEYWORDS_PATH = path.join(__dirname, '..', 'config', 'keywords.json');
const COMMENTING_PATH = path.join(__dirname, '..', 'config', 'commenting.json');

function loadKeywords() {
  const raw = fs.readFileSync(KEYWORDS_PATH, 'utf-8');
  const config = JSON.parse(raw);

  // Ensure arrays exist (but allow empty — reactToAll mode and KeywordMatcher handle it)
  if (!Array.isArray(config.primary)) config.primary = [];
  if (!Array.isArray(config.secondary)) config.secondary = [];

  return config;
}

function loadCommenting() {
  try {
    const raw = fs.readFileSync(COMMENTING_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {
      persona: 'You are a thoughtful professional who shares practical insights.',
      bannedPhrases: ['as an AI', 'language model'],
      minEngagementReactions: 5,
      minEngagementComments: 2,
      minLength: 15,
      maxLength: 300,
    };
  }
}

// Validate IANA timezone identifier
function validateTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    console.warn(`Invalid TIMEZONE "${tz}" — falling back to Asia/Kolkata`);
    return 'Asia/Kolkata';
  }
}

const config = {
  // Session windows
  morningWindow: process.env.MORNING_WINDOW || '08:00-10:00',
  afternoonWindow: process.env.AFTERNOON_WINDOW || '12:00-14:00',
  eveningWindow: process.env.EVENING_WINDOW || '17:00-19:00',

  // Daily targets
  dailyTargetMin: parseInt(process.env.DAILY_TARGET_MIN, 10) || 15,
  dailyTargetMax: parseInt(process.env.DAILY_TARGET_MAX, 10) || 25,

  // Timing
  maxJitterMinutes: parseInt(process.env.MAX_JITTER_MINUTES, 10) || 30,
  maxSessionMinutes: parseInt(process.env.MAX_SESSION_MINUTES, 10) || 25,

  // Browser
  timezone: validateTimezone(process.env.TIMEZONE || 'Asia/Kolkata'),
  locale: process.env.LOCALE || 'en-IN',
  viewportWidth: parseInt(process.env.VIEWPORT_WIDTH, 10) || 1366,
  viewportHeight: parseInt(process.env.VIEWPORT_HEIGHT, 10) || 768,

  // Anti-detection behavior
  skipDayPercent: parseInt(process.env.SKIP_DAY_PERCENT, 10) || 20,
  browseOnlyPercent: parseInt(process.env.BROWSE_ONLY_PERCENT, 10) || 20,
  windowVarianceMinutes: parseInt(process.env.WINDOW_VARIANCE_MINUTES, 10) || 45,

  // User identity (for admin tracking)
  userName: process.env.USER_NAME || 'unknown',
  team: process.env.TEAM || 'default',
  adminApiUrl: (process.env.ADMIN_API_URL || '').replace(/\/+$/, ''),
  adminApiKey: process.env.ADMIN_API_KEY || '',

  // Paths
  browserProfileDir: path.join(__dirname, '..', 'browser-profile'),
  dbPath: path.join(__dirname, '..', 'data', 'growleads.db'),
  errorsDir: path.join(__dirname, '..', 'data', 'errors'),
  lockfilePath: path.join(__dirname, '..', 'data', 'session.lock'),

  // Auto-Comment
  enableComments: (process.env.ENABLE_COMMENTS || 'false').toLowerCase() === 'true',
  commentDryRun: (process.env.COMMENT_DRY_RUN || 'false').toLowerCase() === 'true',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  dailyCommentMin: parseInt(process.env.DAILY_COMMENT_MIN, 10) || 5,
  dailyCommentMax: parseInt(process.env.DAILY_COMMENT_MAX, 10) || 10,
  commentMinGap: parseInt(process.env.COMMENT_MIN_GAP, 10) || 3,
  commentMaxGap: parseInt(process.env.COMMENT_MAX_GAP, 10) || 8,

  // Keywords & commenting config (loaded on demand)
  loadKeywords,
  loadCommenting,
};

module.exports = config;
