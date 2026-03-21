const { humanDelay, humanScroll, humanClick, sleep } = require('./human');
const log = require('../utils/logger');

/**
 * Visit a LinkedIn profile page to diversify navigation.
 * Scrolls a bit, pauses like reading, then navigates back to feed.
 */
async function visitProfile(page, authorName) {
  try {
    // Find a link to the author's profile within the current view
    const profileLink = page.locator(`a[href*="/in/"]`).first();
    const isVisible = await profileLink.isVisible().catch(() => false);

    if (!isVisible) {
      // Fallback: click on a visible profile link in any post
      const anyProfile = page.locator('div[role="listitem"] a[href*="/in/"]').first();
      const anyVisible = await anyProfile.isVisible().catch(() => false);
      if (!anyVisible) return;
      await humanClick(page, anyProfile);
    } else {
      await humanClick(page, profileLink);
    }

    await sleep(humanDelay(2000, 4000));

    // Simulate reading the profile
    await humanScroll(page);
    await sleep(humanDelay(3000, 8000));

    // Occasionally scroll a bit more
    if (Math.random() < 0.4) {
      await humanScroll(page);
      await sleep(humanDelay(2000, 5000));
    }

    log.info(`  [nav] Visited a profile page`);

    // Go back to feed
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await sleep(humanDelay(1500, 3000));
  } catch (err) {
    log.warn(`Profile visit failed: ${err.message}`);
    // Try to get back to feed
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded', timeout: 15000
    }).catch(() => {});
    await sleep(humanDelay(1000, 2000));
  }
}

/**
 * Click "see more" / "...more" on a long post to simulate reading the full content.
 */
async function expandPost(page, postLocator) {
  try {
    const seeMore = postLocator.locator('button:has-text("more"), button:has-text("see more")').first();
    const isVisible = await seeMore.isVisible().catch(() => false);
    if (!isVisible) return false;

    await humanClick(page, seeMore);
    await sleep(humanDelay(2000, 6000)); // Read the expanded content
    log.info(`  [nav] Expanded a post to read more`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Visit a random LinkedIn page to diversify navigation pattern.
 * Picks from: notifications, messaging, my network, or a company page.
 */
async function randomNavigation(page) {
  const destinations = [
    { name: 'notifications', url: 'https://www.linkedin.com/notifications/' },
    { name: 'messaging', url: 'https://www.linkedin.com/messaging/' },
    { name: 'my network', url: 'https://www.linkedin.com/mynetwork/' },
  ];

  const dest = destinations[Math.floor(Math.random() * destinations.length)];

  try {
    log.info(`  [nav] Visiting ${dest.name}...`);
    await page.goto(dest.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(humanDelay(3000, 8000));

    // Scroll around a bit
    await humanScroll(page);
    await sleep(humanDelay(2000, 5000));

    // Occasionally interact more
    if (Math.random() < 0.3) {
      await humanScroll(page);
      await sleep(humanDelay(2000, 4000));
    }

    // Navigate back to feed
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    await sleep(humanDelay(2000, 4000));

    log.info(`  [nav] Returned to feed from ${dest.name}`);
  } catch (err) {
    log.warn(`Random navigation to ${dest.name} failed: ${err.message}`);
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded', timeout: 15000
    }).catch(() => {});
    await sleep(humanDelay(1000, 2000));
  }
}

/**
 * Run a browse-only session: scroll the feed, read posts, but react to nothing.
 * Makes the account look like a normal user who sometimes just browses.
 */
async function browseOnlySession(page, maxMinutes) {
  log.info('Browse-only session — scrolling and reading without reacting');
  const startTime = Date.now();
  const maxMs = maxMinutes * 60 * 1000;

  // Maybe check notifications first
  if (Math.random() < 0.5) {
    await randomNavigation(page);
  }

  while (Date.now() - startTime < maxMs) {
    await humanScroll(page);
    await sleep(humanDelay(2000, 6000));

    // Occasionally do a longer reading pause
    if (Math.random() < 0.25) {
      await sleep(humanDelay(5000, 15000));
    }

    // Occasionally expand a post
    if (Math.random() < 0.15) {
      const post = page.locator('div[role="listitem"]').first();
      await expandPost(page, post);
    }

    // Occasionally visit a profile
    if (Math.random() < 0.08) {
      await visitProfile(page);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log.info(`Browse-only session complete: ${elapsed}s of browsing`);
}

module.exports = {
  visitProfile,
  expandPost,
  randomNavigation,
  browseOnlySession,
};
