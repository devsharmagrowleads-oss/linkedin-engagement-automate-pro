---
title: "feat: LinkedIn Auto-React System"
type: feat
status: active
date: 2026-03-19
origin: docs/brainstorms/2026-03-19-linkedin-auto-react-requirements.md
---

# feat: LinkedIn Auto-React System

## Overview

Build a Playwright-based automation system that scrolls the LinkedIn feed, identifies posts matching user-defined keywords, selects the most contextually appropriate reaction type (Like, Celebrate, Insightful, Love, Support, Funny), and reacts to ~50 posts/day across 2-3 human-like sessions — all running on a local Windows PC with a single LinkedIn account.

## Problem Statement / Motivation

Manually reacting to ~50 LinkedIn posts daily is time-consuming and repetitive. The user needs hands-off engagement that looks indistinguishable from real human behavior, targeting posts relevant to their brand/industry via keywords. (see origin: docs/brainstorms/2026-03-19-linkedin-auto-react-requirements.md)

## Proposed Solution

A Node.js application with these layers:

1. **Browser Layer** — `playwright-extra` + stealth plugin with persistent browser context for session management
2. **Feed Layer** — Scroll the LinkedIn feed, extract post content, filter promoted content
3. **Matching Layer** — 3-tier keyword matching (exact → partial → secondary keywords) using Fuse.js
4. **Reaction Layer** — Keyword-to-reaction-type mapping with human-like click execution
5. **Behavior Layer** — Gaussian-distributed delays, natural scroll, reading simulation, session variance
6. **Data Layer** — SQLite via better-sqlite3 for logging and duplicate prevention
7. **Scheduler Layer** — Windows Task Scheduler launching sessions at randomized times within configured windows

## Technical Considerations

### Architecture

Single-process, single-account. Each session is an independent Node.js process launched by Windows Task Scheduler. Sessions share state via SQLite database (daily quota tracking, duplicate prevention).

```
Windows Task Scheduler
  ├── Morning task (8-10am window)  → node run-session.js
  ├── Afternoon task (12-2pm window) → node run-session.js
  └── Evening task (5-7pm window)   → node run-session.js

Each run-session.js:
  1. Random jitter (0-30 min delay)
  2. Check daily quota from SQLite
  3. Launch Playwright persistent context
  4. Validate LinkedIn session
  5. Scroll feed → extract posts → match keywords → react
  6. Log to SQLite → print summary → exit
```

### Key Technical Decisions

- **`playwright-extra` + stealth plugin** — Essential for anti-detection. Patches `navigator.webdriver`, Chrome runtime, WebGL fingerprinting. Use headed mode (`headless: false`) since LinkedIn detection is tuned for headless. (see origin: requirements R5, ideation doc)
- **`launchPersistentContext`** over `storageState` — Persists full browser profile (cookies, cache, IndexedDB, service workers) which looks like a real returning user. `storageState` only saves cookies/localStorage and looks like a fresh browser.
- **Windows Task Scheduler** over `node-cron` — Survives crashes and reboots. No long-running process needed. Each session is a clean process.
- **Fuse.js** for keyword matching — Fuzzy matching with configurable threshold. Handles partial matches and typos. Lightweight, zero dependencies.
- **better-sqlite3** over node-sqlite3 — Synchronous API, much faster for simple read/write patterns, elegant transaction support.
- **No LLM in v1** — Keyword rules are sufficient for reaction selection. LLM adds cost/latency not justified yet. (see origin: requirements, Key Decisions)

### Anti-Detection Strategy

```javascript
// Essential stealth configuration
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const context = await chromium.launchPersistentContext('./browser-profile', {
  headless: false,
  args: ['--disable-blink-features=AutomationControlled'],
  viewport: { width: 1366, height: 768 },  // common resolution
  locale: 'en-US',
  timezoneId: 'Asia/Kolkata',  // match user's actual timezone
});
```

Keep viewport, user-agent, and timezone **consistent across all sessions** — randomizing per-session is a red flag for a single account.

## System-Wide Impact

### Interaction Graph

Session launch → SQLite quota check → Playwright browser launch → LinkedIn feed load → DOM post extraction → keyword matching → reaction click → SQLite log write → session summary → process exit.

No callbacks, middleware, or event handlers beyond Playwright's page events. Linear flow per session.

### Error Propagation

```
Network error during scroll → catch → log to SQLite → stop session gracefully → exit(0)
CAPTCHA detected → catch → log as WARNING → notify user → extend next session cooldown → exit(1)
DOM selector failure → catch → log as ERROR → flag for developer review → stop session → exit(1)
Session expired → detected on feed load → log → prompt user for re-login → exit(2)
```

Exit codes enable Task Scheduler to distinguish outcomes.

### State Lifecycle Risks

- **Partial session failure**: If the process crashes mid-session, the SQLite database already has records for posts reacted to (each reaction is logged immediately after execution). No orphaned state.
- **Concurrent access**: SQLite with WAL mode handles the rare case where two sessions overlap. But the design ensures only one session runs at a time (Task Scheduler sequential execution).

## Implementation Phases

### Phase 1: Foundation (Core Infrastructure)

**Goal:** Get a Playwright browser to open LinkedIn, validate session, and scroll the feed.

#### Tasks:

- [ ] **1.1 Project setup** — `npm init`, install dependencies, create directory structure
  - File: `package.json`
  - Dependencies: `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`, `better-sqlite3`, `fuse.js`, `dotenv`

- [ ] **1.2 Config system** — Environment variables and keyword config
  - File: `config/keywords.json` — keyword lists with reaction-type mappings
  - File: `.env.example` — session windows, daily target, paths
  - File: `src/config.js` — config loader with validation

- [ ] **1.3 Browser launcher with stealth** — Persistent context with anti-detection
  - File: `src/browser/launch.js`
  - Use `launchPersistentContext` with `./browser-profile` directory
  - Stealth plugin, consistent fingerprint, headed mode

- [ ] **1.4 Session validator** — Check if LinkedIn session is alive
  - File: `src/browser/session.js`
  - Navigate to feed, check for login redirect or auth wall
  - If expired: log, notify user, exit with code 2

- [ ] **1.5 Manual login flow** — First-time setup script
  - File: `src/login.js`
  - Launch visible browser, navigate to LinkedIn login, wait for user to complete login
  - Validate session, then close

- [ ] **1.6 SQLite database setup** — Schema and prepared statements
  - File: `src/database/db.js`
  - Tables: `sessions`, `reactions` (with `match_level` column)
  - Prepared statements for insert, duplicate check, daily count, daily summary

**Project structure after Phase 1:**
```
l/
├── package.json
├── .env.example
├── .env
├── .gitignore
├── browser-profile/          # Playwright persistent context (gitignored)
├── config/
│   └── keywords.json
├── data/
│   └── growleads.db          # SQLite (gitignored)
├── docs/                     # Already exists
├── src/
│   ├── index.js              # Main entry (Phase 2)
│   ├── login.js              # Manual login script
│   ├── config.js             # Config loader
│   ├── browser/
│   │   ├── launch.js         # Playwright stealth setup
│   │   └── session.js        # Session validation
│   ├── feed/
│   │   ├── scroller.js       # Feed scrolling (Phase 2)
│   │   └── extractor.js      # Post content extraction (Phase 2)
│   ├── matching/
│   │   ├── keywords.js       # Keyword matching (Phase 2)
│   │   └── reactions.js      # Reaction selection (Phase 2)
│   ├── behavior/
│   │   └── human.js          # Human-like delays (Phase 2)
│   ├── database/
│   │   └── db.js             # SQLite setup
│   └── utils/
│       └── logger.js         # Console logging
└── scripts/
    └── setup-scheduler.bat   # Task Scheduler setup (Phase 3)
```

### Phase 2: Core Automation (Feed → Match → React)

**Goal:** Scroll the feed, match posts, and react with human-like behavior.

#### Tasks:

- [ ] **2.1 Feed scroller** — Human-like feed scrolling with post extraction
  - File: `src/feed/scroller.js`
  - Scroll with variable speed (gaussian-distributed step sizes)
  - Pause randomly to simulate reading (1.5-8 seconds)
  - Occasional scroll-back (10% chance)
  - Time-bounded: max 10-25 minutes per session (randomized)

- [ ] **2.2 Post extractor** — Extract structured data from feed posts
  - File: `src/feed/extractor.js`
  - File: `src/feed/selectors.js` — centralized DOM selectors for easy maintenance
  - Extract: URN/data-urn (for dedup), author name, post text, post type
  - Skip: promoted/sponsored posts, video-only posts, polls, event announcements
  - Handle: text posts, image posts with text, articles, reshares (extract reshared text too)

- [ ] **2.3 Keyword matcher** — 3-tier matching with Fuse.js
  - File: `src/matching/keywords.js`
  - **Tier 1** (Strict): Exact case-insensitive phrase match via `String.includes()`
  - **Tier 2** (Partial): Fuse.js with `threshold: 0.3`, `ignoreLocation: true`
  - **Tier 3** (Secondary): Match against secondary keyword list from config
  - Each match records its tier for logging (`match_level` column)
  - Tier escalation: only use Tier 2 if Tier 1 hasn't filled the session quota; only use Tier 3 if Tier 2 hasn't filled it

- [ ] **2.4 Reaction selector** — Map post content to reaction type
  - File: `src/matching/reactions.js`
  - Config-driven keyword-to-reaction mapping:
    ```json
    {
      "celebrate": ["new role", "promotion", "excited to announce", "joined", "milestone"],
      "insightful": ["trend", "industry", "research", "data shows", "study"],
      "love": ["grateful", "thankful", "journey", "personal story", "family"],
      "support": ["tough", "challenge", "difficult", "struggle", "mental health"],
      "funny": ["😂", "joke", "humor", "lol"],
      "like": []  // default fallback
    }
    ```
  - Scan post text against each reaction's keywords. First match wins. No match → Like.

- [ ] **2.5 Human behavior engine** — Delays, mouse movement, click simulation
  - File: `src/behavior/human.js`
  - **Gaussian delay**: Box-Muller transform, configurable min/max
  - **Reading simulation**: Calculate dwell time based on word count (~225 wpm + variance)
  - **Mouse movement**: Move through 2-4 intermediate points with jitter before clicking
  - **Reaction click flow**: Hover over like button → wait for reaction picker → move to target reaction → click
  - **Occasional skip**: 5-10% of matched posts are skipped (only when remaining pool > remaining quota by 20%+)

- [ ] **2.6 Reaction executor** — The actual click-to-react logic
  - File: `src/feed/reactor.js`
  - For each matched post:
    1. Check duplicate (SQLite)
    2. Simulate reading time
    3. Scroll post into view
    4. Hover reaction button to open picker
    5. Select target reaction with human-like mouse movement
    6. Click
    7. Log to SQLite immediately
    8. Gaussian delay before next post

- [ ] **2.7 Session orchestrator** — Main entry point tying everything together
  - File: `src/index.js`
  - Flow: load config → check daily quota from DB → launch browser → validate session → scroll feed → extract/match/react → log summary → close browser → exit
  - Respect daily quota: `session_target = Math.ceil(remaining_quota / remaining_sessions_today)`
  - Daily variance: target 45-55 total (randomized per day, stored in DB)

### Phase 3: Scheduling & Operations

**Goal:** Automate the daily schedule and make the system production-ready.

#### Tasks:

- [ ] **3.1 Windows Task Scheduler setup script**
  - File: `scripts/setup-scheduler.bat`
  - Creates 3 scheduled tasks with configurable time windows
  - Each task runs: `node src/index.js`
  - Random jitter added at start of `src/index.js` (0-30 min delay)

- [ ] **3.2 Session window management**
  - File: `src/scheduler/windows.js`
  - Define windows in `.env`: `MORNING_WINDOW=08:00-10:00`, `AFTERNOON_WINDOW=12:00-14:00`, `EVENING_WINDOW=17:00-19:00`
  - Track which sessions have run today (in SQLite)
  - If window was missed (PC was off), redistribute quota to remaining windows

- [ ] **3.3 Error handling and recovery**
  - Update: `src/index.js`, `src/feed/scroller.js`, `src/feed/reactor.js`
  - Error classification:
    - **Network error** → retry once after 30s, then stop session, exit(0)
    - **DOM selector failure** → log as ERROR with screenshot, stop session, exit(1)
    - **CAPTCHA** → log as WARNING, notify user (console message), extend next session cooldown by 2 hours, exit(1)
    - **Session expired** → prompt re-login, exit(2)
  - Take screenshot on any error for debugging: `page.screenshot({ path: 'data/errors/...' })`

- [ ] **3.4 Daily summary and reporting**
  - Update: `src/index.js`
  - After each session, print to console:
    ```
    Session complete: 18 reactions (12 Like, 3 Insightful, 2 Celebrate, 1 Love)
    Daily total: 36/50 | Next session: ~1:30 PM
    Match breakdown: 10 strict, 5 partial, 3 secondary
    ```
  - After final session of day, print daily summary

- [ ] **3.5 Concurrent session guard**
  - Update: `src/index.js`
  - Before launching browser, print warning: "Automated session starting. Avoid LinkedIn in your browser for the next ~15 minutes."
  - Use a lockfile (`data/session.lock`) to prevent overlapping automated sessions

- [ ] **3.6 Database maintenance**
  - File: `src/database/maintenance.js`
  - On startup: prune duplicate-tracking entries older than 30 days
  - Reaction logs kept indefinitely (small data volume at ~50 rows/day)

## Acceptance Criteria

### Functional Requirements

- [ ] System scrolls LinkedIn feed and extracts post content (R1)
- [ ] Posts are matched against keyword config with 3-tier loosening (R2)
- [ ] Reaction type is selected based on content-to-reaction keyword mapping (R3)
- [ ] All actions use gaussian-distributed random delays (R4)
- [ ] Scrolling uses variable speed with occasional scroll-back (R4)
- [ ] Sessions are spread across morning/afternoon/evening windows (R4, R9)
- [ ] Daily reaction count varies between 45-55 (R4)
- [ ] 5-10% of matched posts are occasionally skipped (R4)
- [ ] Manual first-login saves persistent browser profile (R5)
- [ ] Expired sessions are detected and user is prompted to re-login (R5)
- [ ] Keywords are configured via JSON file with primary/secondary lists (R6)
- [ ] Reaction-type keyword mapping is configurable (R3, R6)
- [ ] Previously-reacted posts are skipped via URN tracking in SQLite (R7)
- [ ] Every reaction is logged: timestamp, author, content, reaction type, session, match level (R8)
- [ ] Sessions run at randomized times within configured windows (R9)
- [ ] Promoted/sponsored posts are skipped (SpecFlow finding)
- [ ] CAPTCHA, DOM errors, and network errors are handled distinctly (R10)

### Non-Functional Requirements

- [ ] Uses `playwright-extra` with stealth plugin in headed mode
- [ ] Consistent browser fingerprint across all sessions
- [ ] No account restriction after 30 days of operation
- [ ] Runs reliably on Windows 10 with Node.js 24.x
- [ ] Each session completes within 25 minutes max

### Quality Gates

- [ ] Manual testing: run 3 consecutive days without errors
- [ ] Verify stealth: pass bot detection at `bot.sannysoft.com`
- [ ] Verify reactions appear on LinkedIn (spot-check 5 posts)
- [ ] Verify duplicate prevention works across sessions

## Dependencies & Prerequisites

- Node.js 24.x (already installed)
- npm 11.x (already installed)
- Windows 10 with Task Scheduler
- LinkedIn account in good standing
- PC must be on during at least 2 of 3 scheduled windows daily

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LinkedIn DOM changes break selectors | High (quarterly) | Session fails until fixed | Centralized `selectors.js` file. Screenshot on error. Quick manual fix. |
| Account gets restricted | Medium | System unusable | Stealth plugin, human timing, daily variance, conservative volume (50/day is low) |
| Session cookies expire frequently | Low-Medium | Requires manual re-login | Persistent context preserves full profile. LinkedIn sessions typically last 1-2 weeks. |
| CAPTCHA blocks sessions | Low | Temporary halt | Detect, notify user, extend cooldown. CAPTCHAs are rare at 50/day volume. |
| PC is off during all windows | Medium | Missed day | Accept it. No catch-up. Resume next day. |
| Keyword matching produces poor results | Medium | Wrong posts get reactions | 3-tier system lets user tune. Logging tracks match quality. |

## Keyword Config Structure

```json
{
  "primary": [
    "lead generation",
    "B2B sales",
    "cold outreach",
    "sales automation",
    "growth strategy"
  ],
  "secondary": [
    "business development",
    "sales tips",
    "marketing automation",
    "startup growth",
    "SaaS"
  ],
  "reactionMap": {
    "celebrate": ["new role", "promotion", "excited to announce", "joined", "milestone", "anniversary", "congratulations"],
    "insightful": ["trend", "industry", "research", "data shows", "study", "report", "analysis", "framework"],
    "love": ["grateful", "thankful", "journey", "personal story", "family", "blessed", "appreciate"],
    "support": ["tough", "challenge", "difficult", "struggle", "mental health", "layoff", "let go"],
    "funny": ["😂", "🤣", "joke", "humor", "lol", "haha"]
  },
  "fuzzyThreshold": 0.3
}
```

## SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  window TEXT NOT NULL,         -- 'morning' | 'afternoon' | 'evening'
  started_at TEXT NOT NULL,
  ended_at TEXT,
  posts_scrolled INTEGER DEFAULT 0,
  posts_matched INTEGER DEFAULT 0,
  posts_reacted INTEGER DEFAULT 0,
  posts_skipped INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running', -- 'running' | 'completed' | 'error'
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  post_urn TEXT NOT NULL UNIQUE,
  author TEXT,
  content_snippet TEXT,
  reaction_type TEXT NOT NULL,   -- 'like' | 'celebrate' | 'insightful' | 'love' | 'support' | 'funny'
  match_level TEXT NOT NULL,     -- 'strict' | 'partial' | 'secondary'
  matched_keyword TEXT,
  reacted_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS daily_targets (
  date TEXT PRIMARY KEY,
  target INTEGER NOT NULL,       -- randomized 45-55 for this day
  achieved INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reactions_urn ON reactions(post_urn);
CREATE INDEX IF NOT EXISTS idx_reactions_date ON reactions(reacted_at);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
```

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-19-linkedin-auto-react-requirements.md](docs/brainstorms/2026-03-19-linkedin-auto-react-requirements.md) — Key decisions carried forward: feed scrolling over search, keyword matching over people filtering, manual first-login, 2-3 spread sessions, Node.js + Playwright, no LLM in v1.

### Internal References

- Team Playwright patterns: `C:\Users\Claude\Desktop\Growleads\heimtextil\scraper.js`
- Team project structure: `C:\Users\Claude\Desktop\Growleads\New folder\docs\plans\`

### External References

- [Playwright Authentication Docs](https://playwright.dev/docs/auth)
- [playwright-extra + Stealth Plugin](https://github.com/berstend/puppeteer-extra/tree/master/packages/playwright-extra)
- [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [Fuse.js Options](https://www.fusejs.io/api/options.html)
- [node-cron](https://www.npmjs.com/package/node-cron)
- [Playwright Persistent Context](https://www.browserstack.com/guide/playwright-persistent-context)

### SpecFlow Analysis Findings Incorporated

- Added promoted/sponsored post filtering (Phase 2.2)
- Added inter-session quota coordination (Phase 2.7)
- Added error classification with distinct recovery (Phase 3.3)
- Added concurrent session guard (Phase 3.5)
- Added database retention policy (Phase 3.6)
- Defined keyword loosening as 3-tier without LLM (Phase 2.3)
- Added reaction-type keyword mapping to config (Phase 2.4)
- Added `match_level` tracking to SQLite schema
