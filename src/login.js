const { launchBrowser } = require('./browser/launch');
const { validateSession } = require('./browser/session');
const log = require('./utils/logger');

async function manualLogin() {
  log.info('=== LinkedIn Manual Login ===');
  log.info('A browser window will open. Please log in to LinkedIn manually.');
  log.info('After logging in, the system will save your session automatically.\n');

  let context;
  try {
    const { context: ctx, page } = await launchBrowser();
    context = ctx;

    await page.goto('https://www.linkedin.com/login', {
      waitUntil: 'domcontentloaded',
    });

    log.info('Waiting for you to complete login...');
    log.info('(The browser will close automatically once login is detected)\n');

    // Poll for successful login by checking URL
    let loggedIn = false;
    while (!loggedIn) {
      await page.waitForTimeout(3000);
      const url = page.url();
      if (url.includes('/feed') || url.includes('/mynetwork') || url.includes('/messaging')) {
        loggedIn = true;
      }
    }

    // Validate the session
    const valid = await validateSession(page);
    if (valid) {
      log.success('Login successful! Session has been saved.');
      log.info('You can now run "npm start" to begin automated sessions.');
    } else {
      log.error('Login appeared to succeed but session validation failed.');
      log.info('Please try again with "npm run login".');
    }
  } catch (err) {
    log.error(`Login failed: ${err.message}`);
  } finally {
    if (context) {
      await context.close();
    }
  }
}

manualLogin();
