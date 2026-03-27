const express = require('express');
const db = require('../db');

const router = express.Router();

router.post('/', (req, res) => {
  try {
    const { userName, team, linkedinName, linkedinUrl, sessionId } = req.body;

    if (!userName || !String(userName).trim() || !sessionId || !String(sessionId).trim()) {
      return res.status(400).json({ error: 'userName and sessionId are required' });
    }

    const userId = db.upsertUser(userName, team || 'default', linkedinName, linkedinUrl);
    if (!userId) {
      return res.status(500).json({ error: 'Failed to upsert user' });
    }

    db.insertReport(userId, req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('Report error:', err.message);
    res.status(500).json({ error: 'Failed to process report' });
  }
});

module.exports = router;
