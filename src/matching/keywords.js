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

    // React to all posts when flag is set or when no keywords are configured
    this.reactToAll = keywordsConfig.reactToAll === true
      || (this.primary.length === 0 && this.secondary.length === 0);

    // Cap for reactToAll mode: only react to ~30% of posts max (prevents ban)
    this._reactToAllCounter = 0;

    // Pre-lowercase keywords once at construction (avoids repeated toLowerCase per post)
    this.primaryLower = this.primary.map(k => k.toLowerCase());
    this.secondaryLower = this.secondary.map(k => k.toLowerCase());

    const fuseOpts = {
      keys: ['term'],
      threshold: this.threshold,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 3,
    };

    // Build Fuse.js index for primary keywords (used in Tier 2)
    this.primaryFuse = new Fuse(this.primary.map(term => ({ term })), fuseOpts);

    // Build Fuse.js index for secondary keywords (used in Tier 3)
    this.secondaryFuse = new Fuse(this.secondary.map(term => ({ term })), fuseOpts);

    // Pre-compute score threshold once
    this._scoreThreshold = this.threshold + 0.05;
  }

  /**
   * Try all tiers in order, return first match
   */
  matchAllTiers(postText) {
    const text = (postText || '').toLowerCase();
    if (text.length < 20) return null;

    // If reactToAll is enabled, match ~30% of posts (cap to avoid detection)
    if (this.reactToAll) {
      this._reactToAllCounter++;
      // Only match roughly 30% of posts — skip the rest to look human
      if (this._reactToAllCounter % 3 !== 0 && Math.random() > 0.35) {
        return null;
      }
      return { matched: true, keyword: '*', level: 'all' };
    }

    // Tier 1: Exact case-insensitive substring match against primary keywords
    for (let i = 0; i < this.primaryLower.length; i++) {
      if (text.includes(this.primaryLower[i])) {
        return { matched: true, keyword: this.primary[i], level: 'strict' };
      }
    }

    // Tier 2: Fuzzy match against primary keywords using Fuse.js
    const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 10);
    for (const sentence of sentences) {
      const results = this.primaryFuse.search(sentence.trim());
      for (const result of results) {
        if (result.score < this._scoreThreshold) {
          return { matched: true, keyword: result.item.term, level: 'partial' };
        }
      }
    }

    // Tier 3: Exact match on secondary keywords
    for (let i = 0; i < this.secondaryLower.length; i++) {
      if (text.includes(this.secondaryLower[i])) {
        return { matched: true, keyword: this.secondary[i], level: 'secondary' };
      }
    }

    // Tier 3b: Fuzzy match on secondary keywords (reuse sentences from Tier 2)
    for (const sentence of sentences) {
      const results = this.secondaryFuse.search(sentence.trim());
      for (const result of results) {
        if (result.score < this._scoreThreshold) {
          return { matched: true, keyword: result.item.term, level: 'secondary' };
        }
      }
    }

    return null;
  }
}

module.exports = { KeywordMatcher };
