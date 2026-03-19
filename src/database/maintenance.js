const db = require('./db');
const log = require('../utils/logger');

/**
 * Run all maintenance tasks
 * Called at the start of each session
 */
function runMaintenance() {
  log.info('Running database maintenance...');
  db.pruneOldData();
}

module.exports = { runMaintenance };
