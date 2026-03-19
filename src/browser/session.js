const log = require('../utils/logger');

async function validateSession(page) {
  log.info('Validating LinkedIn session...');

  try {
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait a moment for any redirects
    await page.waitForTimeout(3000);

    const url = page.url();

    // Check if redirected to login
    if (url.includes('/login') || url.includes('/authwall') || url.includes('/checkpoint')) {
      log.warn('Session expired - redirected to login page');
      return false;
    }

    // Check for feed content presence
    const feedPresent = await page.locator('.scaffold-layout__main, .feed-shared-update-v2').first().isVisible({ timeout: 10000 }).catch(() => false);

    if (!feedPresent) {
      log.warn('Session may be invalid - feed content not found');
      return false;
    }

    log.success('LinkedIn session is valid');
    return true;
  } catch (err) {
    log.error(`Session validation failed: ${err.message}`);
    return false;
  }
}

module.exports = { validateSession };
