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

// ── Window variance: randomize session windows daily ────────────────

function getWindowVariance() {
  // Use date as seed so variance is consistent within a day but changes daily
  const daySeed = parseInt(db.getTodayStr().replace(/-/g, ''), 10);
  const pseudoRandom = (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  const varianceRange = config.windowVarianceMinutes;
  return Math.floor(pseudoRandom(daySeed) * varianceRange * 2) - varianceRange;
}

// Determine which session window we're in (with daily variance)
function getCurrentWindow() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 60 + minutes;
  const variance = getWindowVariance(); // ±N minutes, consistent per day

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

    // Include a generous buffer after window (for jitter)
    if (time >= startMin && time <= endMin + config.maxJitterMinutes) {
      return w.name;
    }
  }

  return 'manual'; // Outside any window — manual run
}

async function runSession() {
  const windowName = getCurrentWindow();
  log.info(`\n========================================`);
  log.info(`LinkedIn Auto-React Session (${windowName})`);
  log.info(`========================================\n`);

  // ── Check captcha cooldown (#4) ────────────────────────────────
  if (db.isCooldownActive('captcha')) {
    log.warn('Captcha cooldown is active — skipping session to avoid ban escalation.');
    return 0;
  }

  // ── Check skip day (#2) ────────────────────────────────────────
  const today = db.getTodayStr();
  if (windowName !== 'manual') {
    if (db.isSkipDay(today)) {
      log.info('Today is a skip day — no automated sessions. Looks more human.');
      return 0;
    }
    // Decide if today should be a skip day (only on first session check)
    const sessionsToday = db.getSessionsToday();
    if (sessionsToday.length === 0 && Math.random() * 100 < config.skipDayPercent) {
      db.markSkipDay(today);
      log.info(`Randomly skipping today (${config.skipDayPercent}% chance). More human-like pattern.`);
      return 0;
    }
  }

  // Concurrent session guard (atomic lockfile creation with O_EXCL)
  const lockDir = path.dirname(config.lockfilePath);
  if (!fs.existsSync(lockDir)) fs.mkdirSync(lockDir, { recursive: true });

  try {
    // Check for stale lock first
    if (fs.existsSync(config.lockfilePath)) {
      const lockAge = Date.now() - fs.statSync(config.lockfilePath).mtimeMs;
      if (lockAge < 30 * 60 * 1000) {
        log.warn('Another session is running (lockfile exists). Exiting.');
        return 0;
      }
      fs.unlinkSync(config.lockfilePath);
    }
    // Atomic create — fails if another process created it between check and here
    fs.writeFileSync(config.lockfilePath, `${process.pid}`, { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      log.warn('Another session just started (lock race). Exiting.');
      return 0;
    }
    throw err;
  }

  // Random jitter (0 to maxJitterMinutes)
  if (windowName !== 'manual' && !process.env.FORCE_NO_JITTER) {
    const jitterMs = Math.floor(Math.random() * config.maxJitterMinutes * 60 * 1000);
    const jitterMin = Math.round(jitterMs / 60000);
    log.info(`Applying ${jitterMin} minute jitter delay...`);
    await sleep(jitterMs);
  }

  // Database maintenance
  db.pruneOldData();

  // ── Check if this should be a browse-only session (#7) ─────────
  const isBrowseOnly = windowName !== 'manual' && Math.random() * 100 < config.browseOnlyPercent;

  // Set up daily target
  const dailyTarget = db.ensureDailyTarget(config.dailyTargetMin, config.dailyTargetMax);
  const progress = db.getDailyProgress();
  const remaining = dailyTarget.target - progress.achieved;

  if (!isBrowseOnly && remaining <= 0) {
    log.info(`Daily target already met (${progress.achieved}/${dailyTarget.target}). Skipping session.`);
    cleanup();
    return 0;
  }

  // Calculate session target (distribute across remaining windows)
  const sessionsToday = db.getSessionsToday();
  const completedSessions = sessionsToday.filter(s => s.status === 'completed').length;
  const windowCount = [config.morningWindow, config.afternoonWindow, config.eveningWindow].filter(Boolean).length;
  const remainingSessions = Math.max(1, windowCount - completedSessions);
  const minPerSession = Math.ceil(dailyTarget.target / Math.max(1, windowCount));
  const sessionTarget = isBrowseOnly ? 0 : Math.max(minPerSession, Math.ceil(remaining / remainingSessions));

  if (isBrowseOnly) {
    log.info(`Browse-only session — no reactions this round. Diversifying engagement pattern.`);
  } else {
    log.info(`Daily target: ${dailyTarget.target} | Already done: ${progress.achieved} | This session: ~${sessionTarget}`);
  }
  log.warn('Automated session starting. Avoid LinkedIn in your browser for the next ~15 minutes.\n');

  // Load keywords config
  const keywordsConfig = config.loadKeywords();
  const matcher = new KeywordMatcher(keywordsConfig);
  const reactionSelector = new ReactionSelector(keywordsConfig.reactionMap);

  // Start session tracking
  const sessionId = db.startSession(isBrowseOnly ? `${windowName}-browse` : windowName);
  const stats = {
    postsScrolled: 0,
    postsMatched: 0,
    postsReacted: 0,
    postsSkipped: 0,
    status: 'completed',
    errorMessage: null,
  };

  let context;
  const sessionStartedAt = new Date().toISOString();
  let linkedinIdentity = { name: 'Unknown', url: '' };

  try {
    // Launch browser
    const browser = await launchBrowser();
    context = browser.context;
    const page = browser.page;

    // Validate session and extract LinkedIn identity
    const sessionCheck = await validateSession(page);
    if (!sessionCheck.valid) {
      log.error('LinkedIn session is expired. Please click "Login to LinkedIn" in the dashboard.');
      stats.status = 'error';
      stats.errorMessage = 'Session expired';
      return 2;
    }
    linkedinIdentity = { name: sessionCheck.linkedinName, url: sessionCheck.linkedinUrl };

    // ── Random initial navigation (#9) — sometimes check other pages first
    if (Math.random() < 0.35) {
      await randomNavigation(page);
    }

    // ── Browse-only session (#7) ─────────────────────────────────
    if (isBrowseOnly) {
      const variance = Math.floor(config.maxSessionMinutes * 0.2);
      const browseMinutes = Math.max(5, config.maxSessionMinutes - variance + Math.floor(Math.random() * (variance * 2 + 1)));
      await browseOnlySession(page, browseMinutes);

      log.info(`\n--- Session Summary ---`);
      log.info(`Browse-only session completed (no reactions)`);
      return 0;
    }

    // Validate that LinkedIn selectors still work
    const selectorCheck = await validateSelectors(page);
    if (!selectorCheck.valid) {
      stats.status = 'error';
      stats.errorMessage = 'Selectors outdated — LinkedIn DOM may have changed';
      return 3;
    }

    let reactedThisSession = 0;
    let postsSinceLastNav = 0; // Track posts since last navigation diversion

    // Randomize max session duration — vary by ±20% around the configured value
    const variance = Math.floor(config.maxSessionMinutes * 0.2);
    const sessionMaxMinutes = Math.max(10, config.maxSessionMinutes - variance + Math.floor(Math.random() * (variance * 2 + 1)));

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

          // ── Expand "see more" on some posts (#6) — even non-matching ones
          if (Math.random() < 0.12) {
            const postEl = page.locator(`div[componentkey="${post.urn}"]`).first();
            const visible = await postEl.isVisible().catch(() => false);
            if (visible) {
              await expandPost(page, postEl);
            }
          }

          // Check duplicate
          if (db.isAlreadyReacted(post.urn)) continue;

          // Match keywords
          const match = matcher.matchAllTiers(post.text);
          if (!match) continue;

          stats.postsMatched++;

          // Occasional skip
          if (shouldSkip(stats.postsMatched, sessionTarget - reactedThisSession)) {
            stats.postsSkipped++;
            continue;
          }

          // Select reaction type
          const reactionType = reactionSelector.selectReaction(post.text);

          // React
          const success = await reactToPost(page, post, reactionType);
          if (success) {
            const logged = db.logReaction(sessionId, post, reactionType, match.level, match.keyword);
            if (logged) {
              reactedThisSession++;
              stats.postsReacted++;
              log.info(`  [${reactedThisSession}/${sessionTarget}] ${reactionType} → "${post.author}" (${match.level}: "${match.keyword}")`);
            }
          }

          // ── Visit author profile sometimes (#5) — 15% chance after reacting
          if (Math.random() < 0.15) {
            await visitProfile(page, post.author);
          }

          // Delay between reactions
          await sleep(humanDelay(3000, 15000));
        }

        // ── Random navigation between scroll batches (#9)
        // Every ~20 posts, do a random navigation to break the pattern
        if (postsSinceLastNav >= 15 + Math.floor(Math.random() * 10)) {
          postsSinceLastNav = 0;
          if (Math.random() < 0.3) {
            await randomNavigation(page);
          }
        }
      },
      // shouldStop callback
      () => reactedThisSession >= sessionTarget
    );

    log.info(`\n--- Session Summary ---`);
    printSessionSummary(sessionId, stats, dailyTarget);

  } catch (err) {
    const msg = (err.message || '').toLowerCase();

    // Detect session expiry mid-run (auth redirect, login wall)
    const isAuthError = msg.includes('login') || msg.includes('authwall')
      || msg.includes('checkpoint') || msg.includes('/uas/');
    if (isAuthError) {
      stats.status = 'error';
      stats.errorMessage = 'Session expired mid-run';
      log.warn('LinkedIn session expired during session — ending gracefully.');
      log.warn('Please re-login via the dashboard before the next session.');
    } else {
      stats.status = 'error';
      stats.errorMessage = err.message;
      log.error(`Session error: ${err.message}`);
    }

    // Try to take a screenshot on error
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
    } catch {} // ignore screenshot errors

    // ── Captcha cooldown (#4) — actually enforce a cooldown period
    if (msg.includes('captcha') || msg.includes('challenge')) {
      log.warn('CAPTCHA detected — setting 24-hour cooldown to avoid ban escalation');
      db.setCooldown('captcha', 24); // 24 hour cooldown
    }
  } finally {
    // Single endSession call — always runs, never duplicated
    db.endSession(sessionId, stats);

    // Report to admin server (fire-and-forget)
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
      startedAt: sessionStartedAt,
    });

    if (context) {
      await context.close().catch(() => {});
    }
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
  log.info(`Daily progress: ${progress.achieved}/${dailyTarget.target}`);
  log.info(`Status: ${stats.status}`);
}

function cleanup() {
  try {
    if (fs.existsSync(config.lockfilePath)) {
      fs.unlinkSync(config.lockfilePath);
    }
  } catch {} // ignore cleanup errors
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log.warn('Received SIGINT, shutting down gracefully...');
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.warn('Received SIGTERM, shutting down gracefully...');
  cleanup();
  process.exit(0);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  log.error(`Unhandled rejection: ${err.message || err}`);
  cleanup();
  process.exit(1);
});

// ── Daemon mode ──────────────────────────────────────────────────────
// Usage: node src/index.js --daemon
// Stays alive, checks every 5 minutes if we're inside a session window,
// and runs a session when the time is right.

async function daemon() {
  log.info('Daemon mode started. Will auto-trigger sessions during configured windows.');
  log.info(`Anti-detection: ${config.skipDayPercent}% skip-day chance, ${config.browseOnlyPercent}% browse-only chance, ±${config.windowVarianceMinutes}min window variance`);
  const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  while (true) {
    const window = getCurrentWindow();
    if (window !== 'manual') {
      log.info(`Inside "${window}" window — checking if session needed...`);
      const progress = db.getDailyProgress();
      const target = db.ensureDailyTarget(config.dailyTargetMin, config.dailyTargetMax);
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
