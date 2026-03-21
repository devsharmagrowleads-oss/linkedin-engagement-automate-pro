const config = require('../config');
const log = require('../utils/logger');

/**
 * Report session data to the central admin server.
 * Fire-and-forget: never blocks or crashes the main session flow.
 */
async function reportSession(sessionData) {
  if (!config.adminApiUrl) return; // reporting not configured

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${config.adminApiUrl}/api/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.adminApiKey}`,
      },
      body: JSON.stringify({
        userName: config.userName,
        team: config.team,
        linkedinName: sessionData.linkedinName || 'Unknown',
        linkedinUrl: sessionData.linkedinUrl || '',
        sessionId: sessionData.sessionId,
        window: sessionData.window,
        status: sessionData.status,
        postsScrolled: sessionData.postsScrolled || 0,
        postsMatched: sessionData.postsMatched || 0,
        postsReacted: sessionData.postsReacted || 0,
        postsSkipped: sessionData.postsSkipped || 0,
        startedAt: sessionData.startedAt,
        endedAt: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      log.info('Session reported to admin server');
    } else {
      log.warn(`Admin server returned ${res.status}`);
    }
  } catch (err) {
    log.warn(`Failed to report to admin: ${err.message}`);
    // Never throw — reporting failure must not break the tool
  }
}

module.exports = { reportSession };
