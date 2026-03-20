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
 */
async function reactToPost(page, post, reactionType) {
  try {
    // Find the post — try componentkey on element itself, then as parent of a child with it
    const directEl = page.locator(`div[componentkey="${post.urn}"]`).first();
    const parentEl = page.locator(`div[role="listitem"]:has(div[componentkey="${post.urn}"])`).first();

    const directVisible = await directEl.isVisible().catch(() => false);
    const parentVisible = !directVisible && await parentEl.isVisible().catch(() => false);

    if (!directVisible && !parentVisible) {
      log.warn(`Post not visible: ${post.urn.substring(0, 30)}...`);
      return false;
    }

    const activePostEl = directVisible ? directEl : parentEl;

    // Scroll post into view
    await activePostEl.scrollIntoViewIfNeeded();
    await sleep(humanDelay(500, 1000));

    // Simulate reading the post
    const readMs = readingTime(post.text);
    await sleep(readMs);

    // Find the reaction button within this post
    const reactionBtn = activePostEl.locator(SELECTORS.likeButton + ', ' + SELECTORS.likeButtonAria).first();
    const btnExists = await reactionBtn.isVisible().catch(() => false);

    if (!btnExists) {
      log.warn(`No reaction button found for post by ${post.author}`);
      return false;
    }

    if (reactionType === 'like') {
      // Simple like - just click the button
      await humanClick(page, reactionBtn);
      await sleep(humanDelay(300, 800));
      log.success(`Liked post by ${post.author}`);
      return true;
    }

    // For other reactions, hover to open the reaction picker (with 1 retry)
    const ariaLabel = SELECTORS.reactions[reactionType] || SELECTORS.reactions.like;
    let pickerOpened = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      const box = await reactionBtn.boundingBox();
      if (!box) return false;

      // Hover with slight offset on retry to avoid cached hover state
      const offsetX = attempt === 0 ? 0 : (Math.random() - 0.5) * 6;
      const offsetY = attempt === 0 ? 0 : (Math.random() - 0.5) * 4;
      await page.mouse.move(box.x + box.width / 2 + offsetX, box.y + box.height / 2 + offsetY);
      await sleep(humanDelay(1200, 2000));

      const targetReaction = page.locator(`button[aria-label="${ariaLabel}"]`).first();
      pickerOpened = await targetReaction.isVisible({ timeout: 4000 }).catch(() => false);

      if (pickerOpened) {
        await humanClick(page, targetReaction);
        await sleep(humanDelay(500, 1200));
        log.success(`Reacted "${reactionType}" to post by ${post.author}`);
        return true;
      }

      if (attempt === 0) {
        log.warn(`Reaction picker didn't appear for ${post.author}, retrying...`);
        // Move mouse away then back to reset hover state
        await page.mouse.move(box.x - 50, box.y - 50);
        await sleep(humanDelay(300, 600));
      }
    }

    // Fallback: just click like if picker doesn't appear after retries
    log.warn(`Reaction picker failed after retry, falling back to Like for ${post.author}`);
    await humanClick(page, reactionBtn);
    await sleep(humanDelay(300, 800));
    return true;
  } catch (err) {
    log.error(`Failed to react to post by ${post.author}: ${err.message}`);
    return false;
  }
}

module.exports = { reactToPost };
