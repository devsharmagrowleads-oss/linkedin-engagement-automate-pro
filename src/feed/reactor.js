const SELECTORS = require('./selectors');
const { humanClick, humanDelay, readingTime, sleep } = require('../behavior/human');
const log = require('../utils/logger');

/**
 * React to a single post with the specified reaction type
 *
 * Flow:
 * 1. Scroll post into view
 * 2. Simulate reading time
 * 3. Hover over reaction button to open picker
 * 4. Select target reaction
 * 5. Click with human-like mouse movement
 *
 * @param {Object} page - Playwright page
 * @param {Object} post - Post object with urn, text, author
 * @param {string} reactionType - 'like', 'celebrate', 'insightful', 'love', 'support', 'funny'
 * @returns {boolean} - Whether reaction was successful
 */
async function reactToPost(page, post, reactionType) {
  try {
    // Find the post element by URN
    const postEl = page.locator(`div[data-urn="${post.urn}"]`);
    const isVisible = await postEl.isVisible().catch(() => false);
    if (!isVisible) {
      log.warn(`Post not visible: ${post.urn}`);
      return false;
    }

    // Scroll post into view
    await postEl.scrollIntoViewIfNeeded();
    await sleep(humanDelay(500, 1000));

    // Simulate reading the post
    const readMs = readingTime(post.text);
    await sleep(readMs);

    // Find the reaction button within this post
    const likeBtn = postEl.locator(SELECTORS.likeButton).first();
    const likeBtnExists = await likeBtn.isVisible().catch(() => false);

    if (!likeBtnExists) {
      // Try aria-label fallback
      const ariaBtn = postEl.locator(SELECTORS.likeButtonAria).first();
      const ariaBtnExists = await ariaBtn.isVisible().catch(() => false);
      if (!ariaBtnExists) {
        log.warn(`No reaction button found for post: ${post.urn}`);
        return false;
      }
    }

    const reactionBtn = likeBtnExists
      ? likeBtn
      : postEl.locator(SELECTORS.likeButtonAria).first();

    if (reactionType === 'like') {
      // Simple like - just click the button
      await humanClick(page, reactionBtn);
      await sleep(humanDelay(300, 800));
      log.success(`Liked post by ${post.author}`);
      return true;
    }

    // For other reactions, we need to hover to open the reaction picker
    const box = await reactionBtn.boundingBox();
    if (!box) return false;

    // Hover over the like button to trigger the reaction picker
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(humanDelay(800, 1500)); // Wait for picker to appear

    // Find the specific reaction in the picker
    const ariaLabel = SELECTORS.reactions[reactionType] || SELECTORS.reactions.like;
    const targetReaction = page.locator(`button[aria-label="${ariaLabel}"]`).first();

    const pickerVisible = await targetReaction.isVisible({ timeout: 3000 }).catch(() => false);
    if (!pickerVisible) {
      // Fallback: just click like if picker doesn't appear
      log.warn(`Reaction picker didn't appear, falling back to Like for ${post.author}`);
      await humanClick(page, reactionBtn);
      await sleep(humanDelay(300, 800));
      return true;
    }

    // Click the target reaction
    await humanClick(page, targetReaction);
    await sleep(humanDelay(500, 1200));

    log.success(`Reacted "${reactionType}" to post by ${post.author}`);
    return true;
  } catch (err) {
    log.error(`Failed to react to post ${post.urn}: ${err.message}`);
    return false;
  }
}

module.exports = { reactToPost };
