const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.ADMIN_PORT, 10) || 4000;

app.use(express.json({ limit: '50kb' }));

// Trust reverse proxy (nginx/Caddy) for correct client IP
app.set('trust proxy', 1);

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// CORS — allow client tools to POST reports (requires API key auth)
app.use('/api/report', (req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// API key auth middleware
function authMiddleware(req, res, next) {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return next(); // no key configured = open access

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || token !== key) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes — both report and dashboard endpoints require auth when ADMIN_API_KEY is set
app.use('/api/report', authMiddleware, require('./routes/report'));
app.use('/api', authMiddleware, require('./routes/dashboard'));

// SPA fallback
app.use((req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(`Admin API error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Growleads Admin Dashboard running on port ${PORT}`);
  console.log(`Deploy behind nginx/Caddy for HTTPS access from anywhere.`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set ADMIN_PORT to a different value.`);
    process.exit(1);
  }
  console.error(`Server error: ${err.message}`);
  process.exit(1);
});
