const log = require('../utils/logger');

// Regex to match emoji (broad Unicode range)
const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{1FA70}-\u{1FAFF}]/gu;

/**
 * Calculate Jaccard similarity between two word sets
 */
function jaccardSimilarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Get the first N words of a string
 */
function firstNWords(text, n) {
  return text.split(/\s+/).slice(0, n).join(' ').toLowerCase();
}

/**
 * Check if a comment contains a banned phrase (whole-word, case-insensitive)
 */
function containsBannedPhrase(comment, bannedPhrases) {
  const lower = comment.toLowerCase();
  for (const phrase of bannedPhrases) {
    const lowerPhrase = phrase.toLowerCase();
    // Use word boundary matching to avoid substring false positives
    // e.g., "AI" should not match "said" or "aim"
    const escaped = lowerPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(lower)) {
      return phrase;
    }
  }
  return null;
}

/**
 * Validate a generated comment against safety rules
 *
 * @param {string} comment - The generated comment text
 * @param {string[]} recentComments - Last 5 comments posted in this session
 * @param {object} config - { minLength, maxLength, bannedPhrases }
 * @returns {{ valid: boolean, reason: string|null }}
 */
function validateComment(comment, recentComments, config) {
  if (!comment || typeof comment !== 'string') {
    return { valid: false, reason: 'empty_comment' };
  }

  const trimmed = comment.trim();

  // Length checks
  const minLen = config.minLength || 15;
  const maxLen = config.maxLength || 300;
  if (trimmed.length < minLen) {
    return { valid: false, reason: `too_short (${trimmed.length} < ${minLen})` };
  }
  if (trimmed.length > maxLen) {
    return { valid: false, reason: `too_long (${trimmed.length} > ${maxLen})` };
  }

  // Banned phrases
  const bannedPhrases = config.bannedPhrases || [];
  const found = containsBannedPhrase(trimmed, bannedPhrases);
  if (found) {
    return { valid: false, reason: `banned_phrase: "${found}"` };
  }

  // Excessive punctuation: no more than 1 consecutive ! or ?
  if (/[!]{2,}|[?]{2,}/.test(trimmed)) {
    return { valid: false, reason: 'excessive_punctuation' };
  }

  // Excessive emoji: no more than 2 total
  const emojiMatches = trimmed.match(EMOJI_RE);
  if (emojiMatches && emojiMatches.length > 2) {
    return { valid: false, reason: `excessive_emoji (${emojiMatches.length})` };
  }

  // Structural repetition check against recent comments
  if (recentComments && recentComments.length > 0) {
    const first5 = firstNWords(trimmed, 5);
    for (const prev of recentComments.slice(-5)) {
      // Check first-5-word prefix match
      if (first5 && first5 === firstNWords(prev, 5)) {
        return { valid: false, reason: 'structural_repetition (prefix match)' };
      }
      // Jaccard similarity > 0.6
      if (jaccardSimilarity(trimmed, prev) > 0.6) {
        return { valid: false, reason: 'structural_repetition (too similar)' };
      }
    }
  }

  return { valid: true, reason: null };
}

module.exports = { validateComment };
