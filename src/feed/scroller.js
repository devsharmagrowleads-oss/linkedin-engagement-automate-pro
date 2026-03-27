const { humanScroll, humanDelay, sleep } = require('../behavior/human');
const { extractVisiblePosts } = require('./extractor');
const log = require('../utils/logger');

/**
 * Scroll the LinkedIn feed and collect posts.
 * Personality-driven timing: fast sessions scroll quickly, contemplative ones pause to read.
 */
async function scrollFeed(page, maxMinutes, onPostsFound, shouldStop, personality) {
  const p = personality || {};
  const startTime = Date.now();
  const maxMs = maxMinutes * 60 * 1000;
  const seenUrns = new Set();
  let totalScrolled = 0;
  let noNewPostStreak = 0;

  // Personality-driven timing
  const scrollDelayMin = Math.round((p.tempo === 'fast' ? 800 : p.tempo === 'contemplative' ? 2500 : 1200) * (p.scrollSpeedFactor || 1.0));
  const scrollDelayMax = Math.round((p.tempo === 'fast' ? 2200 : p.tempo === 'contemplative' ? 5500 : 3500) * (p.scrollSpeedFactor || 1.0));
  const longPauseChance = p.longReadChance || 0.07;

  log.info(`Starting feed scroll (max ${maxMinutes} min, ${p.tempo || 'normal'} tempo)...`);

  while (Date.now() - startTime < maxMs) {
    if (shouldStop()) {
      log.info('Session quota reached, stopping scroll');
      break;
    }

    // Mid-session auth check
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/authwall') || currentUrl.includes('/checkpoint') || currentUrl.includes('/uas/')) {
      throw new Error('Session expired: redirected to login page mid-session');
    }

    const posts = await extractVisiblePosts(page);
    if (totalScrolled === 0 && posts.length === 0) {
      log.warn('No posts found on first scroll — selectors may need updating');
    }
    const newPosts = posts.filter(p => !seenUrns.has(p.urn));
    for (const post of newPosts) seenUrns.add(post.urn);
    totalScrolled += newPosts.length;

    if (newPosts.length === 0) {
      noNewPostStreak++;
      if (noNewPostStreak >= 5) {
        log.info('No new posts for a while, scrolling further...');
        const bigScroll = Math.round(gaussianRandom(1400, 350));
        await page.mouse.wheel(0, Math.max(800, bigScroll));
        await sleep(humanDelay(1000, 2500));
        noNewPostStreak = 0;
        continue;
      }
    } else {
      noNewPostStreak = 0;
    }

    if (newPosts.length > 0) {
      await onPostsFound(newPosts);
    }

    // Human-like scroll with personality
    await humanScroll(page, personality);

    // Session fatigue: scroll delays get longer as session progresses
    const fatigueFactor = 1 + (totalScrolled * (p.fatigueRate || 0.01) * 0.3);
    await sleep(humanDelay(
      Math.round(scrollDelayMin * fatigueFactor),
      Math.round(scrollDelayMax * fatigueFactor)
    ));

    // Occasional long reading pause
    if (Math.random() < longPauseChance) {
      await sleep(humanDelay(5000, 18000));
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log.info(`Feed scroll complete: ${totalScrolled} posts seen in ${elapsed}s`);
  return { totalScrolled };
}

// Re-export gaussianRandom for scroller-internal use
const { gaussianRandom } = require('../behavior/human');

module.exports = { scrollFeed };
