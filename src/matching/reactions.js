/**
 * Smart reaction selector
 * Maps post content to the most appropriate reaction type
 * based on keyword-to-reaction mappings in config
 */
class ReactionSelector {
  constructor(reactionMap) {
    // Pre-build a flat lookup array with pre-lowercased keywords (avoids repeated toLowerCase per post)
    const priorityOrder = ['celebrate', 'support', 'love', 'insightful', 'funny'];
    this._rules = [];
    for (const reactionType of priorityOrder) {
      const keywords = (reactionMap || {})[reactionType] || [];
      for (const keyword of keywords) {
        this._rules.push({ keyword: keyword.toLowerCase(), reactionType });
      }
    }
  }

  /**
   * Determine the best reaction type for a post
   * First match wins. No match defaults to 'like'.
   */
  selectReaction(postText) {
    const text = (postText || '').toLowerCase();

    for (const rule of this._rules) {
      if (text.includes(rule.keyword)) {
        return rule.reactionType;
      }
    }

    return 'like';
  }
}

module.exports = { ReactionSelector };
