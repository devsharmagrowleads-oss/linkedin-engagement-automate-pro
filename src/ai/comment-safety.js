// Regex to match emoji (broad Unicode range)
const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{1FA70}-\u{1FAFF}]/gu;

// Similarity threshold for detecting repetitive comments
const JACCARD_THRESHOLD = 0.6;

/**
 * Pre-compile banned phrase regexes from a phrase list.
 * Call once at config load time, reuse across all validations.
 */
let _compiledBannedRegexes = null;
let _compiledFrom = null;

function getCompiledBannedRegexes(bannedPhrases) {
  // Cache: only recompile if the phrase list changed
  if (_compiledFrom === bannedPhrases) return _compiledBannedRegexes;
  _compiledFrom = bannedPhrases;
  _compiledBannedRegexes = (bannedPhrases || []).map(phrase => {
    const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { phrase, regex: new RegExp(`\\b${escaped}\\b`, 'i') };
  });
  return _compiledBannedRegexes;
}

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
 * Check if a comment contains a banned phrase using pre-compiled regexes
 */
function containsBannedPhrase(comment, bannedPhrases) {
  const compiled = getCompiledBannedRegexes(bannedPhrases);
  const lower = comment.toLowerCase();
  for (const { phrase, regex } of compiled) {
    if (regex.test(lower)) return phrase;
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
  const maxLen = config.maxLength || 200;
  if (trimmed.length < minLen) {
    return { valid: false, reason: `too_short (${trimmed.length} < ${minLen})` };
  }
  if (trimmed.length > maxLen) {
    return { valid: false, reason: `too_long (${trimmed.length} > ${maxLen})` };
  }

  // Banned phrases (uses pre-compiled regexes)
  const bannedPhrases = config.bannedPhrases || [];
  const found = containsBannedPhrase(trimmed, bannedPhrases);
  if (found) {
    return { valid: false, reason: `banned_phrase: "${found}"` };
  }

  // Excessive punctuation: no more than 1 consecutive ! or ?
  if (/[!]{2,}|[?]{2,}/.test(trimmed)) {
    return { valid: false, reason: 'excessive_punctuation' };
  }

  // Em-dashes and en-dashes look robotic
  if (/\u2014|\u2013|--/.test(trimmed)) {
    return { valid: false, reason: 'contains_em_dash' };
  }

  // Block URLs, links, email addresses (prevents prompt injection abuse)
  if (/https?:\/\/|www\.|\.com\/|\.io\/|\.net\/|@\w+\.\w+/i.test(trimmed)) {
    return { valid: false, reason: 'contains_url_or_email' };
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
      if (first5 && first5 === firstNWords(prev, 5)) {
        return { valid: false, reason: 'structural_repetition (prefix match)' };
      }
      if (jaccardSimilarity(trimmed, prev) > JACCARD_THRESHOLD) {
        return { valid: false, reason: 'structural_repetition (too similar)' };
      }
    }
  }

  return { valid: true, reason: null };
}

module.exports = { validateComment };
