const SELECTORS = require('./selectors');
const log = require('../utils/logger');

/**
 * Extract existing visible comments from a post.
 * Returns an array of { author, text } for feeding to the LLM as context.
 * Only scrapes what's visible — no "Load more" expansion.
 * Uses a single evaluate() call for all comments to minimize IPC round-trips.
 *
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} postLocator - The post element locator
 * @returns {Array<{author: string, text: string}>}
 */
async function extractExistingComments(page, postLocator) {
  try {
    const comments = await postLocator.evaluate((el, selector) => {
      const items = el.querySelectorAll(selector);
      if (!items.length) return [];

      const results = [];
      const maxComments = Math.min(items.length, 10);
      const skipPatterns = /^(Like|Reply|Report|See translation|Edited|\d+\s*(likes?|replies|reactions?)|\d+[dhwmo]\s*$)/i;

      for (let i = 0; i < maxComments; i++) {
        const item = items[i];

        // Skip hidden elements
        const rect = item.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const text = (item.innerText || '').trim();
        if (!text) continue;

        const lines = text.split('\n').filter(l => l.trim());
        let author = 'Unknown';
        let foundAuthor = false;
        const contentLines = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.length < 2) continue;
          if (skipPatterns.test(trimmed)) continue;

          if (!foundAuthor) {
            if (trimmed.length < 60 && !/[.!?]$/.test(trimmed)) {
              author = trimmed;
              foundAuthor = true;
              continue;
            }
          }

          // Skip role/title lines right after author name
          if (foundAuthor && contentLines.length === 0 && trimmed.length < 80 && !trimmed.includes('.')) {
            continue;
          }

          contentLines.push(trimmed);
        }

        const commentText = contentLines.join(' ').substring(0, 500);
        if (commentText.length > 5) {
          results.push({ author, text: commentText });
        }
      }

      return results;
    }, SELECTORS.commentItem);

    return comments || [];
  } catch (err) {
    log.warn(`Failed to extract existing comments: ${err.message}`);
    return [];
  }
}

module.exports = { extractExistingComments };
