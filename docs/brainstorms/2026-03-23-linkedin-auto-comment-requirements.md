---
date: 2026-03-23
topic: linkedin-auto-comment
---

# LinkedIn Auto-Comment System

## Problem Frame
The user has a working LinkedIn auto-liker and wants to extend engagement to commenting. Liking is low-visibility; commenting puts your name, face, and words directly in front of the post author and their network. An auto-commenter that reads posts, understands existing conversation, and generates contextual comments via LLM would dramatically increase LinkedIn presence and lead generation potential — but carries higher detection risk and reputational stakes than liking.

## Requirements

- R1. **Comment Generation via OpenAI API** — For each selected post, send the post content, author info, and existing comments to OpenAI's API to generate a contextual, natural-sounding comment. The LLM prompt uses a user-defined custom persona (configurable in settings) to maintain a consistent voice across all comments.

- R2. **Existing Comment Scraping** — Before generating a comment, scrape visible comments on the post. Feed these to the LLM as context so the generated comment adds to the conversation rather than repeating what others already said.

- R3. **Keyword + Engagement Targeting** — Only comment on posts that match the existing keyword system AND have meaningful engagement (a minimum threshold of likes or comments). This ensures comments land on visible, relevant posts.

- R4. **Integrated Sessions** — Auto-commenting runs within the same feed-scrolling session as auto-liking. During a session, the system both likes and selectively comments on posts. A post may be liked, commented on, or both — mimicking natural user behavior.

- R5. **Daily Comment Volume: 5-10** — Target 5-10 comments per day, randomized with variance (same gaussian approach as liking). This is a plausible volume for an active professional.

- R6. **Safety Rules for Autonomous Posting** — Comments are posted automatically without manual review, but must pass safety checks before posting:
  - Minimum length (e.g., 15 characters) and maximum length (e.g., 300 characters)
  - No banned phrases (configurable list — e.g., "AI", "as an AI", "language model")
  - No excessive punctuation or emoji
  - No repetition of the same comment structure across posts in a session
  - Comments that fail safety checks are skipped and logged for review in the dashboard

- R7. **Comment Posting Interaction** — After generating and validating a comment, the system clicks the comment box on the post, types the comment with human-like keystroke delays, and submits. Includes realistic pauses (simulating thinking/typing time).

- R8. **Comment Logging** — Log every comment (posted and skipped) to the SQLite database:
  - Post URN, author, content snippet, generated comment text, status (posted/skipped/failed), skip reason, session ID, timestamp
  - Extend the dashboard to show comment history alongside reaction history

- R9. **Custom Persona Configuration** — A configurable persona definition (stored in config file or .env) that shapes the LLM's commenting style. Examples: industry expertise, communication style, typical vocabulary, perspective. The persona prompt is editable via the dashboard.

- R10. **Comment Cooldown & Spacing** — Never comment on back-to-back posts in the feed. Enforce a minimum gap (e.g., 3-8 posts scrolled) between comments. Add realistic delay between deciding to comment and actually typing (simulating reading and formulating a response).

## Success Criteria
- System generates contextual, natural-sounding comments that read as if written by the persona
- Comments are unique — no two comments in a session feel templated or repetitive
- No LinkedIn account restrictions after 30 days of operation
- 5-10 comments posted daily on keyword-relevant, engaged posts
- Comments that fail safety rules are caught and logged, never posted
- Integrates cleanly into existing auto-liker sessions without disrupting liking behavior

## Scope Boundaries
- **Out of scope:** Replying to comments on your own posts, threaded replies to other comments, commenting on articles (only feed posts)
- **Out of scope:** Image/video analysis for comment context (text content only)
- **Out of scope:** Multi-account commenting, commenting from multiple personas simultaneously
- **Out of scope:** Comment engagement tracking (tracking likes/replies your comments receive)
- **In scope:** Dashboard updates to show comment activity and persona editor

## Key Decisions
- **OpenAI API for generation:** Best balance of quality, cost, and ecosystem maturity. ~$0.002-0.01 per comment is negligible at 5-10/day volume.
- **Read existing comments as LLM context:** Produces comments that add to conversation rather than echoing others. Worth the extra scraping time.
- **Keyword + engagement filter:** Ensures comments land on relevant, visible posts — maximizing ROI on each comment.
- **Custom persona over adaptive tone:** User maintains consistent brand voice. Persona is configurable so it can evolve.
- **Autonomous with safety rules over review queue:** Keeps the system hands-off while preventing embarrassing outputs. Skipped comments are logged for audit.
- **Combined sessions with liker:** More natural behavior pattern. A real user likes AND comments in the same browsing session.
- **5-10 comments/day:** Conservative enough to avoid detection, high enough to build meaningful presence.

## Dependencies / Assumptions
- OpenAI API key with billing set up
- Existing auto-liker infrastructure (Playwright, sessions, keywords, database, dashboard) remains stable
- LinkedIn comment box DOM selectors can be reliably identified
- OpenAI API latency (~1-3s) is acceptable within the human-like delay budget

## Outstanding Questions

### Deferred to Planning
- [Affects R2][Needs research] What are the LinkedIn DOM selectors for the comment section, individual comments, comment input box, and submit button?
- [Affects R1][Technical] Which OpenAI model to use (gpt-4o-mini for cost, gpt-4o for quality)? Should be configurable.
- [Affects R7][Needs research] How does LinkedIn's comment box work — is it a contenteditable div, textarea, or rich text editor? Does it require special input simulation?
- [Affects R3][Technical] What engagement thresholds to use for the engagement filter (minimum likes/comments on a post)?
- [Affects R6][Technical] Exact safety rule parameters (min/max length, banned phrase list) — should be configurable.
- [Affects R9][Technical] Best prompt structure for persona-based comment generation with existing comment context.
- [Affects R10][Technical] Optimal spacing parameters between comments during a session.
- [Affects R8][Technical] Database schema extension — new `comments` table or extend `reactions` table?

## Next Steps
-> `/ce:plan` for structured implementation planning
