// Centralized LinkedIn DOM selectors
// LinkedIn uses obfuscated class names, so we rely on
// aria-labels, roles, data-testid, and structural selectors.

const log = require('../utils/logger');

const SELECTORS = {
  // Feed list container
  feedContainer: 'div[data-testid="mainFeed"][role="list"], div[role="list"][data-component-type="LazyColumn"]',

  // Individual feed post — role="listitem" that contains a React button (confirms it's a post, not an ad shell)
  feedPost: 'div[role="listitem"]:has(button[aria-label*="React"])',

  // Post unique identifier attribute (componentkey replaced data-urn)
  feedPostUrn: 'componentkey',

  // Reaction buttons
  likeButton: 'button[aria-label*="Reaction button"]',
  likeButtonAria: 'button[aria-label*="React"]',

  // Reaction picker (appears on hover)
  reactionPicker: 'div[role="tooltip"], div[role="listbox"]',

  // Specific reactions (aria-labels used by LinkedIn)
  reactions: {
    like: 'React Like',
    celebrate: 'React Celebrate',
    support: 'React Support',
    love: 'React Love',
    insightful: 'React Insightful',
    funny: 'React Funny',
  },

  // Already reacted indicator (button aria-label contains a reaction name)
  alreadyReacted: 'button[aria-label*="Reaction button state: reacted"]',

  // Promoted/sponsored indicators
  promotedIndicators: [
    'a[href*="lnkd.in"]',
    '[aria-label*="Promoted"]',
    '[aria-label*="Sponsored"]',
  ],
  promotedText: 'Promoted',
};

/**
 * Validate that critical selectors find elements on a loaded feed page.
 * Returns { valid, details } — call after navigating to the feed.
 */
async function validateSelectors(page) {
  const checks = [
    { name: 'feedPost', selector: SELECTORS.feedPost },
    { name: 'likeButton', selector: SELECTORS.likeButton + ', ' + SELECTORS.likeButtonAria },
  ];

  const results = [];
  for (const check of checks) {
    const count = await page.locator(check.selector).count().catch(() => 0);
    results.push({ name: check.name, selector: check.selector, count });
  }

  const allZero = results.every(r => r.count === 0);
  if (allZero) {
    log.error('Selector validation FAILED — no posts or reaction buttons found.');
    log.error('LinkedIn may have changed their DOM structure. Selectors need updating.');
    for (const r of results) {
      log.error(`  ${r.name}: "${r.selector}" → ${r.count} matches`);
    }
  } else {
    for (const r of results) {
      log.info(`  Selector check: ${r.name} → ${r.count} matches`);
    }
  }

  return { valid: !allZero, details: results };
}

module.exports = { ...SELECTORS, validateSelectors };
