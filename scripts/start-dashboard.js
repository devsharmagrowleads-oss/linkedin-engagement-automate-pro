#!/usr/bin/env node
/**
 * Smart dashboard launcher.
 * - Reads PORT from .env (default 3000)
 * - If that port is taken, tries 3000-3005 until one works
 * - Opens the browser automatically
 * - Non-tech users just double-click start.bat and it works
 */

const net = require('net');
const { spawn, exec } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Load .env to get PORT
require('dotenv').config({ path: path.join(ROOT, '.env') });
const preferredPort = parseInt(process.env.PORT, 10) || 3000;

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

async function tryFetch(port) {
  try {
    const res = await fetch(`http://localhost:${port}/api/status`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function openBrowser(port) {
  const url = `http://localhost:${port}`;
  const platform = process.platform;
  if (platform === 'win32') exec(`start "" "${url}"`);
  else if (platform === 'darwin') exec(`open "${url}"`);
  else exec(`xdg-open "${url}" 2>/dev/null`);
}

async function main() {
  // Check if preferred port already has our dashboard running
  if (!(await isPortFree(preferredPort))) {
    const isOurs = await tryFetch(preferredPort);
    if (isOurs) {
      console.log(`  Dashboard is already running at http://localhost:${preferredPort}`);
      console.log(`  Opening in browser...\n`);
      openBrowser(preferredPort);
      return;
    }
  }

  // Find a free port
  let port = null;
  const candidates = [preferredPort, 3000, 3001, 3002, 3003, 3004, 3005];
  // Remove duplicates while preserving order
  const unique = [...new Set(candidates)];

  for (const p of unique) {
    if (await isPortFree(p)) {
      port = p;
      break;
    }
  }

  if (!port) {
    console.error('  ERROR: All ports 3000-3005 are in use.');
    console.error('  Close other programs and try again.');
    process.exit(1);
  }

  if (port !== preferredPort) {
    console.log(`  Port ${preferredPort} is in use, using port ${port} instead.`);
  }
  console.log(`  Dashboard starting at http://localhost:${port}\n`);

  // Open browser after 2 seconds
  setTimeout(() => openBrowser(port), 2000);

  // Start the server (inherits stdio so output shows in the terminal)
  const server = spawn('node', ['src/server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: 'inherit',
  });

  server.on('close', (code) => {
    if (code !== 0) {
      console.error(`\n  Dashboard exited with error code ${code}.`);
    }
  });
}

main();
