const SELECTORS = require('./selectors');
const log = require('../utils/logger');

/**
 * Extract structured data from a single feed post element
 */
async function extractPost(postLocator) {
  try {
    const urn = await postLocator.getAttribute(SELECTORS.feedPostUrn);
    if (!urn) return null;

    // Extract author name
    const authorEl = postLocator.locator(SELECTORS.authorName).first();
    const author = await authorEl.textContent().catch(() => 'Unknown');

    // Extract post text
    const textEl = postLocator.locator(SELECTORS.postText).first();
    const text = await textEl.textContent().catch(() => '');

    // Check if promoted
    const isPromoted = await checkIfPromoted(postLocator);
    if (isPromoted) return null;

    // Check if already reacted (button is active/filled)
    const alreadyReacted = await postLocator
      .locator(SELECTORS.alreadyReacted)
      .count()
      .then(c => c > 0)
      .catch(() => false);

    if (alreadyReacted) return null;

    // Skip posts with no meaningful text (video-only, image-only)
    const cleanText = (text || '').trim();
    if (cleanText.length < 20) return null;

    return {
      urn: urn.trim(),
      author: (author || 'Unknown').trim(),
      text: cleanText,
    };
  } catch (err) {
    // Silently skip posts that can't be extracted
    return null;
  }
}

/**
 * Check if a post is promoted/sponsored
 */
async function checkIfPromoted(postLocator) {
  try {
    const fullText = await postLocator.textContent();
    if (fullText && fullText.includes('Promoted')) return true;

    for (const selector of SELECTORS.promotedIndicators) {
      const count = await postLocator.locator(selector).count();
      if (count > 0) return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Extract all visible posts from the current feed view
 */
async function extractVisiblePosts(page) {
  const postLocators = page.locator(SELECTORS.feedPost);
  const count = await postLocators.count();

  // Extract all posts in parallel (each is independent DOM read)
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, i) => extractPost(postLocators.nth(i)))
  );

  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

module.exports = { extractPost, extractVisiblePosts };
