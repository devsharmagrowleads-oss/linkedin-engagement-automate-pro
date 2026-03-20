const log = require('../utils/logger');

async function validateSession(page) {
  log.info('Validating LinkedIn session...');

  try {
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait a bit for any redirects or page load
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const url = page.url();
    log.info(`Validation URL: ${url}`);

    // Check if redirected to login
    if (url.includes('/login') || url.includes('/authwall') || url.includes('/checkpoint') || url.includes('/uas/')) {
      log.warn('Session expired - redirected to login page');
      return false;
    }

    // If we're on /feed/ or any authenticated LinkedIn page, the session is valid
    // No need to check specific DOM selectors which change frequently
    if (url.includes('linkedin.com/feed') || url.includes('linkedin.com/mynetwork') || url.includes('linkedin.com/in/') || url.includes('linkedin.com/messaging')) {
      log.success('LinkedIn session is valid');
      return true;
    }

    // Fallback: try to find any content that indicates we're logged in
    const loggedIn = await page.locator('[data-control-name], .global-nav, .scaffold-layout, main, #main').first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (loggedIn) {
      log.success('LinkedIn session is valid (detected via DOM)');
      return true;
    }

    log.warn(`Session validation uncertain - URL: ${url}`);
    return false;
  } catch (err) {
    log.error(`Session validation failed: ${err.message}`);
    return false;
  }
}

module.exports = { validateSession };
