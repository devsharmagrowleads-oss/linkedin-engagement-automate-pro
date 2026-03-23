const SELECTORS = require('./selectors');
const log = require('../utils/logger');

/**
 * Extract existing visible comments from a post.
 * Returns an array of { author, text } for feeding to the LLM as context.
 * Only scrapes what's visible — no "Load more" expansion.
 *
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} postLocator - The post element locator
 * @returns {Array<{author: string, text: string}>}
 */
async function extractExistingComments(page, postLocator) {
  try {
    // Find comment items within or near this post
    const commentItems = postLocator.locator(SELECTORS.commentItem);
    const count = await commentItems.count().catch(() => 0);

    if (count === 0) return [];

    const comments = [];
    const maxComments = Math.min(count, 10); // Cap at 10

    for (let i = 0; i < maxComments; i++) {
      try {
        const item = commentItems.nth(i);
        const visible = await item.isVisible().catch(() => false);
        if (!visible) continue;

        const data = await item.evaluate(el => {
          const text = (el.innerText || '').trim();
          const lines = text.split('\n').filter(l => l.trim());

          // First non-empty line is typically the commenter's name
          let author = 'Unknown';
          let commentText = '';

          // Parse: first line = author, remaining non-UI lines = comment text
          const skipPatterns = /^(Like|Reply|Report|See translation|Edited|\d+\s*(likes?|replies|reactions?)|\d+[dhwmo]\s*$)/i;

          let foundAuthor = false;
          const contentLines = [];

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.length < 2) continue;
            if (skipPatterns.test(trimmed)) continue;

            if (!foundAuthor) {
              // Author is typically a short name (< 60 chars, no punctuation at end)
              if (trimmed.length < 60 && !/[.!?]$/.test(trimmed)) {
                author = trimmed;
                foundAuthor = true;
                continue;
              }
            }

            // Skip role/title lines right after author name
            if (foundAuthor && contentLines.length === 0 && trimmed.length < 80 && !trimmed.includes('.')) {
              continue; // likely a job title line
            }

            contentLines.push(trimmed);
          }

          commentText = contentLines.join(' ').substring(0, 500);
          return { author, text: commentText };
        });

        if (data && data.text && data.text.length > 5) {
          comments.push(data);
        }
      } catch {
        // Skip individual comment extraction errors
      }
    }

    return comments;
  } catch (err) {
    log.warn(`Failed to extract existing comments: ${err.message}`);
    return [];
  }
}

module.exports = { extractExistingComments };
