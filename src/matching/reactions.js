/**
 * Smart reaction selector
 * Maps post content to the most appropriate reaction type
 * based on keyword-to-reaction mappings in config
 */
class ReactionSelector {
  constructor(reactionMap) {
    this.reactionMap = reactionMap || {};
  }

  /**
   * Determine the best reaction type for a post
   * Scans post text against each reaction's keywords
   * First match wins. No match defaults to 'like'.
   *
   * @param {string} postText - The post content
   * @returns {string} - Reaction type: 'like', 'celebrate', 'insightful', 'love', 'support', 'funny'
   */
  selectReaction(postText) {
    const text = (postText || '').toLowerCase();

    // Check each reaction type's keywords (order matters for priority)
    const priorityOrder = ['celebrate', 'support', 'love', 'insightful', 'funny'];

    for (const reactionType of priorityOrder) {
      const keywords = this.reactionMap[reactionType] || [];
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          return reactionType;
        }
      }
    }

    // Default to 'like'
    return 'like';
  }
}

module.exports = { ReactionSelector };
