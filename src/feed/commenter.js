const SELECTORS = require('./selectors');
const { humanClick, humanDelay, sleep } = require('../behavior/human');
const { humanType, thinkingDelay } = require('../behavior/human');
const log = require('../utils/logger');

/**
 * Post a comment on a LinkedIn post.
 *
 * Flow:
 * 1. Locate the post element
 * 2. Scroll into view
 * 3. Simulate thinking delay
 * 4. Click the comment button to open comment box
 * 5. Type the comment with human-like keystrokes
 * 6. Brief review pause
 * 7. Submit
 *
 * @param {import('playwright').Page} page
 * @param {object} post - { urn, author, text, postUrl }
 * @param {string} commentText - The generated comment to post
 * @param {boolean} dryRun - If true, skip typing and submission
 * @returns {{ success: boolean, error?: string }}
 */
async function commentOnPost(page, post, commentText, dryRun) {
  try {
    // Find the post — try componentkey on element itself, then as parent
    const directEl = page.locator(`div[componentkey="${post.urn}"]`).first();
    const parentEl = page.locator(`div[role="listitem"]:has(div[componentkey="${post.urn}"])`).first();

    const directVisible = await directEl.isVisible().catch(() => false);
    const parentVisible = !directVisible && await parentEl.isVisible().catch(() => false);

    if (!directVisible && !parentVisible) {
      return { success: false, error: 'Post not visible' };
    }

    const activePostEl = directVisible ? directEl : parentEl;

    // Scroll post into view
    await activePostEl.scrollIntoViewIfNeeded();
    await sleep(humanDelay(500, 1000));

    // Simulate thinking before commenting
    await sleep(thinkingDelay(commentText.length));

    if (dryRun) {
      log.info(`[DRY RUN] Would comment on ${post.author}: "${commentText}"`);
      return { success: true };
    }

    // Click the comment button to open comment box
    const commentBtn = activePostEl.locator(SELECTORS.commentButton).first();
    const btnVisible = await commentBtn.isVisible().catch(() => false);

    if (!btnVisible) {
      return { success: false, error: 'Comment button not found' };
    }

    await humanClick(page, commentBtn);
    await sleep(humanDelay(800, 1500));

    // Wait for comment input to appear (with retry)
    let commentInput = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      // Try multiple selector strategies for the comment input
      const inputLocator = page.locator(SELECTORS.commentInput).last();
      const inputVisible = await inputLocator.isVisible({ timeout: 3000 }).catch(() => false);

      if (inputVisible) {
        commentInput = inputLocator;
        break;
      }

      if (attempt === 0) {
        log.warn('Comment input not found, retrying...');
        // Move mouse away and click comment button again
        const box = await commentBtn.boundingBox().catch(() => null);
        if (box) {
          await page.mouse.move(box.x - 50, box.y - 50);
          await sleep(humanDelay(300, 600));
        }
        await humanClick(page, commentBtn);
        await sleep(humanDelay(1000, 2000));
      }
    }

    if (!commentInput) {
      // Press Escape to clean up
      await page.keyboard.press('Escape').catch(() => {});
      return { success: false, error: 'Comment input not found after retry' };
    }

    // Click to focus the input
    await humanClick(page, commentInput);
    await sleep(humanDelay(300, 600));

    // Type the comment with human-like keystrokes
    await humanType(page, commentInput, commentText);

    // Brief review pause (simulating reading what was typed before submitting)
    await sleep(humanDelay(500, 1500));

    // Submit the comment
    // Try clicking submit button first, then fallback to Ctrl+Enter
    const submitBtn = page.locator(SELECTORS.commentSubmit).first();
    const submitVisible = await submitBtn.isVisible().catch(() => false);

    if (submitVisible) {
      await humanClick(page, submitBtn);
    } else {
      // Many LinkedIn comment boxes submit on Ctrl+Enter or Enter
      await page.keyboard.press('Control+Enter');
    }

    await sleep(humanDelay(1000, 2000));

    log.success(`Commented on ${post.author}: "${commentText.substring(0, 50)}..."`);
    return { success: true };
  } catch (err) {
    log.error(`Failed to comment on post by ${post.author}: ${err.message}`);

    // Try to dismiss any open comment box to avoid leaving a draft
    try {
      await page.keyboard.press('Escape');
    } catch {}

    return { success: false, error: err.message };
  }
}

module.exports = { commentOnPost };
