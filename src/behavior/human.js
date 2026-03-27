// Human-like behavior simulation — personality-driven

/**
 * Gaussian random using Box-Muller transform
 */
function gaussianRandom(mean, stdDev) {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + normal * stdDev;
}

/**
 * Human-like delay between actions (gaussian-distributed, clamped)
 */
function humanDelay(minMs, maxMs) {
  const mean = (minMs + maxMs) / 2;
  const stdDev = (maxMs - minMs) / 6;
  const delay = Math.round(gaussianRandom(mean, stdDev));
  return Math.max(minMs, Math.min(maxMs, delay));
}

/**
 * Simulate reading time based on word count (~225 wpm with variance)
 */
function readingTime(text) {
  const wordCount = (text || '').split(/\s+/).length;
  const baseTimeMs = (wordCount / 225) * 60 * 1000;
  const variance = baseTimeMs * (0.7 + Math.random() * 0.6);
  return Math.max(1500, Math.round(variance));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Human-like scroll with inertia simulation and personality-driven timing.
 * Replaces the old fixed-step approach with variable velocity that decays.
 */
async function humanScroll(page, personality) {
  // Fallback defaults if no personality (backward compat)
  const p = personality || {};
  const speedFactor = p.scrollSpeedFactor || 1.0;
  const pauseChance = p.scrollPauseChance != null ? p.scrollPauseChance : 0.25;
  const scrollBackChance = p.scrollBackChance != null ? p.scrollBackChance : 0.08;
  const longReadChance = p.longReadChance != null ? p.longReadChance : 0.07;

  // Variable initial velocity (pixels per step)
  const initialVelocity = gaussianRandom(5, 2) * speedFactor;
  const steps = 6 + Math.floor(Math.random() * 12);
  const friction = 0.85 + Math.random() * 0.10;
  let velocity = Math.max(2, initialVelocity);

  for (let i = 0; i < steps; i++) {
    // Add micro-jitter to each scroll event
    const jitter = (Math.random() - 0.5) * 6;
    const delta = Math.round(velocity * 15 + jitter);
    await page.mouse.wheel(0, Math.max(1, delta));
    velocity *= friction;
    await sleep(humanDelay(15, 60));
  }

  // Reading pause (personality-driven probability)
  if (Math.random() < pauseChance) {
    await sleep(humanDelay(2000, 7000));
  }

  // Long read — simulates reading a detailed post
  if (Math.random() < longReadChance) {
    await sleep(humanDelay(12000, 35000));
  }

  // Scroll-back (like re-reading something you passed)
  if (Math.random() < scrollBackChance) {
    const backAmount = Math.round(gaussianRandom(150, 70));
    await page.mouse.wheel(0, -Math.max(50, backAmount));
    await sleep(humanDelay(500, 2000));
  }
}

/**
 * Cubic Bezier interpolation for mouse movement paths.
 */
function bezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Move mouse through a Bezier curve path then click.
 * Much more human-like than linear interpolation.
 */
async function humanClick(page, locator) {
  const box = await locator.boundingBox();
  if (!box) return false;

  // Target: random point within the element
  const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
  const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

  // Start: offset from the target (simulate mouse coming from somewhere)
  const startX = targetX + gaussianRandom(-120, 60);
  const startY = targetY + gaussianRandom(-80, 40);

  // Two control points for cubic Bezier curve
  const cp1x = startX + (targetX - startX) * 0.3 + gaussianRandom(0, 35);
  const cp1y = startY + (targetY - startY) * 0.3 + gaussianRandom(0, 25);
  const cp2x = startX + (targetX - startX) * 0.7 + gaussianRandom(0, 25);
  const cp2y = startY + (targetY - startY) * 0.7 + gaussianRandom(0, 18);

  // Sample points along the curve
  const steps = 8 + Math.floor(Math.random() * 8);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Bell curve timing: slow-fast-slow
    const timingFactor = 0.5 - 0.5 * Math.cos(Math.PI * t);
    const x = bezierPoint(t, startX, cp1x, cp2x, targetX) + gaussianRandom(0, 1.5);
    const y = bezierPoint(t, startY, cp1y, cp2y, targetY) + gaussianRandom(0, 1.5);
    await page.mouse.move(x, y);
    await sleep(humanDelay(10, 40 + Math.round(30 * (1 - timingFactor))));
  }

  // Occasionally overshoot then correct (5%)
  if (Math.random() < 0.05) {
    const overshootX = targetX + gaussianRandom(5, 3);
    const overshootY = targetY + gaussianRandom(4, 2);
    await page.mouse.move(overshootX, overshootY);
    await sleep(humanDelay(60, 160));
    await page.mouse.move(targetX, targetY);
    await sleep(humanDelay(30, 80));
  }

  // Final position and click
  await page.mouse.move(targetX, targetY);
  await sleep(humanDelay(40, 150));
  await page.mouse.click(targetX, targetY);

  return true;
}

/**
 * Decide whether to skip a matched post.
 * Uses personality-driven skip rate (60-80%) instead of fixed 7%.
 */
function shouldSkip(remainingPool, remainingQuota, personality) {
  const p = personality || {};
  const baseSkipChance = p.skipMatchChance != null ? p.skipMatchChance : 0.65;

  // If we're running low on matches, reduce skipping
  if (remainingPool <= remainingQuota * 1.2) {
    return Math.random() < baseSkipChance * 0.1;
  }
  return Math.random() < baseSkipChance;
}

// QWERTY adjacent key map for typo generation
const ADJACENT_KEYS = {
  'a': 'sqwz', 'b': 'vghn', 'c': 'xdfv', 'd': 'serfcx', 'e': 'wrsdf',
  'f': 'dertgcv', 'g': 'frtyh vb', 'h': 'gtyujbn', 'i': 'ujklo',
  'j': 'hyuiknm', 'k': 'juiolm', 'l': 'kop', 'm': 'njk', 'n': 'bhjm',
  'o': 'iklp', 'p': 'ol', 'q': 'wa', 'r': 'edft', 's': 'awedxz',
  't': 'rfgy', 'u': 'yhjik', 'v': 'cfgb', 'w': 'qase', 'x': 'zsdc',
  'y': 'tghu', 'z': 'asx',
};

function getTypoChar(original) {
  const lower = original.toLowerCase();
  const adj = ADJACENT_KEYS[lower];
  if (!adj) return null;
  const typo = adj[Math.floor(Math.random() * adj.length)];
  return original === original.toUpperCase() ? typo.toUpperCase() : typo;
}

/**
 * Type text with human-like keystroke delays, optional typos, and personality-driven pacing.
 */
async function humanType(page, locator, text, personality) {
  const p = personality || {};
  const delayRange = p.typingDelayRange || [50, 100];
  const typoChance = p.typoChance != null ? p.typoChance : 0.0;
  const pauseChance = p.thinkingPauseChance != null ? p.thinkingPauseChance : 0.12;

  // Click to focus
  await locator.click();
  await sleep(humanDelay(200, 500));

  // Decide if this comment gets a typo (max 1 per comment)
  const typoPosition = (Math.random() < typoChance && text.length > 15)
    ? Math.floor(3 + Math.random() * (text.length - 6)) // avoid first/last 3 chars
    : -1;

  let charIndex = 0;
  const chunks = text.split(/(\s+)/);

  for (const chunk of chunks) {
    if (!chunk) continue;

    for (let i = 0; i < chunk.length; i++) {
      const globalIdx = charIndex + i;
      const char = chunk[i];

      // Inject typo at the designated position
      if (globalIdx === typoPosition) {
        const typoChar = getTypoChar(char);
        if (typoChar) {
          await page.keyboard.type(typoChar, { delay: 0 });
          await sleep(humanDelay(250, 600)); // "oh crap" pause
          await page.keyboard.press('Backspace');
          await sleep(humanDelay(80, 250));
        }
      }

      // Type the correct character with variable delay
      const delay = Math.round(gaussianRandom(
        (delayRange[0] + delayRange[1]) / 2,
        (delayRange[1] - delayRange[0]) / 4
      ));
      await page.keyboard.type(char, { delay: 0 });
      await sleep(Math.max(20, Math.min(200, delay)));
    }

    charIndex += chunk.length;

    // End-of-sentence pause (after . ! ?)
    if (/[.!?]$/.test(chunk.trim())) {
      await sleep(humanDelay(300, 900));
    }
    // Thinking pause between words (personality-driven)
    else if (chunk.trim() && Math.random() < pauseChance) {
      await sleep(humanDelay(200, 1000));
    }
  }
}

/**
 * Simulate thinking delay before typing a comment.
 */
function thinkingDelay(commentLength, personality) {
  const p = personality || {};
  const tempoFactor = p.tempo === 'fast' ? 0.6 : p.tempo === 'contemplative' ? 1.8 : 1.0;
  const base = humanDelay(5000, 15000);
  const lengthFactor = Math.min(commentLength / 200, 1) * 3000;
  return Math.round((base + lengthFactor * Math.random()) * tempoFactor);
}

module.exports = {
  gaussianRandom,
  humanDelay,
  readingTime,
  sleep,
  humanScroll,
  humanClick,
  shouldSkip,
  humanType,
  thinkingDelay,
};
