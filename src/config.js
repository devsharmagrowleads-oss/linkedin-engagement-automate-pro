const path = require('path');
const fs = require('fs');

const ENV_PATH = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: ENV_PATH });

const KEYWORDS_PATH = path.join(__dirname, '..', 'config', 'keywords.json');
const COMMENTING_PATH = path.join(__dirname, '..', 'config', 'commenting.json');

function loadKeywords() {
  const raw = fs.readFileSync(KEYWORDS_PATH, 'utf-8');
  const cfg = JSON.parse(raw);
  if (!Array.isArray(cfg.primary)) cfg.primary = [];
  if (!Array.isArray(cfg.secondary)) cfg.secondary = [];
  return cfg;
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
      maxLength: 200,
    };
  }
}

function validateTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    console.warn(`Invalid TIMEZONE "${tz}" — falling back to Asia/Kolkata`);
    return 'Asia/Kolkata';
  }
}

function readEnv() {
  return {
    // Session windows (legacy — used if dynamic scheduling not enabled)
    morningWindow: process.env.MORNING_WINDOW || '08:00-10:00',
    afternoonWindow: process.env.AFTERNOON_WINDOW || '12:00-14:00',
    eveningWindow: process.env.EVENING_WINDOW || '17:00-19:00',

    // Daily targets (0 min allows zero-reaction days naturally)
    dailyTargetMin: parseInt(process.env.DAILY_TARGET_MIN, 10) || 0,
    dailyTargetMax: parseInt(process.env.DAILY_TARGET_MAX, 10) || 45,

    // Timing
    maxJitterMinutes: parseInt(process.env.MAX_JITTER_MINUTES, 10) || 30,
    maxSessionMinutes: parseInt(process.env.MAX_SESSION_MINUTES, 10) || 25,

    // Browser
    timezone: validateTimezone(process.env.TIMEZONE || 'Asia/Kolkata'),
    locale: process.env.LOCALE || 'en-IN',
    viewportWidth: parseInt(process.env.VIEWPORT_WIDTH, 10) || 1366,
    viewportHeight: parseInt(process.env.VIEWPORT_HEIGHT, 10) || 768,

    // Anti-detection behavior
    skipDayPercent: process.env.SKIP_DAY_PERCENT != null ? parseInt(process.env.SKIP_DAY_PERCENT, 10) : 15,
    browseOnlyPercent: process.env.BROWSE_ONLY_PERCENT != null ? parseInt(process.env.BROWSE_ONLY_PERCENT, 10) : 15,
    windowVarianceMinutes: parseInt(process.env.WINDOW_VARIANCE_MINUTES, 10) || 45,

    // Reaction pacing (seconds between reactions — the #1 anti-detection lever)
    reactionDelayMinSec: parseInt(process.env.REACTION_DELAY_MIN_SEC, 10) || 60,
    reactionDelayMaxSec: parseInt(process.env.REACTION_DELAY_MAX_SEC, 10) || 180,

    // Keyword match skip rate (skip this % of matches to look selective)
    matchSkipMin: parseInt(process.env.MATCH_SKIP_MIN, 10) || 60,
    matchSkipMax: parseInt(process.env.MATCH_SKIP_MAX, 10) || 80,

    // Typing speed (ms per character)
    typingSpeedMin: parseInt(process.env.TYPING_SPEED_MIN, 10) || 40,
    typingSpeedMax: parseInt(process.env.TYPING_SPEED_MAX, 10) || 90,

    // New account ramp-up
    enableRampUp: (process.env.ENABLE_RAMP_UP || 'true').toLowerCase() === 'true',

    // User identity (for admin tracking)
    userName: process.env.USER_NAME || 'unknown',
    team: process.env.TEAM || 'default',
    adminApiUrl: (process.env.ADMIN_API_URL || '').replace(/\/+$/, ''),
    adminApiKey: process.env.ADMIN_API_KEY || '',

    // Auto-Comment
    enableComments: (process.env.ENABLE_COMMENTS || 'false').toLowerCase() === 'true',
    commentDryRun: (process.env.COMMENT_DRY_RUN || 'false').toLowerCase() === 'true',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    dailyCommentMin: parseInt(process.env.DAILY_COMMENT_MIN, 10) || 3,
    dailyCommentMax: parseInt(process.env.DAILY_COMMENT_MAX, 10) || 8,
    commentMinGap: parseInt(process.env.COMMENT_MIN_GAP, 10) || 3,
    commentMaxGap: parseInt(process.env.COMMENT_MAX_GAP, 10) || 8,
  };
}

// Account isolation: ACCOUNT env var gives each LinkedIn account its own profile + database
const ACCOUNT = (process.env.ACCOUNT || '').trim();
const accountSuffix = ACCOUNT ? `-${ACCOUNT}` : '';

const config = {
  ...readEnv(),

  // Current account name (empty string = default)
  account: ACCOUNT,

  // Paths — scoped per account when ACCOUNT is set
  browserProfileDir: path.join(__dirname, '..', `browser-profile${accountSuffix}`),
  dbPath: path.join(__dirname, '..', 'data', `growleads${accountSuffix}.db`),
  errorsDir: path.join(__dirname, '..', 'data', `errors${accountSuffix}`),
  lockfilePath: path.join(__dirname, '..', 'data', `session${accountSuffix}.lock`),

  loadKeywords,
  loadCommenting,

  reload() {
    require('dotenv').config({ path: ENV_PATH, override: true });
    Object.assign(config, readEnv());
  },
};

module.exports = config;
