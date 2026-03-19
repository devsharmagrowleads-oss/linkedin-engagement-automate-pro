const Fuse = require('fuse.js');
const log = require('../utils/logger');

/**
 * 3-tier keyword matching system
 *
 * Tier 1 (Strict): Exact case-insensitive phrase match
 * Tier 2 (Partial): Fuzzy match with Fuse.js
 * Tier 3 (Secondary): Match against secondary keyword list
 */
class KeywordMatcher {
  constructor(keywordsConfig) {
    this.primary = keywordsConfig.primary || [];
    this.secondary = keywordsConfig.secondary || [];
    this.threshold = keywordsConfig.fuzzyThreshold || 0.3;

    // Build Fuse.js index for primary keywords (used in Tier 2)
    this.primaryFuse = new Fuse(
      this.primary.map(term => ({ term })),
      {
        keys: ['term'],
        threshold: this.threshold,
        ignoreLocation: true,
        includeScore: true,
        minMatchCharLength: 3,
      }
    );

    // Build Fuse.js index for secondary keywords (used in Tier 3)
    this.secondaryFuse = new Fuse(
      this.secondary.map(term => ({ term })),
      {
        keys: ['term'],
        threshold: this.threshold,
        ignoreLocation: true,
        includeScore: true,
        minMatchCharLength: 3,
      }
    );
  }

  /**
   * Match post text against keywords using the current tier
   * Returns { matched: boolean, keyword: string, level: string } or null
   */
  match(postText, tier = 'strict') {
    const text = (postText || '').toLowerCase();
    if (text.length < 20) return null;

    switch (tier) {
      case 'strict':
        return this._strictMatch(text);
      case 'partial':
        return this._partialMatch(text);
      case 'secondary':
        return this._secondaryMatch(text);
      default:
        return null;
    }
  }

  /**
   * Try all tiers in order, return first match
   */
  matchAllTiers(postText) {
    const strict = this.match(postText, 'strict');
    if (strict) return strict;

    const partial = this.match(postText, 'partial');
    if (partial) return partial;

    const secondary = this.match(postText, 'secondary');
    if (secondary) return secondary;

    return null;
  }

  // Tier 1: Exact case-insensitive substring match
  _strictMatch(text) {
    for (const keyword of this.primary) {
      if (text.includes(keyword.toLowerCase())) {
        return { matched: true, keyword, level: 'strict' };
      }
    }
    return null;
  }

  // Tier 2: Fuzzy match against primary keywords using Fuse.js
  _partialMatch(text) {
    // Break text into sentences for better matching
    const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 10);

    for (const sentence of sentences) {
      const results = this.primaryFuse.search(sentence.trim());
      for (const result of results) {
        if (result.score < this.threshold + 0.05) {
          return { matched: true, keyword: result.item.term, level: 'partial' };
        }
      }
    }
    return null;
  }

  // Tier 3: Match against secondary keyword list
  _secondaryMatch(text) {
    // First try exact match on secondary keywords
    for (const keyword of this.secondary) {
      if (text.includes(keyword.toLowerCase())) {
        return { matched: true, keyword, level: 'secondary' };
      }
    }

    // Then fuzzy match on secondary keywords
    const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 10);
    for (const sentence of sentences) {
      const results = this.secondaryFuse.search(sentence.trim());
      for (const result of results) {
        if (result.score < this.threshold + 0.05) {
          return { matched: true, keyword: result.item.term, level: 'secondary' };
        }
      }
    }
    return null;
  }
}

module.exports = { KeywordMatcher };
