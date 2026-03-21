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
      return { valid: false };
    }

    let isValid = false;

    // If we're on /feed/ or any authenticated LinkedIn page, the session is valid
    if (url.includes('linkedin.com/feed') || url.includes('linkedin.com/mynetwork') || url.includes('linkedin.com/in/') || url.includes('linkedin.com/messaging')) {
      isValid = true;
    }

    // Fallback: try to find any content that indicates we're logged in
    if (!isValid) {
      const loggedIn = await page.locator('[data-control-name], .global-nav, .scaffold-layout, main, #main').first()
        .isVisible({ timeout: 10000 })
        .catch(() => false);
      isValid = loggedIn;
    }

    if (!isValid) {
      log.warn(`Session validation uncertain - URL: ${url}`);
      return { valid: false };
    }

    // Extract LinkedIn identity from the logged-in session
    const identity = await extractLinkedInIdentity(page);
    log.success(`LinkedIn session is valid (logged in as: ${identity.name})`);

    return { valid: true, linkedinName: identity.name, linkedinUrl: identity.url };
  } catch (err) {
    log.error(`Session validation failed: ${err.message}`);
    return { valid: false };
  }
}

/**
 * Extract the logged-in user's LinkedIn profile name and URL.
 * Uses multiple fallback selectors since LinkedIn changes DOM frequently.
 */
async function extractLinkedInIdentity(page) {
  let name = 'Unknown';
  let profileUrl = '';

  try {
    // Try 1: Global nav profile photo alt text
    const photoAlt = await page.locator('img.global-nav__me-photo').first()
      .getAttribute('alt', { timeout: 3000 }).catch(() => null);
    if (photoAlt && photoAlt !== 'Photo of' && photoAlt.length > 1) {
      name = photoAlt.replace(/^Photo of\s*/i, '').trim();
    }

    // Try 2: Profile link in nav
    if (name === 'Unknown') {
      const navLink = await page.locator('.global-nav__primary-link-me-menu-trigger, a[href*="/in/"]').first()
        .innerText({ timeout: 3000 }).catch(() => null);
      if (navLink && navLink.trim().length > 1 && navLink.trim().length < 60) {
        name = navLink.trim().split('\n')[0].trim();
      }
    }

    // Try 3: Extract profile URL from nav
    const profileHref = await page.locator('a[href*="/in/"]').first()
      .getAttribute('href', { timeout: 3000 }).catch(() => null);
    if (profileHref) {
      profileUrl = profileHref.split('?')[0];
      if (!profileUrl.startsWith('http')) {
        profileUrl = 'https://www.linkedin.com' + profileUrl;
      }
    }
  } catch {
    // Identity extraction is best-effort — never block the session
  }

  return { name, url: profileUrl };
}

module.exports = { validateSession };
