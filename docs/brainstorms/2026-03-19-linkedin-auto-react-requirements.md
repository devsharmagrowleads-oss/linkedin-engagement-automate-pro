---
date: 2026-03-19
topic: linkedin-auto-react
---

# LinkedIn Auto-React System

## Problem Frame
Manually reacting to ~50 LinkedIn posts daily is time-consuming and repetitive. The user needs an automated system that scrolls the LinkedIn feed, identifies posts matching specific keywords relevant to their brand/industry, and reacts with the most contextually appropriate reaction type — all while behaving indistinguishably from a human user.

## Requirements

- R1. **Feed Scrolling & Post Extraction** — The system scrolls the LinkedIn feed using Playwright, extracts visible post content (text, author name, post type), and evaluates each post against a keyword list.

- R2. **Keyword Matching with Graduated Loosening** — Posts are matched against user-defined keywords. If strict matching yields fewer than the daily target, matching progressively loosens (partial matches, related terms, broader topic matching) to maintain volume.

- R3. **Smart Reaction Selection** — For each matched post, analyze the content and select the most appropriate reaction type:
  - Job promotion / new role → Celebrate
  - Industry insight / thought leadership → Insightful
  - Personal story / vulnerability → Love or Support
  - Achievement / milestone → Celebrate
  - Funny / lighthearted → Funny
  - General / unclear → Like

- R4. **Human-Like Behavior Engine** — All automation must mimic real human behavior:
  - Randomized delays between actions (gaussian distribution, 3–15 seconds)
  - Natural scroll speed with variation (fast/slow, occasional scroll-back)
  - 2–3 sessions per day spread across morning, afternoon, evening
  - Daily reaction count with variance (e.g., 45–55, not exactly 50)
  - Occasional skips — don't react to every matching post
  - Realistic session durations (10–25 minutes per session)

- R5. **Session Management** — User logs in manually once in a visible browser window. System saves the session/cookies and reuses them for subsequent automated runs. System detects expired sessions and prompts user to re-login.

- R6. **Keyword Configuration** — Simple JSON config file where the user defines:
  - Primary keywords (strict match)
  - Secondary keywords (used when loosening)
  - Keywords support single words and multi-word phrases

- R7. **Duplicate Prevention** — Track which posts have been reacted to (by post ID or URL) to avoid re-reacting on subsequent sessions/days.

- R8. **Reaction Logging** — Log every reaction to a local SQLite database:
  - Timestamp, post author, content snippet, reaction type, session ID
  - Daily summary printed to console after each session

- R9. **Scheduling** — System runs 2–3 sessions daily at randomized times within configured windows (e.g., morning: 8–10am, afternoon: 12–2pm, evening: 5–7pm). Runs on user's local Windows PC.

- R10. **Error Resilience** — If LinkedIn shows a CAPTCHA, unusual page structure, or network error: stop the current session gracefully, log the issue, and retry in the next scheduled window. Do not force through errors.

## Success Criteria
- System reacts to ~50 posts/day matching configured keywords without manual intervention
- Reactions are contextually appropriate (right reaction type for post content)
- No LinkedIn account restrictions after 30 days of operation
- System runs reliably on local Windows PC with minimal maintenance

## Scope Boundaries
- **Out of scope:** HeyReach integration, multi-account support, lead discovery/prospecting, commenting, connection requests, any outreach
- **Out of scope:** Cloud deployment, web dashboard, mobile app
- **Out of scope:** LLM-based content analysis in v1 (keyword rules only; LLM is a future upgrade path)
- **In scope only if simple:** Basic analytics (reactions per day, by type, by keyword)

## Key Decisions
- **Feed scrolling over search:** User's feed surfaces organically relevant content; search is more aggressive and less natural-looking
- **Keyword matching over people filtering:** React based on content relevance, not who posted
- **Manual first-login:** Avoids storing credentials, handles 2FA naturally, most secure approach
- **2–3 spread sessions:** More human-like than single long session or continuous trickle
- **Node.js + Playwright:** Native Playwright ecosystem, best documentation, team familiarity
- **Graduated keyword loosening:** Maintains daily volume without forcing exact matches
- **No LLM in v1:** Keyword rules are sufficient for reaction selection; LLM adds cost and latency that isn't justified yet

## Dependencies / Assumptions
- User has Node.js installed on their Windows PC
- User has a LinkedIn account in good standing
- LinkedIn's feed DOM structure remains reasonably stable (selectors may need periodic updates)
- User's PC is on during scheduled session windows

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Needs research] What are the current LinkedIn feed DOM selectors for post content, author, and reaction buttons?
- [Affects R4][Technical] Exact gaussian distribution parameters for delays and scroll speed
- [Affects R5][Technical] Best approach for Playwright session/cookie persistence on Windows
- [Affects R9][Technical] How to schedule 2-3 daily sessions on Windows (node-cron, Windows Task Scheduler, or built-in timer)
- [Affects R2][Technical] How to implement graduated keyword loosening (fuzzy matching library vs. custom logic)

## Next Steps
→ `/ce:plan` for structured implementation planning
