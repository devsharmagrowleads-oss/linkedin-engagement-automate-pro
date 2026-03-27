const fs = require('fs');
const path = require('path');
const config = require('./config');
const log = require('./utils/logger');
const { launchBrowser } = require('./browser/launch');
const { validateSession } = require('./browser/session');
const { scrollFeed } = require('./feed/scroller');
const { reactToPost } = require('./feed/reactor');
const { validateSelectors } = require('./feed/selectors');
const { KeywordMatcher } = require('./matching/keywords');
const { ReactionSelector } = require('./matching/reactions');
const { humanDelay, sleep, shouldSkip } = require('./behavior/human');
const { visitProfile, expandPost, randomNavigation, browseOnlySession } = require('./behavior/navigation');
const { reportSession } = require('./reporting/reporter');
const db = require('./database/db');
const { tryCommentOnPost } = require('./feed/comment-orchestrator');
const { generateSessionPersonality } = require('./behavior/session-personality');
const { getAccountMaturityMultiplier } = require('./behavior/ramp-up');

// ── Module-level session tracking (for signal handlers) ─────────────
let _activeSessionId = null;
let _activeStats = null;

const LOCK_STALE_TTL = 30 * 60 * 1000; // 30 minutes

// ── Window variance: TRUE random (not date-seeded) ──────────────────

function getWindowVariance() {
  const varianceRange = config.windowVarianceMinutes;
  return Math.floor(Math.random() * varianceRange * 2) - varianceRange;
}

function getCurrentWindow() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 60 + minutes;
  const variance = getWindowVariance();

  const windows = [
    { name: 'morning', env: config.morningWindow },
    { name: 'afternoon', env: config.afternoonWindow },
    { name: 'evening', env: config.eveningWindow },
  ];

  for (const w of windows) {
    const [start, end] = w.env.split('-');
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMin = sh * 60 + sm + variance;
    const endMin = eh * 60 + em + variance;

    if (time >= startMin && time <= endMin + config.maxJitterMinutes) {
      return w.name;
    }
  }

  return 'manual';
}

async function runSession() {
  const windowName = getCurrentWindow();
  log.info(`\n========================================`);
  log.info(`LinkedIn Auto-React Session (${windowName})`);
  log.info(`========================================\n`);

  // ── Check captcha cooldown ────────────────────────────────────
  if (db.isCooldownActive('captcha')) {
    log.warn('Captcha cooldown is active — skipping session to avoid ban escalation.');
    return 0;
  }

  // ── Check skip day (applies to all modes including manual) ───
  const today = db.getTodayStr();
  const sessionsToday = db.getSessionsToday();
  if (db.isSkipDay(today)) {
    log.info('Today is a skip day — no sessions. Override with FORCE_NO_SKIP=1.');
    if (!process.env.FORCE_NO_SKIP) return 0;
    log.info('FORCE_NO_SKIP set — proceeding anyway.');
  } else if (sessionsToday.length === 0 && Math.random() * 100 < config.skipDayPercent) {
    db.markSkipDay(today);
    log.info(`Randomly skipping today (${config.skipDayPercent}% chance). Override with FORCE_NO_SKIP=1.`);
    if (!process.env.FORCE_NO_SKIP) return 0;
    log.info('FORCE_NO_SKIP set — proceeding anyway.');
  }

  // Concurrent session guard
  const lockDir = path.dirname(config.lockfilePath);
  if (!fs.existsSync(lockDir)) fs.mkdirSync(lockDir, { recursive: true });

  try {
    if (fs.existsSync(config.lockfilePath)) {
      const lockAge = Date.now() - fs.statSync(config.lockfilePath).mtimeMs;
      if (lockAge < LOCK_STALE_TTL) {
        log.warn('Another session is running (lockfile exists). Exiting.');
        return 0;
      }
      fs.unlinkSync(config.lockfilePath);
    }
    fs.writeFileSync(config.lockfilePath, `${process.pid}`, { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      log.warn('Another session just started (lock race). Exiting.');
      return 0;
    }
    throw err;
  }

  // Random jitter (shorter for manual mode so you're not waiting forever)
  if (!process.env.FORCE_NO_JITTER) {
    const maxJitter = windowName === 'manual'
      ? Math.min(config.maxJitterMinutes, 5)  // manual: cap at 5 min
      : config.maxJitterMinutes;               // daemon: full range
    const jitterMs = Math.floor(Math.random() * maxJitter * 60 * 1000);
    const jitterMin = Math.round(jitterMs / 60000);
    log.info(`Applying ${jitterMin} minute jitter delay...`);
    await sleep(jitterMs);
  }

  db.pruneOldData();

  // ── Generate session personality ──────────────────────────────
  const personality = generateSessionPersonality({
    reactionDelayMinSec: config.reactionDelayMinSec,
    reactionDelayMaxSec: config.reactionDelayMaxSec,
    matchSkipMin: config.matchSkipMin,
    matchSkipMax: config.matchSkipMax,
    typingSpeedMin: config.typingSpeedMin,
    typingSpeedMax: config.typingSpeedMax,
  });
  log.info(`Session personality: ${personality.tempo} tempo, ${personality.sessionType} style, fatigue=${personality.fatigueRate.toFixed(3)}`);

  // ── Account maturity ramp-up ──────────────────────────────────
  const maturity = config.enableRampUp ? getAccountMaturityMultiplier(db) : 1.0;
  if (maturity < 1.0) {
    log.info(`Account ramp-up active: ${Math.round(maturity * 100)}% activity level`);
  }

  // ── Browse-only session check (applies to all modes) ─────────
  const isBrowseOnly = Math.random() * 100 < config.browseOnlyPercent;

  // ── Daily target with ramp-up applied ─────────────────────────
  const adjustedMin = Math.round(config.dailyTargetMin * maturity);
  const adjustedMax = Math.round(config.dailyTargetMax * maturity);
  const dailyTarget = db.ensureDailyTarget(adjustedMin, adjustedMax);
  const progress = db.getDailyProgress();
  const remaining = dailyTarget.target - progress.achieved;

  if (!isBrowseOnly && remaining <= 0) {
    log.info(`Daily target already met (${progress.achieved}/${dailyTarget.target}). Skipping.`);
    cleanup();
    return 0;
  }

  // Calculate session target
  const completedSessions = sessionsToday.filter(s => s.status === 'completed').length;
  const windowCount = [config.morningWindow, config.afternoonWindow, config.eveningWindow].filter(Boolean).length;
  const remainingSessions = Math.max(1, windowCount - completedSessions);
  const minPerSession = Math.ceil(dailyTarget.target / Math.max(1, windowCount));
  const sessionTarget = isBrowseOnly ? 0 : Math.max(minPerSession, Math.ceil(remaining / remainingSessions));

  if (isBrowseOnly) {
    log.info(`Browse-only session — no reactions. Diversifying engagement pattern.`);
  } else {
    log.info(`Daily target: ${dailyTarget.target} | Already done: ${progress.achieved} | This session: ~${sessionTarget}`);
  }
  log.warn('Automated session starting. Avoid LinkedIn in your browser.\n');

  // Load keywords config
  const keywordsConfig = config.loadKeywords();
  const matcher = new KeywordMatcher(keywordsConfig);
  const reactionSelector = new ReactionSelector(keywordsConfig.reactionMap);

  // ── Auto-Comment setup ────────────────────────────────────────
  const commentingEnabled = config.enableComments && config.openaiApiKey;
  let commentConfig = null;
  let commentDailyTarget = null;
  let sessionCommentTarget = 0;

  if (commentingEnabled) {
    commentConfig = config.loadCommenting();
    const adjCommentMin = Math.round(config.dailyCommentMin * maturity);
    const adjCommentMax = Math.round(config.dailyCommentMax * maturity);
    commentDailyTarget = db.ensureCommentDailyTarget(adjCommentMin, adjCommentMax);
    const commentProgress = db.getCommentDailyProgress();
    const commentRemaining = commentDailyTarget.target - commentProgress.achieved;
    const sessionCommentMin = Math.ceil(commentDailyTarget.target / Math.max(1, windowCount));
    sessionCommentTarget = isBrowseOnly ? 0 : Math.max(sessionCommentMin, Math.ceil(commentRemaining / remainingSessions));

    if (config.commentDryRun) log.info(`Auto-Comment: DRY RUN mode`);
    log.info(`Auto-Comment: target ${commentDailyTarget.target}/day | Done: ${commentProgress.achieved} | This session: ~${sessionCommentTarget}`);
  } else if (config.enableComments && !config.openaiApiKey) {
    log.warn('Auto-Comment: enabled but OPENAI_API_KEY not set — commenting disabled');
  }

  // Start session tracking
  const sessionId = db.startSession(isBrowseOnly ? `${windowName}-browse` : windowName);
  _activeSessionId = sessionId;
  const stats = {
    postsScrolled: 0, postsMatched: 0, postsReacted: 0,
    postsSkipped: 0, postsCommented: 0, status: 'completed', errorMessage: null,
  };
  _activeStats = stats;

  let context;
  const sessionStartedAt = new Date().toISOString();
  let linkedinIdentity = { name: 'Unknown', url: '' };

  try {
    const browser = await launchBrowser();
    context = browser.context;
    const page = browser.page;

    const sessionCheck = await validateSession(page);
    if (!sessionCheck.valid) {
      log.error('LinkedIn session is expired. Please click "Login to LinkedIn" in the dashboard.');
      stats.status = 'error';
      stats.errorMessage = 'Session expired';
      return 2;
    }
    linkedinIdentity = { name: sessionCheck.linkedinName, url: sessionCheck.linkedinUrl };

    // ── Initial navigation (personality-driven) ──────────────────
    if (Math.random() < personality.initialNavChance) {
      await randomNavigation(page, personality);
    }

    // ── Browse-only session ──────────────────────────────────────
    if (isBrowseOnly) {
      const variance = Math.floor(config.maxSessionMinutes * 0.3);
      const browseMinutes = Math.max(5, config.maxSessionMinutes - variance + Math.floor(Math.random() * (variance * 2 + 1)));
      await browseOnlySession(page, browseMinutes, personality);
      log.info(`\n--- Session Summary ---`);
      log.info(`Browse-only session completed (no reactions)`);
      return 0;
    }

    const selectorCheck = await validateSelectors(page);
    if (!selectorCheck.valid) {
      stats.status = 'error';
      stats.errorMessage = 'Selectors outdated — LinkedIn DOM may have changed';
      return 3;
    }

    let reactedThisSession = 0;
    let postsSinceLastNav = 0;

    // Comment tracking
    let postsSinceLastComment = 0;
    let sessionCommentsFailed = 0;
    let recentSessionComments = [];
    const commentGap = config.commentMinGap + Math.floor(Math.random() * (config.commentMaxGap - config.commentMinGap + 1));

    // Session duration with ±30% variance
    const durationVariance = Math.floor(config.maxSessionMinutes * 0.3);
    const sessionMaxMinutes = Math.max(10, config.maxSessionMinutes - durationVariance + Math.floor(Math.random() * (durationVariance * 2 + 1)));
    const sessionStartMs = Date.now();

    // Scroll feed and react to matching posts
    await scrollFeed(
      page,
      sessionMaxMinutes,
      // onPostsFound callback
      async (newPosts) => {
        stats.postsScrolled += newPosts.length;
        postsSinceLastNav += newPosts.length;

        for (const post of newPosts) {
          if (reactedThisSession >= sessionTarget) break;

          // Expand "see more" (personality-driven probability)
          if (Math.random() < personality.expandPostChance) {
            const postEl = page.locator(`div[componentkey="${post.urn}"]`).first();
            const visible = await postEl.isVisible().catch(() => false);
            if (visible) await expandPost(page, postEl);
          }

          if (db.isAlreadyReacted(post.urn)) continue;

          const match = matcher.matchAllTiers(post.text);
          if (!match) continue;

          stats.postsMatched++;

          // Skip check (personality-driven: 60-80% of matches get skipped)
          if (shouldSkip(stats.postsMatched, sessionTarget - reactedThisSession, personality)) {
            stats.postsSkipped++;
            continue;
          }

          const reactionType = reactionSelector.selectReaction(post.text);

          // React with personality
          const success = await reactToPost(page, post, reactionType, personality);
          if (success) {
            const logged = db.logReaction(sessionId, post, reactionType, match.level, match.keyword);
            if (logged) {
              reactedThisSession++;
              stats.postsReacted++;
              log.info(`  [${reactedThisSession}/${sessionTarget}] ${reactionType} → "${post.author}" (${match.level}: "${match.keyword}")`);
            }
          }

          // Visit profile (personality-driven probability)
          if (Math.random() < personality.profileVisitChance) {
            await visitProfile(page, post.author, personality);
          }

          // Delay between reactions — personality-driven + session fatigue
          const fatigueFactor = 1 + (reactedThisSession * personality.fatigueRate);
          await sleep(humanDelay(
            Math.round(personality.reactionDelayRange[0] * fatigueFactor),
            Math.round(personality.reactionDelayRange[1] * fatigueFactor)
          ));

          // Occasional long distraction pause (stepped away, phone call, etc.)
          if (Math.random() < personality.distractionChance) {
            const pauseMs = humanDelay(personality.distractionRange[0], personality.distractionRange[1]);
            log.info(`  [behavior] Taking a ${Math.round(pauseMs / 1000)}s break...`);
            await sleep(pauseMs);
          }

          // ── Auto-Comment decision ──────────────────────────────
          postsSinceLastComment++;
          const sessionElapsedMin = (Date.now() - sessionStartMs) / 60000;

          const shouldComment = commentingEnabled && !isBrowseOnly
            && sessionElapsedMin < sessionMaxMinutes - 5
            && sessionCommentsFailed < 3
            && stats.postsCommented < sessionCommentTarget
            && postsSinceLastComment >= commentGap
            && match
            && (post.reactionCount >= commentConfig.minEngagementReactions || post.commentCount >= commentConfig.minEngagementComments)
            && !db.isAlreadyCommented(post.urn);

          if (shouldComment) {
            const commentResult = await tryCommentOnPost(page, post, {
              sessionId, commentConfig, recentSessionComments,
              openaiModel: config.openaiModel, openaiApiKey: config.openaiApiKey,
              dryRun: config.commentDryRun,
              matchLevel: match.level, matchKeyword: match.keyword,
              personality,
            });

            if (commentResult.apiError) sessionCommentsFailed++;
            if (commentResult.commented) {
              postsSinceLastComment = 0;
              stats.postsCommented++;
              sessionCommentsFailed = 0;
              if (commentResult.commentText) {
                recentSessionComments.push(commentResult.commentText);
                if (recentSessionComments.length > 5) recentSessionComments.shift();
              }
              log.info(`  [Comment ${stats.postsCommented}/${sessionCommentTarget}] → "${post.author}"`);
            }
            await sleep(humanDelay(3000, 8000));
          }
        }

        // Random navigation (personality-driven interval and probability)
        const navThreshold = personality.navIntervalRange[0]
          + Math.floor(Math.random() * (personality.navIntervalRange[1] - personality.navIntervalRange[0]));
        if (postsSinceLastNav >= navThreshold) {
          postsSinceLastNav = 0;
          if (Math.random() < personality.navDiversionChance) {
            await randomNavigation(page, personality);
          }
        }
      },
      // shouldStop callback
      () => reactedThisSession >= sessionTarget,
      personality
    );

    log.info(`\n--- Session Summary ---`);
    printSessionSummary(sessionId, stats, dailyTarget);

  } catch (err) {
    const msg = (err.message || '').toLowerCase();

    const isAuthError = msg.includes('login') || msg.includes('authwall')
      || msg.includes('checkpoint') || msg.includes('/uas/');
    if (isAuthError) {
      stats.status = 'error';
      stats.errorMessage = 'Session expired mid-run';
      log.warn('LinkedIn session expired during session — ending gracefully.');
    } else {
      stats.status = 'error';
      stats.errorMessage = err.message;
      log.error(`Session error: ${err.message}`);
    }

    try {
      if (context) {
        const page = context.pages()[0];
        if (page) {
          const errDir = config.errorsDir;
          if (!fs.existsSync(errDir)) fs.mkdirSync(errDir, { recursive: true });
          const screenshotPath = path.join(errDir, `error_${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          log.info(`Error screenshot saved: ${screenshotPath}`);
        }
      }
    } catch {}

    if (msg.includes('captcha') || msg.includes('challenge')) {
      log.warn('CAPTCHA detected — setting 24-hour cooldown');
      db.setCooldown('captcha', 24);
    }
  } finally {
    db.endSession(sessionId, stats);

    await reportSession({
      linkedinName: linkedinIdentity.name,
      linkedinUrl: linkedinIdentity.url,
      sessionId,
      window: isBrowseOnly ? `${windowName}-browse` : windowName,
      status: stats.status,
      postsScrolled: stats.postsScrolled,
      postsMatched: stats.postsMatched,
      postsReacted: stats.postsReacted,
      postsSkipped: stats.postsSkipped,
      postsCommented: stats.postsCommented,
      startedAt: sessionStartedAt,
    });

    if (context) await context.close().catch(() => {});
    _activeSessionId = null;
    _activeStats = null;
    cleanup();
  }

  return stats.status === 'error' ? 1 : 0;
}

function printSessionSummary(sessionId, stats, dailyTarget) {
  const summary = db.getSessionSummary(sessionId);
  const progress = db.getDailyProgress();
  const reactionBreakdown = summary.reactions.map(r => `${r.count} ${r.reaction_type}`).join(', ');
  const matchBreakdown = summary.matchLevels.map(m => `${m.count} ${m.match_level}`).join(', ');
  log.info(`Reactions: ${stats.postsReacted} (${reactionBreakdown || 'none'})`);
  log.info(`Match breakdown: ${matchBreakdown || 'none'}`);
  log.info(`Posts scrolled: ${stats.postsScrolled} | Matched: ${stats.postsMatched} | Skipped: ${stats.postsSkipped}`);
  if (stats.postsCommented > 0) log.info(`Comments posted: ${stats.postsCommented}`);
  log.info(`Daily progress: ${progress.achieved}/${dailyTarget.target}`);
  log.info(`Status: ${stats.status}`);
}

function cleanup() {
  try {
    if (fs.existsSync(config.lockfilePath)) fs.unlinkSync(config.lockfilePath);
  } catch {}
}

// ── Graceful shutdown ────────────────────────────────────────────────

function gracefulShutdown(signal, exitCode = 0) {
  log.warn(`Received ${signal}, shutting down gracefully...`);
  if (_activeSessionId) {
    try {
      const shutdownStats = _activeStats || {};
      shutdownStats.status = 'stopped';
      shutdownStats.errorMessage = `Process received ${signal}`;
      db.endSession(_activeSessionId, shutdownStats);
    } catch {}
    _activeSessionId = null;
    _activeStats = null;
  }
  cleanup();
  process.exit(exitCode);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));

process.on('exit', () => {
  if (_activeSessionId) {
    try { db.forceEndSession(_activeSessionId, 'Process exited unexpectedly'); } catch {}
    _activeSessionId = null;
  }
});

process.on('unhandledRejection', (err) => {
  log.error(`Unhandled rejection: ${err.message || err}`);
  gracefulShutdown('unhandledRejection', 1);
});

// ── Daemon mode ──────────────────────────────────────────────────────

async function daemon() {
  log.info('Daemon mode started. Will auto-trigger sessions during configured windows.');
  log.info(`Anti-detection: ${config.skipDayPercent}% skip-day, ${config.browseOnlyPercent}% browse-only, ±${config.windowVarianceMinutes}min variance`);
  const CHECK_INTERVAL = 5 * 60 * 1000;

  while (true) {
    const window = getCurrentWindow();
    if (window !== 'manual') {
      log.info(`Inside "${window}" window — checking if session needed...`);
      const maturity = config.enableRampUp ? getAccountMaturityMultiplier(db) : 1.0;
      const adjustedMax = Math.round(config.dailyTargetMax * maturity);
      const target = db.ensureDailyTarget(Math.round(config.dailyTargetMin * maturity), adjustedMax);
      const progress = db.getDailyProgress();
      if (progress.achieved < target.target) {
        await runSession();
      } else {
        log.info(`Daily target already met (${progress.achieved}/${target.target}). Sleeping.`);
      }
    }
    await sleep(CHECK_INTERVAL);
  }
}

// Run
if (process.argv.includes('--daemon')) {
  daemon().catch(err => {
    log.error(`Daemon fatal error: ${err.message}`);
    cleanup();
    process.exit(1);
  });
} else {
  runSession().then(code => {
    process.exit(code || 0);
  }).catch(err => {
    log.error(`Fatal error: ${err.message}`);
    cleanup();
    process.exit(1);
  });
}
