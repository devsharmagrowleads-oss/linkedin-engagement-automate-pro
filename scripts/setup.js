#!/usr/bin/env node
/**
 * Cross-platform setup script for Growleads LinkedIn Engagement Autopilot.
 * Works on Windows, macOS, and Linux.
 *
 * Usage: node scripts/setup.js
 *    or: npm run setup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');
const DATA_DIR = path.join(ROOT, 'data');
const BROWSER_PROFILE = path.join(ROOT, 'browser-profile');

function log(msg) { console.log(`[setup] ${msg}`); }
function warn(msg) { console.log(`[setup] WARNING: ${msg}`); }
function ok(msg) { console.log(`[setup] OK: ${msg}`); }

// ── Step 0: Check Node.js version ────────────────────────────────────
const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
if (nodeVersion < 18) {
  console.error(`\n[setup] ERROR: Node.js 18+ required (you have ${process.version})`);
  console.error('[setup] Install Node.js 18+ from https://nodejs.org/');
  console.error('[setup] Or use nvm: nvm install 18 && nvm use 18\n');
  process.exit(1);
}
ok(`Node.js ${process.version}`);

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
    return true;
  } catch {
    return false;
  }
}

// ── Step 1: Create .env from .env.example ────────────────────────────
log('Checking .env configuration...');
if (!fs.existsSync(ENV_PATH)) {
  if (fs.existsSync(ENV_EXAMPLE)) {
    fs.copyFileSync(ENV_EXAMPLE, ENV_PATH);
    ok('.env created from .env.example');
    log('IMPORTANT: Edit .env to set your USER_NAME, TEAM, and TIMEZONE before using.');
  } else {
    warn('.env.example not found — you will need to create .env manually.');
  }
} else {
  ok('.env already exists');
}

// ── Step 2: Create data directories ──────────────────────────────────
log('Creating data directories...');
for (const dir of [DATA_DIR, path.join(DATA_DIR, 'errors')]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    ok(`Created ${path.relative(ROOT, dir)}/`);
  }
}

// ── Step 3: Install npm dependencies ─────────────────────────────────
log('Installing npm dependencies...');
if (!run('npm install')) {
  warn('npm install failed. Please run "npm install" manually.');
}

// ── Step 4: Install Playwright browsers ──────────────────────────────
log('Installing Playwright Chromium browser...');
if (!run('npx playwright install chromium')) {
  warn('Playwright browser install failed. Please run "npx playwright install chromium" manually.');
}

// ── Step 5: Verify setup ─────────────────────────────────────────────
log('');
log('=== Setup Complete ===');
log('');
log('Next steps:');
log('  1. Edit .env to set your USER_NAME, TEAM, TIMEZONE');
log('  2. Run: npm run login       (login to LinkedIn in a browser window)');
log('  3. Run: npm run dashboard   (start the web dashboard at http://localhost:3000)');
log('  4. Use the dashboard to start/stop sessions and configure settings.');
log('');
log('For daemon mode (auto-runs sessions during configured windows):');
log('  npm run daemon');
log('');
