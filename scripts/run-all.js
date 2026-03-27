#!/usr/bin/env node
/**
 * Run one session for each account defined in accounts.json.
 * Runs accounts ONE AT A TIME (sequential) so only one browser is open.
 * This is the "one click, all accounts" script.
 *
 * Usage: node scripts/run-all.js
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

console.log(`\n========================================`);
console.log(` Running sessions for ${accounts.length} accounts`);
console.log(`========================================\n`);

const results = [];

for (let i = 0; i < accounts.length; i++) {
  const acc = accounts[i];
  const profileDir = path.join(ROOT, `browser-profile-${acc.name}`);
  const hasProfile = fs.existsSync(path.join(profileDir, 'Default'))
    || fs.existsSync(path.join(profileDir, 'Local State'));

  if (!hasProfile) {
    console.log(`[${i + 1}/${accounts.length}] ${acc.label || acc.name} — not logged in, skipping.`);
    console.log(`  Run: ACCOUNT=${acc.name} npm run login\n`);
    results.push({ name: acc.label || acc.name, status: 'skipped (not logged in)' });
    continue;
  }

  console.log(`[${i + 1}/${accounts.length}] ${acc.label || acc.name} — starting session...`);

  try {
    execSync(`node src/index.js`, {
      cwd: ROOT,
      env: { ...process.env, ACCOUNT: acc.name, FORCE_NO_JITTER: '1', FORCE_NO_SKIP: '1' },
      stdio: 'inherit',
      timeout: 45 * 60 * 1000, // 45 min max per account
    });
    results.push({ name: acc.label || acc.name, status: 'completed' });
  } catch (err) {
    if (err.killed) {
      console.error(`  Session timed out for ${acc.name}`);
      results.push({ name: acc.label || acc.name, status: 'timed out' });
    } else {
      console.error(`  Session error for ${acc.name}: ${err.message}`);
      results.push({ name: acc.label || acc.name, status: 'error' });
    }
  }

  console.log('');
}

// Print summary
console.log(`========================================`);
console.log(` Summary`);
console.log(`========================================`);
for (const r of results) {
  console.log(`  ${r.name}: ${r.status}`);
}
console.log('');
