// Centralized LinkedIn DOM selectors
// Update these when LinkedIn changes their DOM structure

module.exports = {
  // Feed post containers
  feedPost: 'div.feed-shared-update-v2[data-urn]',
  feedPostUrn: 'data-urn',

  // Post content
  postText: [
    '.feed-shared-update-v2__description',
    '.feed-shared-text',
    '.feed-shared-inline-show-more-text',
    '.update-components-text',
  ].join(', '),

  // Author
  authorName: [
    '.update-components-actor__name span[aria-hidden="true"]',
    '.update-components-actor__title span[aria-hidden="true"]',
  ].join(', '),

  // Promoted/sponsored indicators
  promotedIndicators: [
    '.update-components-actor__description a[href*="lnkd.in"]',
    '.feed-shared-actor__sub-description',
  ],
  promotedText: 'Promoted',

  // Reaction buttons
  likeButton: 'button.reactions-react-button',
  likeButtonAria: 'button[aria-label*="React"]',
  reactionPicker: '.reactions-menu',

  // Specific reactions (aria-labels used by LinkedIn)
  reactions: {
    like: 'React Like',
    celebrate: 'React Celebrate',
    support: 'React Support',
    love: 'React Love',
    insightful: 'React Insightful',
    funny: 'React Funny',
  },

  // Feed container
  feedContainer: '.scaffold-layout__main',

  // Already reacted indicator
  alreadyReacted: 'button.reactions-react-button--active',
};
