const { extractExistingComments } = require('./comment-extractor');
const { commentOnPost } = require('./commenter');
const { generateComment } = require('../ai/comment-generator');
const { validateComment } = require('../ai/comment-safety');
const { humanDelay, sleep } = require('../behavior/human');
const db = require('../database/db');
const log = require('../utils/logger');

/**
 * Attempt to generate and post a comment on a post.
 * Encapsulates the full comment pipeline: scrape context → generate → validate → post.
 *
 * @param {import('playwright').Page} page
 * @param {object} post - { urn, author, text, postUrl, reactionCount, commentCount }
 * @param {object} opts
 * @param {string} opts.sessionId
 * @param {object} opts.commentConfig - from commenting.json
 * @param {string[]} opts.recentSessionComments - sliding window for repetition check
 * @param {string} opts.openaiModel
 * @param {string} opts.openaiApiKey
 * @param {boolean} opts.dryRun
 * @param {string} opts.matchLevel - keyword match level
 * @param {string} opts.matchKeyword - matched keyword
 * @returns {{ commented: boolean, apiError: boolean }}
 */
async function tryCommentOnPost(page, post, opts) {
  const { sessionId, commentConfig, recentSessionComments, openaiModel, openaiApiKey, dryRun, matchLevel, matchKeyword, personality } = opts;

  try {
    // Locate post element for comment scraping
    const commentPostEl = page.locator(`div[componentkey="${post.urn}"]`).first();

    // Scrape existing comments for context
    const existingComments = await extractExistingComments(page, commentPostEl);

    // Generate comment via OpenAI
    const result = await generateComment(
      post.text, post.author, existingComments,
      commentConfig.persona, openaiModel, openaiApiKey
    );

    if (result.error) {
      log.warn(`Comment generation failed: ${result.error}`);
      db.logComment(sessionId, post, '', 'failed', result.error, matchLevel, matchKeyword, openaiModel);
      return { commented: false, apiError: true };
    }

    // Safety check
    const safety = validateComment(result.comment, recentSessionComments, commentConfig);
    if (!safety.valid) {
      log.info(`  Comment skipped (${safety.reason}): "${result.comment.substring(0, 50)}..."`);
      db.logComment(sessionId, post, result.comment, 'skipped', safety.reason, matchLevel, matchKeyword, result.model);
      return { commented: false, apiError: false };
    }

    // Post the comment (or dry run)
    const posted = await commentOnPost(page, post, result.comment, dryRun, personality);
    const status = posted.success ? (dryRun ? 'dry_run' : 'posted') : 'failed';
    db.logComment(sessionId, post, result.comment, status, posted.error || null, matchLevel, matchKeyword, result.model);

    if (posted.success) {
      return { commented: true, apiError: false, commentText: result.comment };
    }

    return { commented: false, apiError: false };
  } catch (err) {
    log.warn(`Comment error: ${err.message}`);
    return { commented: false, apiError: false };
  }
}

module.exports = { tryCommentOnPost };
