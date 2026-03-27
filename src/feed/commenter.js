const SELECTORS = require('./selectors');
const { humanClick, humanDelay, sleep, humanType, thinkingDelay } = require('../behavior/human');
const log = require('../utils/logger');

/**
 * Post a comment on a LinkedIn post.
 * Uses Ctrl+Enter for submission (no DOM injection fingerprint).
 */
async function commentOnPost(page, post, commentText, dryRun, personality) {
  try {
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
    await sleep(thinkingDelay(commentText.length, personality));

    if (dryRun) {
      log.info(`[DRY RUN] Would comment on ${post.author}: "${commentText}"`);
      return { success: true };
    }

    // Click the comment button to open comment box
    let commentBtn = activePostEl.locator(SELECTORS.commentButton).first();
    let btnVisible = await commentBtn.isVisible().catch(() => false);

    if (!btnVisible) {
      commentBtn = activePostEl.locator(`button:has-text("${SELECTORS.commentButtonText}")`).first();
      btnVisible = await commentBtn.isVisible().catch(() => false);
    }

    if (!btnVisible) {
      return { success: false, error: 'Comment button not found' };
    }

    await humanClick(page, commentBtn);
    await sleep(humanDelay(800, 1500));

    // Wait for comment input (with retry)
    let commentInput = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const pageInput = page.locator('div[role="textbox"][aria-label*="comment" i]').last();
      if (await pageInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        commentInput = pageInput;
        break;
      }

      const anyInput = page.locator('div[role="textbox"][contenteditable="true"]').last();
      if (await anyInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        commentInput = anyInput;
        break;
      }

      if (attempt === 0) {
        log.warn('Comment input not found, retrying...');
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
      await page.keyboard.press('Escape').catch(() => {});
      return { success: false, error: 'Comment input not found after retry' };
    }

    // Type the comment with human-like keystrokes + personality (typos, pacing)
    await humanType(page, commentInput, commentText, personality);

    // Brief review pause (reading what was typed)
    await sleep(humanDelay(600, 2000));

    // Submit using Ctrl+Enter (LinkedIn native shortcut — no DOM injection)
    await page.keyboard.press('Control+Enter');
    await sleep(humanDelay(1500, 3000));

    // Verify submission: check if textbox cleared
    const textRemaining = await commentInput.textContent().catch(() => '');
    if (textRemaining && textRemaining.trim().length > 5) {
      // Ctrl+Enter didn't work — try finding submit button via locator (no DOM mutation)
      log.warn('Ctrl+Enter did not submit, trying button click...');
      const submitBtn = page.locator('button:has-text("Comment"):not([aria-label*="Comment on"])').last();
      const submitVisible = await submitBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (submitVisible) {
        await humanClick(page, submitBtn);
        await sleep(humanDelay(1000, 2000));
      } else {
        // Last resort: Enter key
        await page.keyboard.press('Enter');
        await sleep(humanDelay(1000, 2000));
      }
    }

    log.success(`Commented on ${post.author}: "${commentText.substring(0, 50)}..."`);
    return { success: true };
  } catch (err) {
    log.error(`Failed to comment on post by ${post.author}: ${err.message}`);
    try { await page.keyboard.press('Escape'); } catch {}
    return { success: false, error: err.message };
  }
}

module.exports = { commentOnPost };
