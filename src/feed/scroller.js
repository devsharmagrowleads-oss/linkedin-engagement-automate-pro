const { humanScroll, humanDelay, sleep } = require('../behavior/human');
const { extractVisiblePosts } = require('./extractor');
const log = require('../utils/logger');

/**
 * Scroll the LinkedIn feed and collect posts
 * Returns posts discovered during scrolling
 *
 * @param {Object} page - Playwright page
 * @param {number} maxMinutes - Max session duration
 * @param {Function} onPostsFound - Callback when new posts are found
 * @param {Function} shouldStop - Callback to check if we should stop (quota met)
 */
async function scrollFeed(page, maxMinutes, onPostsFound, shouldStop) {
  const startTime = Date.now();
  const maxMs = maxMinutes * 60 * 1000;
  const seenUrns = new Set();
  let totalScrolled = 0;
  let noNewPostStreak = 0;

  log.info(`Starting feed scroll (max ${maxMinutes} minutes)...`);

  while (Date.now() - startTime < maxMs) {
    // Check if we should stop (quota met)
    if (shouldStop()) {
      log.info('Session quota reached, stopping scroll');
      break;
    }

    // Mid-session auth check — detect if LinkedIn redirected to login
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/authwall') || currentUrl.includes('/checkpoint')) {
      throw new Error('Session expired: redirected to login page mid-session');
    }

    // Extract currently visible posts
    const posts = await extractVisiblePosts(page);
    if (totalScrolled === 0 && posts.length === 0) {
      log.warn('No posts found on first scroll — selectors may need updating');
    }
    const newPosts = posts.filter(p => !seenUrns.has(p.urn));

    for (const post of newPosts) {
      seenUrns.add(post.urn);
    }

    totalScrolled += newPosts.length;

    // Track consecutive scrolls with no new posts
    if (newPosts.length === 0) {
      noNewPostStreak++;
      // If stuck for 5+ scrolls, do a bigger scroll to skip past a sticky section
      if (noNewPostStreak >= 5) {
        log.info('No new posts for a while, scrolling further...');
        await page.mouse.wheel(0, 1500);
        await sleep(humanDelay(1000, 2000));
        noNewPostStreak = 0;
        continue;
      }
    } else {
      noNewPostStreak = 0;
    }

    // Notify about new posts
    if (newPosts.length > 0) {
      await onPostsFound(newPosts);
    }

    // Human-like scroll
    await humanScroll(page);

    // Wait between scroll batches (shorter delays to find more posts)
    await sleep(humanDelay(1000, 3000));

    // Occasionally do a longer pause (simulating reading), but less often
    if (Math.random() < 0.10) {
      await sleep(humanDelay(3000, 8000));
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log.info(`Feed scroll complete: ${totalScrolled} posts seen in ${elapsed}s`);

  return { totalScrolled };
}

module.exports = { scrollFeed };
