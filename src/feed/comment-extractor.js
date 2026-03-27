const log = require('../utils/logger');

/**
 * Extract existing visible comments from a post.
 * Returns an array of { author, text } for feeding to the LLM as context.
 * Only scrapes what's visible — no "Load more" expansion.
 *
 * LinkedIn now uses TipTap/ProseMirror editors and obfuscated classes.
 * We find comments by looking for elements with "comment" in aria-label
 * or by structural patterns (comment containers near the post).
 *
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} postLocator - The post element locator
 * @returns {Array<{author: string, text: string}>}
 */
async function extractExistingComments(page, postLocator) {
  try {
    // First try to click the comment button to expand comments section
    // (comments may not be visible until the section is opened)

    const comments = await postLocator.evaluate((el) => {
      const results = [];

      // Strategy 1: Look for article elements with comment-like structure
      const articles = el.querySelectorAll('article');
      if (articles.length > 0) {
        for (const article of articles) {
          const parsed = parseCommentElement(article);
          if (parsed) results.push(parsed);
          if (results.length >= 10) break;
        }
      }

      // Strategy 2: Look for elements whose aria-label mentions "comment"
      if (results.length === 0) {
        const commentEls = el.querySelectorAll('[aria-label*="comment" i]');
        for (const ce of commentEls) {
          // Skip buttons (like "Comment" action button or "View more options")
          if (ce.tagName === 'BUTTON' || ce.tagName === 'A') continue;
          const parsed = parseCommentElement(ce);
          if (parsed) results.push(parsed);
          if (results.length >= 10) break;
        }
      }

      // Strategy 3: Look for the comment list container and parse its children
      if (results.length === 0) {
        // Comments are usually after the social actions bar, in a container with
        // multiple child elements that each have author name + text
        const allDivs = el.querySelectorAll('div');
        for (const div of allDivs) {
          // Look for "Most relevant" or "Newest" text which precedes comments
          const text = (div.innerText || '').trim();
          if (text.startsWith('Most relevant') || text.startsWith('Newest') || text.startsWith('Most reactions')) {
            // The next sibling or parent's next children should be comments
            let commentContainer = div.nextElementSibling || div.parentElement;
            if (commentContainer) {
              const children = commentContainer.children;
              for (const child of children) {
                const parsed = parseCommentElement(child);
                if (parsed) results.push(parsed);
                if (results.length >= 10) break;
              }
            }
            break;
          }
        }
      }

      return results;

      function parseCommentElement(el) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;

        const text = (el.innerText || '').trim();
        if (!text || text.length < 10) return null;

        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);

        const skipPatterns = /^(Like|Reply|Report|See translation|Edited|Load more|View more|\d+\s*(likes?|replies|reactions?)|\d+[dhwmo]\s*$|Most relevant|Newest|Most reactions|View \d+|Open Emoji|Share photo|Comment$)/i;

        let author = 'Unknown';
        let foundAuthor = false;
        const contentLines = [];

        for (const line of lines) {
          if (skipPatterns.test(line)) continue;

          // Author: first short line without ending punctuation
          if (!foundAuthor) {
            if (line.length < 60 && !/[.!?]$/.test(line)) {
              author = line;
              foundAuthor = true;
              continue;
            }
          }

          // Skip headline/title line right after author
          if (foundAuthor && contentLines.length === 0 && line.length < 80 && !line.includes('.')) {
            continue;
          }

          // Skip timestamp lines like "1d", "2h", "3w"
          if (/^\d+[dhwmo]$/.test(line)) continue;
          // Skip "Author" badges
          if (line === 'Author') continue;

          contentLines.push(line);
        }

        const commentText = contentLines.join(' ').substring(0, 500);
        if (commentText.length > 5 && author !== 'Unknown') {
          return { author, text: commentText };
        }
        return null;
      }
    });

    return comments || [];
  } catch (err) {
    log.warn(`Failed to extract existing comments: ${err.message}`);
    return [];
  }
}

module.exports = { extractExistingComments };
