const SELECTORS = require('./selectors');
const { humanClick, humanDelay, readingTime, sleep } = require('../behavior/human');
const log = require('../utils/logger');

/**
 * React to a single post with the specified reaction type.
 * Personality-driven: tempo affects reading time, hover duration, and adds occasional hesitation.
 */
async function reactToPost(page, post, reactionType, personality) {
  const p = personality || {};
  const tempoFactor = p.tempo === 'fast' ? 0.6 : p.tempo === 'contemplative' ? 1.8 : 1.0;

  try {
    const directEl = page.locator(`div[componentkey="${post.urn}"]`).first();
    const parentEl = page.locator(`div[role="listitem"]:has(div[componentkey="${post.urn}"])`).first();

    const directVisible = await directEl.isVisible().catch(() => false);
    const parentVisible = !directVisible && await parentEl.isVisible().catch(() => false);

    if (!directVisible && !parentVisible) {
      log.warn(`Post not visible: ${post.urn.substring(0, 30)}...`);
      return false;
    }

    const activePostEl = directVisible ? directEl : parentEl;

    // Scroll into view
    await activePostEl.scrollIntoViewIfNeeded();
    await sleep(humanDelay(
      Math.round(400 * tempoFactor),
      Math.round(1000 * tempoFactor)
    ));

    // Simulate reading — scaled by tempo
    const readMs = Math.round(readingTime(post.text) * tempoFactor);
    await sleep(readMs);

    // Find the reaction button
    const reactionBtn = activePostEl.locator(SELECTORS.likeButton + ', ' + SELECTORS.likeButtonAria).first();
    const btnExists = await reactionBtn.isVisible().catch(() => false);

    if (!btnExists) {
      log.warn(`No reaction button found for post by ${post.author}`);
      return false;
    }

    if (reactionType === 'like') {
      // Occasional hesitation before clicking (personality-driven)
      if (Math.random() < (p.hesitationChance || 0.06)) {
        await sleep(humanDelay(800, 2500));
      }
      await humanClick(page, reactionBtn);
      await sleep(humanDelay(300, 800));
      log.success(`Liked post by ${post.author}`);
      return true;
    }

    // For other reactions, hover to open reaction picker
    const ariaLabel = SELECTORS.reactions[reactionType] || SELECTORS.reactions.like;
    const maxRetries = 1 + Math.floor(Math.random() * 2); // 1-2 retries (randomized)

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const box = await reactionBtn.boundingBox();
      if (!box) return false;

      // Hover with slight offset on retry
      const offsetX = attempt === 0 ? 0 : (Math.random() - 0.5) * 6;
      const offsetY = attempt === 0 ? 0 : (Math.random() - 0.5) * 4;
      await page.mouse.move(box.x + box.width / 2 + offsetX, box.y + box.height / 2 + offsetY);
      // Hover duration scaled by tempo
      await sleep(humanDelay(
        Math.round(800 * tempoFactor),
        Math.round(1800 * tempoFactor)
      ));

      const targetReaction = page.locator(`button[aria-label="${ariaLabel}"]`).first();
      const pickerOpened = await targetReaction.isVisible({ timeout: 4000 }).catch(() => false);

      if (pickerOpened) {
        // Occasional reconsideration: hover over wrong reaction first (3%)
        if (Math.random() < (p.reconsiderChance || 0.03)) {
          const otherReactions = Object.values(SELECTORS.reactions).filter(r => r !== ariaLabel);
          if (otherReactions.length > 0) {
            const wrongLabel = otherReactions[Math.floor(Math.random() * otherReactions.length)];
            const wrongBtn = page.locator(`button[aria-label="${wrongLabel}"]`).first();
            const wrongVisible = await wrongBtn.isVisible({ timeout: 500 }).catch(() => false);
            if (wrongVisible) {
              const wrongBox = await wrongBtn.boundingBox().catch(() => null);
              if (wrongBox) {
                await page.mouse.move(wrongBox.x + wrongBox.width / 2, wrongBox.y + wrongBox.height / 2);
                await sleep(humanDelay(300, 700));
              }
            }
          }
        }

        await humanClick(page, targetReaction);
        await sleep(humanDelay(400, 1000));
        log.success(`Reacted "${reactionType}" to post by ${post.author}`);
        return true;
      }

      if (attempt < maxRetries) {
        log.warn(`Reaction picker didn't appear for ${post.author}, retrying...`);
        await page.mouse.move(box.x - 50, box.y - 50);
        await sleep(humanDelay(300, 800));
      }
    }

    // Fallback to Like
    log.warn(`Reaction picker failed, falling back to Like for ${post.author}`);
    await humanClick(page, reactionBtn);
    await sleep(humanDelay(300, 800));
    return true;
  } catch (err) {
    log.error(`Failed to react to post by ${post.author}: ${err.message}`);
    return false;
  }
}

module.exports = { reactToPost };
