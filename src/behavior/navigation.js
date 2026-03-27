const { humanDelay, humanScroll, humanClick, sleep } = require('./human');
const log = require('../utils/logger');

// Weighted destinations — more variety than just 3 pages
const DESTINATIONS = [
  { name: 'notifications', url: 'https://www.linkedin.com/notifications/',  weight: 0.25, dwellRange: [3000, 8000]  },
  { name: 'messaging',     url: 'https://www.linkedin.com/messaging/',      weight: 0.20, dwellRange: [5000, 20000] },
  { name: 'my network',    url: 'https://www.linkedin.com/mynetwork/',      weight: 0.20, dwellRange: [3000, 10000] },
  { name: 'jobs',          url: 'https://www.linkedin.com/jobs/',           weight: 0.12, dwellRange: [5000, 15000] },
  { name: 'groups',        url: 'https://www.linkedin.com/groups/',         weight: 0.08, dwellRange: [4000, 12000] },
  { name: 'events',        url: 'https://www.linkedin.com/events/',         weight: 0.08, dwellRange: [3000, 10000] },
  { name: 'learning',      url: 'https://www.linkedin.com/learning/',       weight: 0.07, dwellRange: [5000, 18000] },
];

function weightedPickDest() {
  const total = DESTINATIONS.reduce((s, d) => s + d.weight, 0);
  let r = Math.random() * total;
  for (const d of DESTINATIONS) {
    r -= d.weight;
    if (r <= 0) return d;
  }
  return DESTINATIONS[0];
}

/**
 * Visit a LinkedIn profile page to diversify navigation.
 */
async function visitProfile(page, authorName, personality) {
  const p = personality || {};
  const tempoFactor = p.tempo === 'fast' ? 0.6 : p.tempo === 'contemplative' ? 1.8 : 1.0;

  try {
    const profileLink = page.locator(`a[href*="/in/"]`).first();
    const isVisible = await profileLink.isVisible().catch(() => false);

    if (!isVisible) {
      const anyProfile = page.locator('div[role="listitem"] a[href*="/in/"]').first();
      const anyVisible = await anyProfile.isVisible().catch(() => false);
      if (!anyVisible) return;
      await humanClick(page, anyProfile);
    } else {
      await humanClick(page, profileLink);
    }

    await sleep(humanDelay(2000, 4000));

    // Personality-driven profile reading depth
    await humanScroll(page, personality);
    await sleep(humanDelay(
      Math.round(3000 * tempoFactor),
      Math.round(10000 * tempoFactor)
    ));

    // Contemplative sessions dig deeper
    if (p.tempo === 'contemplative' || p.tempo === 'slow') {
      if (Math.random() < 0.35) {
        await humanScroll(page, personality);
        await sleep(humanDelay(2000, 6000));
      }
    }

    log.info(`  [nav] Visited a profile page`);

    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await sleep(humanDelay(1500, 3000));
  } catch (err) {
    log.warn(`Profile visit failed: ${err.message}`);
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded', timeout: 15000
    }).catch(() => {});
    await sleep(humanDelay(1000, 2000));
  }
}

/**
 * Click "see more" on a post to simulate reading full content.
 */
async function expandPost(page, postLocator) {
  try {
    const seeMore = postLocator.locator('button:has-text("more"), button:has-text("see more")').first();
    const isVisible = await seeMore.isVisible().catch(() => false);
    if (!isVisible) return false;

    await humanClick(page, seeMore);
    await sleep(humanDelay(2000, 8000));
    log.info(`  [nav] Expanded a post to read more`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Visit a random LinkedIn page. Uses weighted selection from 7+ destinations.
 */
async function randomNavigation(page, personality) {
  const dest = weightedPickDest();

  try {
    log.info(`  [nav] Visiting ${dest.name}...`);
    await page.goto(dest.url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Destination-specific dwell time
    await sleep(humanDelay(dest.dwellRange[0], dest.dwellRange[1]));

    // Scroll around a bit
    await humanScroll(page, personality);
    await sleep(humanDelay(2000, 5000));

    // Sometimes interact more (personality-driven)
    if (Math.random() < (personality?.navDiversionChance || 0.2)) {
      await humanScroll(page, personality);
      await sleep(humanDelay(2000, 5000));
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
 * Run a browse-only session with personality-driven behavior.
 */
async function browseOnlySession(page, maxMinutes, personality) {
  log.info('Browse-only session — scrolling and reading without reacting');
  const startTime = Date.now();
  const maxMs = maxMinutes * 60 * 1000;

  if (Math.random() < 0.5) {
    await randomNavigation(page, personality);
  }

  while (Date.now() - startTime < maxMs) {
    await humanScroll(page, personality);
    await sleep(humanDelay(2000, 7000));

    if (Math.random() < (personality?.longReadChance || 0.10)) {
      await sleep(humanDelay(8000, 25000));
    }

    if (Math.random() < (personality?.expandPostChance || 0.10)) {
      const post = page.locator('div[role="listitem"]').first();
      await expandPost(page, post);
    }

    if (Math.random() < (personality?.profileVisitChance || 0.05)) {
      await visitProfile(page, null, personality);
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
