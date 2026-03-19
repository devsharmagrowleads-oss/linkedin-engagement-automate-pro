const fs = require('fs');
const path = require('path');
const config = require('./config');
const log = require('./utils/logger');
const { launchBrowser } = require('./browser/launch');
const { validateSession } = require('./browser/session');
const { scrollFeed } = require('./feed/scroller');
const { reactToPost } = require('./feed/reactor');
const { KeywordMatcher } = require('./matching/keywords');
const { ReactionSelector } = require('./matching/reactions');
const { humanDelay, sleep, shouldSkip } = require('./behavior/human');
const db = require('./database/db');

// Determine which session window we're in
function getCurrentWindow() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 60 + minutes;

  const windows = [
    { name: 'morning', env: config.morningWindow },
    { name: 'afternoon', env: config.afternoonWindow },
    { name: 'evening', env: config.eveningWindow },
  ];

  for (const w of windows) {
    const [start, end] = w.env.split('-');
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

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

  // Concurrent session guard
  if (fs.existsSync(config.lockfilePath)) {
    const lockAge = Date.now() - fs.statSync(config.lockfilePath).mtimeMs;
    if (lockAge < 30 * 60 * 1000) { // Lock is less than 30 min old
      log.warn('Another session is running (lockfile exists). Exiting.');
      process.exit(0);
    }
    // Stale lock, remove it
    fs.unlinkSync(config.lockfilePath);
  }

  // Create lockfile
  const lockDir = path.dirname(config.lockfilePath);
  if (!fs.existsSync(lockDir)) fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(config.lockfilePath, `${process.pid}`);

  // Random jitter (0 to maxJitterMinutes)
  if (windowName !== 'manual' && !process.env.FORCE_NO_JITTER) {
    const jitterMs = Math.floor(Math.random() * config.maxJitterMinutes * 60 * 1000);
    const jitterMin = Math.round(jitterMs / 60000);
    log.info(`Applying ${jitterMin} minute jitter delay...`);
    await sleep(jitterMs);
  }

  // Database maintenance
  db.pruneOldData();

  // Set up daily target
  const dailyTarget = db.ensureDailyTarget(config.dailyTargetMin, config.dailyTargetMax);
  const progress = db.getDailyProgress();
  const remaining = dailyTarget.target - progress.achieved;

  if (remaining <= 0) {
    log.info(`Daily target already met (${progress.achieved}/${dailyTarget.target}). Skipping session.`);
    cleanup();
    process.exit(0);
  }

  // Calculate session target (distribute across remaining windows)
  const sessionsToday = db.getSessionsToday();
  const completedSessions = sessionsToday.filter(s => s.status === 'completed').length;
  const totalSessions = 3;
  const remainingSessions = Math.max(1, totalSessions - completedSessions);
  const sessionTarget = Math.ceil(remaining / remainingSessions);

  log.info(`Daily target: ${dailyTarget.target} | Already done: ${progress.achieved} | This session: ~${sessionTarget}`);
  log.warn('Automated session starting. Avoid LinkedIn in your browser for the next ~15 minutes.\n');

  // Load keywords config
  const keywordsConfig = config.loadKeywords();
  const matcher = new KeywordMatcher(keywordsConfig);
  const reactionSelector = new ReactionSelector(keywordsConfig.reactionMap);

  // Start session tracking
  const sessionId = db.startSession(windowName);
  const stats = {
    postsScrolled: 0,
    postsMatched: 0,
    postsReacted: 0,
    postsSkipped: 0,
    status: 'completed',
    errorMessage: null,
  };

  let context;

  try {
    // Launch browser
    const browser = await launchBrowser();
    context = browser.context;
    const page = browser.page;

    // Validate session
    const isValid = await validateSession(page);
    if (!isValid) {
      log.error('LinkedIn session is expired. Please run "npm run login" first.');
      stats.status = 'error';
      stats.errorMessage = 'Session expired';
      db.endSession(sessionId, stats);
      cleanup();
      process.exit(2);
    }

    let reactedThisSession = 0;

    // Randomize max session duration (within bounds)
    const sessionMaxMinutes = config.maxSessionMinutes - 5 + Math.floor(Math.random() * 10);

    // Scroll feed and react to matching posts
    await scrollFeed(
      page,
      sessionMaxMinutes,
      // onPostsFound callback
      async (newPosts) => {
        stats.postsScrolled += newPosts.length;

        for (const post of newPosts) {
          if (reactedThisSession >= sessionTarget) break;

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

          // Delay between reactions
          await sleep(humanDelay(3000, 15000));
        }
      },
      // shouldStop callback
      () => reactedThisSession >= sessionTarget
    );

    log.info(`\n--- Session Summary ---`);
    printSessionSummary(sessionId, stats, dailyTarget);

  } catch (err) {
    stats.status = 'error';
    stats.errorMessage = err.message;
    log.error(`Session error: ${err.message}`);

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

    // Determine exit code based on error type
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('captcha') || msg.includes('challenge')) {
      log.warn('CAPTCHA detected — extending cooldown for next session');
      db.endSession(sessionId, stats);
      cleanup();
      process.exit(1);
    }
  } finally {
    db.endSession(sessionId, stats);
    if (context) {
      await context.close().catch(() => {});
    }
    cleanup();
  }
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

// Run
runSession().catch(err => {
  log.error(`Fatal error: ${err.message}`);
  cleanup();
  process.exit(1);
});
