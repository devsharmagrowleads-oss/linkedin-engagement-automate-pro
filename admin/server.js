const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.ADMIN_PORT || 4000;

app.use(express.json({ limit: '50kb' }));

// Trust reverse proxy (nginx/Caddy) for correct client IP
app.set('trust proxy', 1);

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// CORS — allow client tools from any origin to POST reports
app.use('/api/report', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// API key auth for report endpoint
function authMiddleware(req, res, next) {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return next(); // no key configured = open access

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || token !== key) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Health check for Docker
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/report', authMiddleware, require('./routes/report'));
app.use('/api', require('./routes/dashboard'));

// SPA fallback
app.use((req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Growleads Admin Dashboard running on port ${PORT}`);
  console.log(`Deploy behind nginx/Caddy for HTTPS access from anywhere.`);
});
