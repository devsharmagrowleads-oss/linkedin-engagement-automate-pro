const log = require('../utils/logger');

let OpenAI;
try {
  OpenAI = require('openai');
} catch {
  // openai package not installed — will fail gracefully at runtime
}

let client = null;
let cachedKeyHash = null;

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function getClient(apiKey) {
  const hash = apiKey ? simpleHash(apiKey) : null;
  if (apiKey && hash !== cachedKeyHash && OpenAI) {
    client = new OpenAI({ apiKey });
    cachedKeyHash = hash;
  }
  return client;
}

/**
 * Sanitize text before injecting into prompts to mitigate prompt injection.
 * Strips control characters and truncates.
 */
function sanitizeForPrompt(text, maxLen = 1000) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .substring(0, maxLen)
    .trim();
}

/**
 * Build the system prompt from persona and post context
 */
function buildPrompt(postText, author, existingComments, persona) {
  const systemParts = [
    'Write a short LinkedIn comment (1-2 sentences max) on the following post.',
    '',
    'Rules:',
    '- Keep it under 150 characters if possible, never over 200',
    '- Write like a real person texting a colleague, not a corporate speaker',
    '- Use simple everyday words. No complex vocabulary.',
    '- NEVER use em-dashes (--) or en-dashes. Use commas or periods instead.',
    '- No hashtags, no emojis, no excessive punctuation',
    '- Do not start with "Great post", "Great insights", "Love this", or "Absolutely"',
    '- Do not use words like: leverage, foster, cultivate, delve, landscape, navigate, robust, holistic, nuance, transformative, paradigm, comprehensive, resonate, pivotal, harnessing, invaluable, commendable, remarkable, fascinating',
    '- If others already commented, do NOT repeat what they said. Say something different.',
    '- Never reveal you are AI or automated',
    '- Either share a quick honest opinion OR ask one simple question. Not both.',
    '',
    'Your voice:',
    persona,
  ];

  const safeAuthor = sanitizeForPrompt(author, 60);
  const safePostText = sanitizeForPrompt(postText, 1000);

  const userParts = [`Post by ${safeAuthor}:`, safePostText, ''];

  if (existingComments && existingComments.length > 0) {
    userParts.push('Comments already on this post (DO NOT repeat these):');
    for (const c of existingComments.slice(0, 10)) {
      userParts.push(`- ${sanitizeForPrompt(c.author, 60)}: ${sanitizeForPrompt(c.text, 300)}`);
    }
    userParts.push('');
    userParts.push('Add something new that nobody else said yet. Keep it short.');
  } else {
    userParts.push('No comments yet. Be the first. Keep it short and real.');
  }

  userParts.push('');
  userParts.push('Output ONLY the comment text, nothing else.');

  return {
    system: systemParts.join('\n'),
    user: userParts.join('\n'),
  };
}

/**
 * Generate a comment using OpenAI API
 *
 * @param {string} postText - The post content
 * @param {string} author - Post author name
 * @param {Array} existingComments - [{author, text}] of existing comments
 * @param {string} persona - The persona system prompt
 * @param {string} model - OpenAI model to use
 * @param {string} apiKey - OpenAI API key
 * @returns {{ comment, model, tokensUsed } | { error, code }}
 */
async function generateComment(postText, author, existingComments, persona, model, apiKey) {
  const openai = getClient(apiKey);
  if (!openai) {
    return { error: 'OpenAI client not initialized (missing API key or package)', code: 'NO_CLIENT' };
  }

  const prompt = buildPrompt(postText, author, existingComments, persona);
  const maxRetries = 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        max_tokens: 150,
        temperature: 0.9,
      }, { timeout: 15000 }); // 15 second timeout — not latency-sensitive

      const comment = (response.choices[0]?.message?.content || '').trim();
      const tokensUsed = response.usage?.total_tokens || 0;

      // Strip surrounding quotes if the model wrapped them
      const cleaned = comment.replace(/^["']|["']$/g, '').trim();

      return { comment: cleaned, model: model || 'gpt-4o-mini', tokensUsed };
    } catch (err) {
      const status = err.status || err.statusCode || 0;
      const errMsg = err.message || String(err);

      // Don't retry on auth or rate limit errors
      if (status === 401) {
        log.error('OpenAI API key is invalid (401)');
        return { error: 'Invalid API key', code: 'AUTH_ERROR' };
      }
      if (status === 429) {
        log.warn('OpenAI rate limit hit (429) — skipping comment');
        return { error: 'Rate limited', code: 'RATE_LIMITED' };
      }

      // Retry on server errors (500/503)
      if (attempt < maxRetries && (status === 500 || status === 503)) {
        log.warn(`OpenAI server error (${status}), retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      log.error(`OpenAI API error: ${errMsg}`);
      return { error: errMsg, code: 'API_ERROR' };
    }
  }

  return { error: 'Exhausted retries', code: 'RETRY_EXHAUSTED' };
}

module.exports = { generateComment };
