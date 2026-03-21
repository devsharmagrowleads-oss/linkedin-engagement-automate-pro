const express = require('express');
const db = require('../db');

const router = express.Router();

const INACTIVE_HOURS = parseInt(process.env.INACTIVE_HOURS, 10) || 48;

router.get('/users', (req, res) => {
  try {
    const users = db.getAllUsers(INACTIVE_HOURS);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/users/:id/sessions', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const sessions = db.getUserSessions(parseInt(req.params.id, 10), limit, offset);
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.get('/teams', (req, res) => {
  try {
    const teams = db.getTeamStats();
    res.json({ teams });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team stats' });
  }
});

router.get('/activity', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const activity = db.getRecentActivity(limit);
    res.json({ activity });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

module.exports = router;
