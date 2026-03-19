const express = require('express');
const path = require('path');
const apiRouter = require('./api');
const log = require('../utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Error screenshots served as static files
app.use('/screenshots', express.static(path.join(__dirname, '..', '..', 'data', 'errors')));

// API routes
app.use('/api', apiRouter);

// SPA fallback — serve index.html for all non-API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/screenshots')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  log.info(`Dashboard running at http://localhost:${PORT}`);
  log.info('Open this URL in your browser to manage LinkedIn Auto-React');
});
