/**
 * Account Maturity Ramp-Up
 *
 * New accounts should start with low activity and gradually increase
 * over weeks to avoid the "Day 1: 25 reactions" red flag.
 *
 * Returns a multiplier (0.0-1.0) applied to daily targets.
 */

/**
 * Get a multiplier based on how long the account has been active.
 * @param {object} db - Database module
 * @returns {number} Multiplier 0.15 to 1.0
 */
function getAccountMaturityMultiplier(db) {
  try {
    const firstDate = db.getFirstSessionDate();
    if (!firstDate) return 0.15; // brand new account, very cautious

    const daysSince = Math.floor(
      (new Date(db.getTodayStr()) - new Date(firstDate)) / (24 * 60 * 60 * 1000)
    );

    if (daysSince <= 3)  return 0.15;  // Week 1 start: very light
    if (daysSince <= 7)  return 0.30;  // Week 1 end: light
    if (daysSince <= 14) return 0.50;  // Week 2: moderate
    if (daysSince <= 28) return 0.75;  // Week 3-4: ramp up
    return 1.0;                         // Month 2+: full activity
  } catch {
    return 0.50; // on error, be conservative
  }
}

module.exports = { getAccountMaturityMultiplier };
