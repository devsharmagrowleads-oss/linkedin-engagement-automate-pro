// Human-like behavior simulation

/**
 * Gaussian random using Box-Muller transform
 * Returns a value clustered around the mean with standard deviation
 */
function gaussianRandom(mean, stdDev) {
  const u1 = Math.random() || 1e-10; // Avoid Math.log(0) which produces -Infinity
  const u2 = Math.random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + normal * stdDev;
}

/**
 * Human-like delay between actions
 * Returns a gaussian-distributed value between min and max
 */
function humanDelay(minMs, maxMs) {
  const mean = (minMs + maxMs) / 2;
  const stdDev = (maxMs - minMs) / 6;
  const delay = Math.round(gaussianRandom(mean, stdDev));
  return Math.max(minMs, Math.min(maxMs, delay));
}

/**
 * Simulate reading time based on word count
 * Average reading speed ~225 wpm with variance
 */
function readingTime(text) {
  const wordCount = (text || '').split(/\s+/).length;
  const baseTimeMs = (wordCount / 225) * 60 * 1000;
  const variance = baseTimeMs * (0.7 + Math.random() * 0.6);
  return Math.max(1500, Math.round(variance));
}

/**
 * Wait for a human-like duration
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Human-like scroll on the page
 * Variable speed with occasional pauses and scroll-backs
 */
async function humanScroll(page) {
  const scrollAmount = humanDelay(300, 700);
  const scrollSteps = 3 + Math.floor(Math.random() * 5);
  const stepSize = scrollAmount / scrollSteps;

  for (let i = 0; i < scrollSteps; i++) {
    await page.mouse.wheel(0, stepSize);
    await sleep(humanDelay(30, 100));
  }

  // 30% chance to pause (simulating reading)
  if (Math.random() < 0.3) {
    await sleep(humanDelay(2000, 6000));
  }

  // 10% chance to scroll back slightly
  if (Math.random() < 0.1) {
    await page.mouse.wheel(0, -humanDelay(100, 300));
    await sleep(humanDelay(500, 1500));
  }
}

/**
 * Move mouse through intermediate points before clicking
 * Simulates natural mouse movement with jitter
 */
async function humanClick(page, locator) {
  const box = await locator.boundingBox();
  if (!box) return false;

  // Target a slightly random point within the element
  const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
  const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

  // Move through 2-4 intermediate points
  const steps = 2 + Math.floor(Math.random() * 3);
  const currentMouse = { x: box.x - 100, y: box.y - 50 };

  for (let i = 1; i <= steps; i++) {
    const ratio = i / (steps + 1);
    const jitterX = (Math.random() - 0.5) * 20;
    const jitterY = (Math.random() - 0.5) * 20;
    await page.mouse.move(
      currentMouse.x + (targetX - currentMouse.x) * ratio + jitterX,
      currentMouse.y + (targetY - currentMouse.y) * ratio + jitterY
    );
    await sleep(humanDelay(20, 80));
  }

  // Final move to target
  await page.mouse.move(targetX, targetY);
  await sleep(humanDelay(50, 200));
  await page.mouse.click(targetX, targetY);

  return true;
}

/**
 * Decide whether to skip a matched post
 * Only skips when we have enough surplus posts
 */
function shouldSkip(remainingPool, remainingQuota) {
  if (remainingPool <= remainingQuota * 1.2) return false;
  return Math.random() < 0.07; // ~7% skip rate
}

module.exports = {
  gaussianRandom,
  humanDelay,
  readingTime,
  sleep,
  humanScroll,
  humanClick,
  shouldSkip,
};
