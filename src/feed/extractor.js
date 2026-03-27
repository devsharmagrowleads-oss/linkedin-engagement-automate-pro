const SELECTORS = require('./selectors');
const log = require('../utils/logger');

/**
 * Extract structured data from a single feed post element.
 * Uses a SINGLE evaluate() call to minimize CDP round-trips.
 * All filtering (promoted, suggested, company) happens inside the browser context.
 */
async function extractPost(postLocator, opts = {}) {
  const { includeReacted = false } = opts;
  try {
    // Get unique identifier — componentkey may be on the listitem or a child div
    let urn = await postLocator.getAttribute(SELECTORS.feedPostUrn);
    if (!urn) {
      urn = await postLocator.locator(`div[${SELECTORS.feedPostUrn}]`).first()
        .getAttribute(SELECTORS.feedPostUrn).catch(() => null);
    }
    if (!urn) return null;

    // Check if already reacted (quick Playwright check — no evaluate needed)
    if (!includeReacted) {
      const alreadyReacted = await postLocator.locator(SELECTORS.alreadyReacted)
        .count().then(c => c > 0).catch(() => false);
      if (alreadyReacted) return null;
    }

    // SINGLE consolidated evaluate() call: filters + extraction in one round-trip
    const postData = await postLocator.evaluate((el) => {
      const text = (el.innerText || '').trim();
      if (!text) return { skip: 'empty' };

      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const headerLines = lines.slice(0, 8);

      // ── Filter: Promoted/Sponsored ──
      for (const line of headerLines) {
        if (line === 'Promoted' || line === 'Sponsored') return { skip: 'promoted' };
      }
      // Check aria-labels for promoted indicators
      if (el.querySelector('[aria-label*="Promoted"], [aria-label*="Sponsored"]')) {
        return { skip: 'promoted' };
      }

      // ── Filter: Suggested ──
      for (const line of headerLines) {
        if (line === 'Suggested') return { skip: 'suggested' };
      }

      // ── Filter: Company page (author followed by "X followers") ──
      const contextPattern = /^(.+?)\s+(likes? this|commented on this|reposted this|shared this|celebrates this|finds this insightful|finds this funny|loves this|supports this)$/i;
      let authorLine = null;
      for (const line of headerLines) {
        if (line === 'Feed post' || line === 'Suggested') continue;
        if (contextPattern.test(line)) continue;
        authorLine = line;
        break;
      }
      // Company detection: skip only "Suggested", allow company posts through
      // (many feeds are dominated by company content shares)

      // ── Check React button exists ──
      const hasReactBtn = !!el.querySelector(
        'button[aria-label*="Reaction button"], button[aria-label*="React"]'
      );
      if (!hasReactBtn) return { skip: 'no_react_btn' };

      // ── Extract post data ──
      let postUrl = '';
      const links = el.querySelectorAll('a[href]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (href.includes('/feed/update/') || href.includes('/posts/')) {
          postUrl = href.split('?')[0];
          break;
        }
      }

      let author = 'Unknown';
      let contentStartIdx = 0;
      let foundAuthorBlock = false;

      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const line = lines[i];
        if (line === 'Feed post' || line === '…' || line === '... more') continue;
        if (/^(Suggested|Promoted|Sponsored|Follow)$/i.test(line)) continue;
        if (contextPattern.test(line)) continue;
        if (/\d[\d,]*\s*(followers|connections)/.test(line) || /^\d+[dhwmo]\s*•/.test(line)) {
          contentStartIdx = i + 1;
          foundAuthorBlock = true;
          continue;
        }
        if (!foundAuthorBlock && author === 'Unknown' && line.length > 1 && line.length < 60 && line !== 'Feed post') {
          if (!/[.!?]$/.test(line) && !contextPattern.test(line)) {
            author = line;
          }
        }
      }

      const skipPatterns = /^(Feed post|…\s*more|Show translation|\d+\s*comments?|\d+\s*likes?|\d+\s*reactions?|Like|Comment|Repost|Send|Share|Report this|Copy link|Embed|Follow|Connect|Message|See more|React|Celebrate|Support|Love|Insightful|Funny|Reaction button|…\s*$)/i;
      const contentLines = [];
      for (let i = contentStartIdx; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.length < 3) continue;
        if (skipPatterns.test(line)) continue;
        contentLines.push(line);
      }
      const postText = contentLines.join(' ').substring(0, 1000);

      let reactionCount = 0;
      let commentCount = 0;
      const reactionMatch = text.match(/(\d[\d,]*)\s*(reactions?|likes?)/i);
      if (reactionMatch) reactionCount = parseInt(reactionMatch[1].replace(/,/g, ''), 10) || 0;
      const commentMatch = text.match(/(\d[\d,]*)\s*comments?/i);
      if (commentMatch) commentCount = parseInt(commentMatch[1].replace(/,/g, ''), 10) || 0;

      return { author, postText, postUrl, reactionCount, commentCount };
    });

    if (!postData) return null;

    // Handle filter results
    if (postData.skip) {
      if (postData.skip === 'suggested') log.info(`  Skipping suggested post`);
      return null;
    }

    const cleanText = (postData.postText || '').trim();
    if (cleanText.length < 20) return null;

    return {
      urn: urn.trim(),
      author: (postData.author || 'Unknown').trim(),
      text: cleanText,
      postUrl: (postData.postUrl || '').trim(),
      reactionCount: postData.reactionCount || 0,
      commentCount: postData.commentCount || 0,
    };
  } catch (err) {
    log.warn(`Post extraction failed: ${err.message}`);
    return null;
  }
}

/**
 * Extract all visible posts from the current feed view
 */
async function extractVisiblePosts(page, opts = {}) {
  const selector = opts.includeReacted
    ? 'div[role="listitem"]:has(button[aria-label*="React"])'
    : SELECTORS.feedPost;
  const postLocators = page.locator(selector);
  const count = await postLocators.count();

  if (count === 0) return [];

  // Extract all posts in parallel
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, i) => extractPost(postLocators.nth(i), opts))
  );

  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

module.exports = { extractVisiblePosts };
