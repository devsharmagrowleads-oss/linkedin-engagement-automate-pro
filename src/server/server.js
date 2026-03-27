const express = require('express');
const path = require('path');
const apiRouter = require('./api');
const log = require('../utils/logger');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// Security: limit request body size
app.use(express.json({ limit: '10kb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:");
  next();
});

// CSRF protection: block cross-origin mutating requests
// Require Origin/Referer header from localhost for all mutating requests
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer || '';
    if (!origin) {
      // Deny requests with no Origin header (prevents form-based CSRF)
      return res.status(403).json({ error: 'Forbidden: missing origin header' });
    }
    try {
      const url = new URL(origin);
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        return res.status(403).json({ error: 'Forbidden: cross-origin request' });
      }
    } catch {
      return res.status(403).json({ error: 'Forbidden: invalid origin' });
    }
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  },
}));

// Error screenshots served as static files
app.use('/screenshots', express.static(path.join(__dirname, '..', '..', 'data', 'errors')));

// API routes
app.use('/api', apiRouter);

// SPA fallback — serve index.html for all non-API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/screenshots')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  log.error(`API error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// Bind to localhost only (security: prevents LAN exposure)
const server = app.listen(PORT, '127.0.0.1', () => {
  log.info(`Dashboard running at http://localhost:${PORT}`);
  log.info('Open this URL in your browser to manage LinkedIn Auto-React');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log.error(`Port ${PORT} is already in use.`);
    log.error(`Either stop the other process or set a different port: PORT=3001 npm run dashboard`);
    process.exit(1);
  }
  log.error(`Server error: ${err.message}`);
  process.exit(1);
});
