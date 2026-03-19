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

  log.info(`Starting feed scroll (max ${maxMinutes} minutes)...`);

  while (Date.now() - startTime < maxMs) {
    // Check if we should stop (quota met)
    if (shouldStop()) {
      log.info('Session quota reached, stopping scroll');
      break;
    }

    // Extract currently visible posts
    const posts = await extractVisiblePosts(page);
    const newPosts = posts.filter(p => !seenUrns.has(p.urn));

    for (const post of newPosts) {
      seenUrns.add(post.urn);
    }

    totalScrolled += newPosts.length;

    // Notify about new posts
    if (newPosts.length > 0) {
      await onPostsFound(newPosts);
    }

    // Human-like scroll
    await humanScroll(page);

    // Wait between scroll batches
    await sleep(humanDelay(1500, 4000));

    // Occasionally do a longer pause (simulating reading an interesting post)
    if (Math.random() < 0.15) {
      await sleep(humanDelay(5000, 12000));
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log.info(`Feed scroll complete: ${totalScrolled} posts seen in ${elapsed}s`);

  return { totalScrolled };
}

module.exports = { scrollFeed };
