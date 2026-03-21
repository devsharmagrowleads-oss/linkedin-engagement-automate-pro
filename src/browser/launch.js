const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const config = require('../config');
const log = require('../utils/logger');

chromium.use(stealth);

async function launchBrowser() {
  log.info('Launching browser with stealth mode...');

  // Add minor viewport variance between sessions (±0-20px) to avoid static fingerprint
  const widthVariance = Math.floor(Math.random() * 21) - 10;
  const heightVariance = Math.floor(Math.random() * 21) - 10;

  const context = await chromium.launchPersistentContext(config.browserProfileDir, {
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--enable-webgl',
      '--use-gl=swiftshader',
      '--enable-accelerated-2d-canvas',
      '--no-first-run',
    ],
    viewport: {
      width: config.viewportWidth + widthVariance,
      height: config.viewportHeight + heightVariance,
    },
    locale: config.locale,
    timezoneId: config.timezone,
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = context.pages()[0] || await context.newPage();

  log.success('Browser launched successfully');
  return { context, page };
}

module.exports = { launchBrowser };
