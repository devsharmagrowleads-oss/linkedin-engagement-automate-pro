#!/usr/bin/env node
/**
 * Login to LinkedIn for each account defined in accounts.json.
 * Opens one browser at a time — you log in, it saves, moves to the next.
 *
 * Usage: node scripts/login-all.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ACCOUNTS_PATH = path.join(ROOT, 'accounts.json');

if (!fs.existsSync(ACCOUNTS_PATH)) {
  console.error('accounts.json not found. Create it first with your account names.');
  process.exit(1);
}

const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf-8'));

if (!accounts.length) {
  console.error('accounts.json is empty. Add at least one account.');
  process.exit(1);
}

console.log(`\n=== Login All Accounts (${accounts.length} accounts) ===\n`);

for (let i = 0; i < accounts.length; i++) {
  const acc = accounts[i];
  const profileDir = path.join(ROOT, `browser-profile-${acc.name}`);
  const hasProfile = fs.existsSync(path.join(profileDir, 'Default'))
    || fs.existsSync(path.join(profileDir, 'Local State'));

  if (hasProfile) {
    console.log(`[${i + 1}/${accounts.length}] ${acc.label || acc.name} — already logged in, skipping.`);
    continue;
  }

  console.log(`[${i + 1}/${accounts.length}] ${acc.label || acc.name} — opening browser for login...`);
  console.log(`  Log into the LinkedIn account for "${acc.label || acc.name}".`);
  console.log(`  The browser will close automatically when login is detected.\n`);

  try {
    execSync(`node src/login.js`, {
      cwd: ROOT,
      env: { ...process.env, ACCOUNT: acc.name },
      stdio: 'inherit',
    });
  } catch (err) {
    console.error(`  Login failed for ${acc.name}: ${err.message}`);
  }

  console.log('');
}

console.log('=== All accounts processed ===\n');
