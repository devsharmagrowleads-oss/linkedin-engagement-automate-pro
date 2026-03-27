/**
 * Session Personality Generator
 *
 * At the start of each session, generates a randomized behavioral profile
 * so every session feels different. This defeats LinkedIn's ML which detects
 * fixed-probability patterns across sessions.
 *
 * Key concept: "tempo" determines the session's base pace, then every
 * parameter gets additional per-session jitter so no two sessions are alike.
 */

const { gaussianRandom } = require('./human');

const TEMPOS = [
  { name: 'fast',          weight: 0.20 },
  { name: 'normal',        weight: 0.40 },
  { name: 'slow',          weight: 0.25 },
  { name: 'contemplative', weight: 0.15 },
];

const SESSION_TYPES = [
  { name: 'focused',    weight: 0.30 },
  { name: 'casual',     weight: 0.35 },
  { name: 'distracted', weight: 0.20 },
  { name: 'power-user', weight: 0.15 },
];

function weightedPick(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.name;
  }
  return items[items.length - 1].name;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/** Apply jitter to a value: multiply by gaussian around 1.0 */
function jitter(value, stdDev = 0.15) {
  return value * clamp(gaussianRandom(1.0, stdDev), 0.5, 1.8);
}

/** Apply jitter to a probability, clamped to [0.01, 0.95] */
function jitterProb(value, stdDev = 0.3) {
  return clamp(value * gaussianRandom(1.0, stdDev), 0.01, 0.95);
}

/**
 * Generate a session personality with randomized behavioral parameters.
 * @param {object} [configOverrides] - Optional overrides from config
 * @returns {object} Frozen personality object
 */
function generateSessionPersonality(configOverrides = {}) {
  const tempo = weightedPick(TEMPOS);
  const sessionType = weightedPick(SESSION_TYPES);

  // Base multipliers per tempo
  const tempoMultipliers = {
    fast:          { delay: 0.6,  pause: 0.5,  read: 0.6  },
    normal:        { delay: 1.0,  pause: 1.0,  read: 1.0  },
    slow:          { delay: 1.5,  pause: 1.4,  read: 1.5  },
    contemplative: { delay: 2.2,  pause: 1.8,  read: 2.0  },
  };
  const tm = tempoMultipliers[tempo];

  // Base reaction delay from config or defaults (in ms)
  const baseDelayMin = (configOverrides.reactionDelayMinSec || 60) * 1000;
  const baseDelayMax = (configOverrides.reactionDelayMaxSec || 180) * 1000;

  // Base typing speed from config or defaults
  const baseTypingMin = configOverrides.typingSpeedMin || 40;
  const baseTypingMax = configOverrides.typingSpeedMax || 90;

  // Match skip range from config
  const matchSkipMin = (configOverrides.matchSkipMin || 60) / 100;
  const matchSkipMax = (configOverrides.matchSkipMax || 80) / 100;
  const skipBase = matchSkipMin + Math.random() * (matchSkipMax - matchSkipMin);

  const personality = {
    // Identity
    tempo,
    sessionType,

    // Core timing (scaled by tempo + jittered)
    reactionDelayRange: [
      Math.round(jitter(baseDelayMin * tm.delay)),
      Math.round(jitter(baseDelayMax * tm.delay)),
    ],

    // Scroll behavior
    scrollPauseChance:    jitterProb(tempo === 'contemplative' ? 0.50 : tempo === 'slow' ? 0.35 : 0.18),
    scrollBackChance:     jitterProb(0.08),
    longReadChance:       jitterProb(tempo === 'contemplative' ? 0.18 : 0.07),
    scrollSpeedFactor:    clamp(gaussianRandom(tm.delay, 0.2), 0.4, 2.5),

    // Engagement probabilities
    profileVisitChance:   jitterProb(sessionType === 'casual' ? 0.10 : 0.05),
    expandPostChance:     jitterProb(sessionType === 'focused' ? 0.15 : 0.08),
    skipMatchChance:      clamp(skipBase + gaussianRandom(0, 0.05), 0.40, 0.90),
    navDiversionChance:   jitterProb(sessionType === 'distracted' ? 0.35 : 0.15),
    initialNavChance:     jitterProb(0.25),

    // Navigation interval (posts between navigation diversions)
    navIntervalRange: [
      Math.round(jitter(sessionType === 'distracted' ? 8 : 20, 0.3)),
      Math.round(jitter(sessionType === 'distracted' ? 18 : 40, 0.3)),
    ],

    // Typing
    typingDelayRange: [
      Math.round(clamp(jitter(baseTypingMin), 30, 120)),
      Math.round(clamp(jitter(baseTypingMax), 60, 150)),
    ],
    typoChance:           clamp(gaussianRandom(0.08, 0.04), 0.0, 0.20),
    thinkingPauseChance:  jitterProb(tempo === 'contemplative' ? 0.25 : 0.10),

    // Fatigue: delays increase by this factor per reaction
    fatigueRate: clamp(gaussianRandom(0.02, 0.01), 0.005, 0.06),

    // Reaction behavior
    hesitationChance:     jitterProb(0.06),
    reconsiderChance:     jitterProb(0.03),

    // Long distraction pause
    distractionChance:    jitterProb(sessionType === 'distracted' ? 0.10 : 0.04),
    distractionRange:     [60000, 180000], // 1-3 minutes
  };

  // Ensure delay range is ordered correctly
  if (personality.reactionDelayRange[0] > personality.reactionDelayRange[1]) {
    personality.reactionDelayRange.reverse();
  }
  if (personality.navIntervalRange[0] > personality.navIntervalRange[1]) {
    personality.navIntervalRange.reverse();
  }
  if (personality.typingDelayRange[0] > personality.typingDelayRange[1]) {
    personality.typingDelayRange.reverse();
  }

  return Object.freeze(personality);
}

module.exports = { generateSessionPersonality };
