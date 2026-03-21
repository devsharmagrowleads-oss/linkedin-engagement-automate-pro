const SELECTORS = require('./selectors');
const log = require('../utils/logger');

/**
 * Extract structured data from a single feed post element.
 * LinkedIn now uses obfuscated class names, so we rely on
 * structural selectors, aria-labels, and text content parsing.
 */
async function extractPost(postLocator) {
  try {
    // Get unique identifier — componentkey may be on the listitem or a child div
    let urn = await postLocator.getAttribute(SELECTORS.feedPostUrn);
    if (!urn) {
      // Try finding componentkey on a direct child
      urn = await postLocator.locator(`div[${SELECTORS.feedPostUrn}]`).first()
        .getAttribute(SELECTORS.feedPostUrn).catch(() => null);
    }
    if (!urn) return null;

    // Check if already reacted or promoted (quick checks first)
    const [alreadyReacted, isPromoted] = await Promise.all([
      postLocator.locator(SELECTORS.alreadyReacted).count().then(c => c > 0).catch(() => false),
      checkIfPromoted(postLocator),
    ]);

    if (alreadyReacted || isPromoted) return null;

    // Check that a React button exists (confirms this is a real post)
    const hasReactBtn = await postLocator
      .locator(SELECTORS.likeButton + ', ' + SELECTORS.likeButtonAria)
      .count().then(c => c > 0).catch(() => false);

    if (!hasReactBtn) return null;

    // Extract text content and post URL from the post
    // Since LinkedIn obfuscates classes, we get innerText and parse it
    const postData = await postLocator.evaluate(el => {
      // Try to find the permalink to the post (usually the timestamp link)
      // LinkedIn post links contain /feed/update/ or /posts/ in the URL
      let postUrl = '';
      const links = el.querySelectorAll('a[href]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (href.includes('/feed/update/') || href.includes('/posts/')) {
          postUrl = href.split('?')[0]; // Strip query params
          break;
        }
      }

      const text = (el.innerText || '').trim();
      const lines = text.split('\n').filter(l => l.trim());

      let author = 'Unknown';
      let postText = '';
      let contentStartIdx = 0;

      // Context patterns: "X likes this", "X commented on this", "X finds this insightful", etc.
      const contextPattern = /^(.+?)\s+(likes? this|commented on this|reposted this|shared this|celebrates this|finds this insightful|finds this funny|loves this|supports this)$/i;

      // Parse header area to find author and content start
      let foundAuthorBlock = false;
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const line = lines[i].trim();

        // Skip hidden labels and LinkedIn UI text
        if (line === 'Feed post' || line === '…' || line === '... more') continue;
        if (/^(Suggested|Promoted|Sponsored|Follow)$/i.test(line)) continue;

        // Context line (e.g. "GenAI Works likes this") — skip, real author is next
        const ctxMatch = line.match(contextPattern);
        if (ctxMatch) continue;

        // Follower/connection count or timestamp line — marks end of author block
        if (/\d[\d,]*\s*(followers|connections)/.test(line) || /^\d+[dhwmo]\s*•/.test(line)) {
          contentStartIdx = i + 1;
          foundAuthorBlock = true;
          continue;
        }

        // The actual author name: short, no punctuation, before the follower line
        if (!foundAuthorBlock && author === 'Unknown' && line.length > 1 && line.length < 60 && line !== 'Feed post') {
          if (!/[.!?]$/.test(line) && !contextPattern.test(line)) {
            author = line;
          }
        }
      }

      // Post text: everything after the author/metadata section
      const skipPatterns = /^(Feed post|…\s*more|Show translation|\d+\s*comments?|\d+\s*likes?|\d+\s*reactions?|Like|Comment|Repost|Send|Share|Report this|Copy link|Embed|Follow|Connect|Message|See more|React|Celebrate|Support|Love|Insightful|Funny|Reaction button|…\s*$)/i;

      const contentLines = [];
      for (let i = contentStartIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.length < 3) continue;
        if (skipPatterns.test(line)) continue;
        contentLines.push(line);
      }
      postText = contentLines.join(' ').substring(0, 1000);

      return { author, postText, postUrl };
    });

    if (!postData) return null;

    const cleanText = (postData.postText || '').trim();
    if (cleanText.length < 20) return null;

    return {
      urn: urn.trim(),
      author: (postData.author || 'Unknown').trim(),
      text: cleanText,
      postUrl: (postData.postUrl || '').trim(),
    };
  } catch (err) {
    log.warn(`Post extraction failed: ${err.message}`);
    return null;
  }
}

/**
 * Check if a post is promoted/sponsored
 */
async function checkIfPromoted(postLocator) {
  try {
    // Check for promoted indicators
    for (const selector of SELECTORS.promotedIndicators) {
      const count = await postLocator.locator(selector).count();
      if (count > 0) return true;
    }

    // Check text content for "Promoted" or "Sponsored" labels
    const text = await postLocator.evaluate(el => {
      // Check just the first few lines (header area)
      const lines = (el.innerText || '').split('\n').slice(0, 6);
      return lines.join(' ');
    });
    if (text && (text.includes('Promoted') || text.includes('Sponsored'))) return true;

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

  if (count === 0) return [];

  // Extract all posts in parallel
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, i) => extractPost(postLocators.nth(i)))
  );

  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

module.exports = { extractPost, extractVisiblePosts };
