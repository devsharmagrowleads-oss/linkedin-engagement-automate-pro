const log = require('../utils/logger');

let OpenAI;
try {
  OpenAI = require('openai');
} catch {
  // openai package not installed — will fail gracefully at runtime
}

let client = null;
let cachedKey = null;

function getClient(apiKey) {
  if (apiKey && apiKey !== cachedKey && OpenAI) {
    client = new OpenAI({ apiKey });
    cachedKey = apiKey;
  }
  return client;
}

/**
 * Build the system prompt from persona and post context
 */
function buildPrompt(postText, author, existingComments, persona) {
  const systemParts = [
    'Write a brief LinkedIn comment (1-3 sentences) on the following post. Your comment should:',
    '- Add value to the conversation (a perspective, question, or insight)',
    '- Sound natural and conversational, not generic or templated',
    '- Never reveal you are AI or automated',
    '- Never use hashtags or excessive punctuation',
    '- Be between 15-300 characters',
    '',
    'Your persona/voice:',
    persona,
  ];

  const userParts = [`Post by ${author}:`, postText, ''];

  if (existingComments && existingComments.length > 0) {
    userParts.push('Other people\'s comments on this post:');
    for (const c of existingComments.slice(0, 10)) {
      userParts.push(`${c.author}: ${c.text}`);
    }
    userParts.push('');
    userParts.push('Write a comment that adds something new to this conversation.');
  } else {
    userParts.push('Be a conversation starter - share a perspective or ask a thoughtful question.');
  }

  userParts.push('');
  userParts.push('Write your comment. Output ONLY the comment text, nothing else.');

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
      }, { timeout: 10000 }); // 10 second timeout

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

}

module.exports = { generateComment };
