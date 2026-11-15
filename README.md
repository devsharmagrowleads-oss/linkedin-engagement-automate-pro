# LinkedIn Auto Engage Pro

Automated LinkedIn engagement system that reacts to posts and leaves AI-generated comments with human-like behavior. Runs 3 sessions daily, hits configurable daily targets (45-55 reactions, 3-8 comments), and includes a web dashboard for monitoring and configuration.

Works on **Windows**, **macOS**, and **Linux**.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Quick Start](#quick-start)
- [Detailed Setup Guide](#detailed-setup-guide)
- [Configuration](#configuration)
- [Dashboard](#dashboard)
- [Keyword Matching](#keyword-matching)
- [Scheduling](#scheduling)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [Platform Compatibility](#platform-compatibility)
- [Admin Server](#admin-server)

---

## How It Works

1. **Login once** to LinkedIn via a real browser — session cookies are saved locally
2. **3 scheduled sessions** run daily (morning, afternoon, evening) with random jitter
3. Each session opens the browser in stealth mode, scrolls the feed, and reacts to posts
4. **Keyword matching** determines which posts to react to (or react to all)
5. **Smart reaction selection** picks the right reaction type (celebrate, insightful, love, etc.) based on post content
6. **AI-powered commenting** — optionally generates and posts short, human-sounding comments on engaged posts using OpenAI (gpt-4o-mini or gpt-4o)
7. **Human-like behavior** — gaussian-distributed delays, variable scroll speed, simulated reading time, mouse movement with jitter

---

## Features

- **Stealth browsing** — Playwright with puppeteer-extra-plugin-stealth to avoid detection
- **3-tier keyword matching** — exact match, fuzzy match (Fuse.js), and secondary keywords
- **React to All mode** — skip keyword filtering and react to every post
- **Smart reactions** — maps post content to celebrate/insightful/love/support/funny based on configurable keywords
- **AI commenting** — generates short, context-aware comments via OpenAI with safety validation, banned-phrase filtering, and repetition detection
- **Comment safety** — length bounds, banned corporate/AI phrases, em-dash rejection, emoji limits, Jaccard similarity deduplication
- **Web dashboard** — real-time stats, live session logs (SSE), reaction/comment history, keyword editor, persona editor, settings
- **Session management** — daily targets for both reactions and comments, per-session quotas, lockfile-based concurrency guard
- **Persistent sessions** — login once, browser profile saved to disk, no daily re-authentication
- **Auto-scheduling** — Windows Task Scheduler or cron, with random jitter to avoid patterns
- **Error recovery** — screenshots on failure, graceful shutdown on SIGINT/SIGTERM

---

## Quick Start

```bash
# 1. One-command setup (installs dependencies, Playwright browser, creates .env)
npm run setup

# 2. Edit .env with your TIMEZONE (and OPENAI_API_KEY if you want AI commenting)
# (or configure via the dashboard Settings page)

# 3. Login to LinkedIn (one-time)
npm run login

# 4. Start the dashboard
npm run dashboard
# Open http://localhost:3000

# 5. Use the dashboard to start/stop sessions and configure settings
```

---

## Detailed Setup Guide

### Prerequisites

| Requirement | Minimum Version | Check Command |
|---|---|---|
| Node.js | 20.x | `node -v` |
| npm | 8.x | `npm -v` |

Download Node.js from https://nodejs.org (LTS recommended). Node.js 18 and 19 are not supported: the `better-sqlite3` dependency supports Node.js 20, 22, 23, 24 and 25 only. An `.nvmrc` is included, so `nvm use` selects Node.js 20.

### Step 1: Clone or Copy the Project

```bash
git clone https://github.com/devsharmagrowleads-oss/linkedin-engagement-automate-pro.git
cd linkedin-engagement-automate-pro
```

Or copy the project folder. **Do NOT copy** these machine-specific folders:
- `node_modules/` — will be reinstalled
- `browser-profile/` — LinkedIn session cookies (must login fresh)
- `data/` — database and logs (starts fresh)

### Step 2: Install Dependencies

```bash
npm install
npx playwright install chromium
```

`npm install` pulls all Node.js packages. The Playwright command downloads a Chromium browser binary (~150 MB) used for automation.

### Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# When sessions auto-run (24h format, HH:MM-HH:MM)
MORNING_WINDOW=08:00-10:00
AFTERNOON_WINDOW=12:00-14:00
EVENING_WINDOW=17:00-19:00

# How many reactions per day (random value in this range)
DAILY_TARGET_MIN=45
DAILY_TARGET_MAX=55

# Random delay before starting a session (avoids patterns)
MAX_JITTER_MINUTES=10

# How long each session runs
MAX_SESSION_MINUTES=20

# Your timezone
TIMEZONE=Asia/Kolkata

# Browser window size
VIEWPORT_WIDTH=1366
VIEWPORT_HEIGHT=768
```

### Step 4: Login to LinkedIn

```bash
npm run login
```

A Chromium browser window opens. Log in to LinkedIn manually:
1. Enter your email and password
2. Complete OTP verification (the person with access to the OTP device needs to be available)
3. Once the feed loads, the browser closes automatically

Your session is saved in `browser-profile/` and persists across runs. **You only need to do this once** — or again if LinkedIn invalidates the session (rare, typically weeks to months).

### Step 5: Start the Dashboard

```bash
npm run dashboard
```

Or on **Windows**, double-click `start.bat`. On **macOS/Linux**, run `./start.sh`.

Open http://localhost:3000 in your browser.

### Step 6: Set Up Automatic Scheduling

See the [Scheduling](#scheduling) section below.

---

## Configuration

### Environment Variables (.env)

| Variable | Default | Description |
|---|---|---|
| `MORNING_WINDOW` | `08:00-10:00` | Morning session window (24h format) |
| `AFTERNOON_WINDOW` | `12:00-14:00` | Afternoon session window |
| `EVENING_WINDOW` | `17:00-19:00` | Evening session window |
| `DAILY_TARGET_MIN` | `45` | Minimum daily reactions |
| `DAILY_TARGET_MAX` | `55` | Maximum daily reactions |
| `MAX_JITTER_MINUTES` | `10` | Random delay before session start |
| `MAX_SESSION_MINUTES` | `20` | Maximum session duration |
| `TIMEZONE` | `Asia/Kolkata` | Timezone for session windows |
| `VIEWPORT_WIDTH` | `1366` | Browser viewport width |
| `VIEWPORT_HEIGHT` | `768` | Browser viewport height |
| `ENABLE_COMMENTS` | `false` | Enable AI commenting (opt-in) |
| `COMMENT_DRY_RUN` | `false` | Generate comments without posting (test mode) |
| `OPENAI_API_KEY` | _(none)_ | Required if commenting is enabled |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model for comment generation |
| `DAILY_COMMENT_MIN` | `3` | Minimum daily comments |
| `DAILY_COMMENT_MAX` | `8` | Maximum daily comments |
| `COMMENT_MIN_GAP` | `3` | Minimum posts between comments |
| `COMMENT_MAX_GAP` | `8` | Maximum posts between comments |

All settings can also be changed from the dashboard Settings page.

### Keywords Config (config/keywords.json)

```json
{
  "reactToAll": false,
  "primary": ["lead generation", "B2B sales", "cold outreach"],
  "secondary": ["business development", "startup growth", "SaaS"],
  "reactionMap": {
    "celebrate": ["new role", "promotion", "excited to announce"],
    "insightful": ["trend", "research", "data shows", "strategy"],
    "love": ["grateful", "thankful", "journey", "personal story"],
    "support": ["tough", "challenge", "layoff", "mental health"],
    "funny": []
  },
  "fuzzyThreshold": 0.3
}
```

- **`reactToAll: true`** — Ignores keyword filtering, reacts to every post in the feed
- **`primary`** — High-priority keywords (exact match first, then fuzzy)
- **`secondary`** — Fallback keywords when primary doesn't match
- **`reactionMap`** — Maps post content to specific reaction types
- **`fuzzyThreshold`** — How loose fuzzy matching is (0 = exact, 1 = very loose)

Keywords can be edited from the dashboard Keywords page.

### Commenting Config (config/commenting.json)

```json
{
  "persona": "friendly professional who shares practical insights",
  "bannedPhrases": ["leverage", "paradigm", "as an AI", "game-changer", ...],
  "minEngagementReactions": 5,
  "minEngagementComments": 2,
  "minLength": 15,
  "maxLength": 200
}
```

- **`persona`** — Describes the tone and voice for AI-generated comments
- **`bannedPhrases`** — 30+ corporate/AI-sounding phrases that trigger comment rejection
- **`minEngagementReactions`** / **`minEngagementComments`** — Post must have at least this many reactions OR comments to be eligible for commenting
- **`minLength`** / **`maxLength`** — Comment length bounds (validated before posting)

The persona and banned phrases can be edited from the dashboard Comments page.

---

## Dashboard

The web dashboard at http://localhost:3000 provides:

### Dashboard Page
- **Status badge** — shows idle, running, login required, or logging in
- **Start/Stop buttons** — manually trigger or stop sessions
- **Live session log** — real-time output streamed via Server-Sent Events (SSE)
- **Stats cards** — today's reactions, sessions, 7-day total, today's comments (if enabled)
- **Charts** — weekly activity bar chart and reaction type breakdown
- **Recent activity** — last 10 reactions with author, type, match level, keyword

### Reactions Page
- Full paginated history of all reactions with content snippets

### Comments Page
- Table of all comment attempts: time, author, generated comment, status, skip reason
- Status values: `posted`, `skipped`, `failed`, `dry_run`
- AI persona editor — textarea to shape the commenting voice
- Banned phrases tag editor — add/remove phrases that trigger rejection
- Engagement threshold and comment length settings

### Sessions Page
- Session history showing date, window, duration, posts scrolled/matched/reacted/commented/skipped, status

### Keywords Page
- Tag-based editor for primary and secondary keywords
- React to All toggle
- Reaction keyword map textareas
- Fuzzy threshold slider

### Settings Page
- Session windows, daily targets, jitter, session duration, timezone
- Comment settings: enable/disable, dry run, daily targets, gap between comments
- All changes saved to `.env` and take effect on next session

---

## Keyword Matching

The system uses a 3-tier matching approach:

| Tier | Method | Example |
|---|---|---|
| **Strict** | Exact case-insensitive substring match | "lead generation" in post text |
| **Partial** | Fuzzy match via Fuse.js on primary keywords | "lead gen strategies" matches "lead generation" |
| **Secondary** | Exact + fuzzy match on secondary keyword list | "SaaS growth" matches secondary keyword "SaaS" |

If `reactToAll` is enabled, all tiers are skipped and every post is matched.

### Smart Reaction Selection

After a post is matched, the reaction type is determined by scanning the post text against the `reactionMap`:

- Post mentions "new role" or "promotion" -> **Celebrate**
- Post mentions "research" or "data shows" -> **Insightful**
- Post mentions "grateful" or "journey" -> **Love**
- Post mentions "layoff" or "struggle" -> **Support**
- No keyword match -> **Like** (default)

---

## Scheduling

The system is designed to run 3 sessions per day. Each session handles its share of the daily target (e.g., 48 target / 3 sessions = 16 per session minimum).

### Windows (Task Scheduler)

Run as Administrator:
```
scripts\setup-scheduler.bat
```

Creates 3 daily tasks at 09:00, 13:00, and 18:00. To remove:
```
scripts\remove-scheduler.bat
```

### macOS / Linux (cron)

```bash
chmod +x scripts/setup-cron.sh scripts/remove-cron.sh
./scripts/setup-cron.sh
```

To remove:
```bash
./scripts/remove-cron.sh
```

Or manually with `crontab -e`:
```cron
0 9 * * * cd /path/to/growleads && node src/index.js >> data/cron.log 2>&1
0 13 * * * cd /path/to/growleads && node src/index.js >> data/cron.log 2>&1
0 18 * * * cd /path/to/growleads && node src/index.js >> data/cron.log 2>&1
```

### How Jitter Works

Each session waits a random delay (0 to `MAX_JITTER_MINUTES`) before starting. This prevents predictable patterns. A session triggered at 09:00 with 10-minute jitter will actually start between 09:00 and 09:10.

---

## Architecture

### Project Structure

```
growleads/
  .env                          # Environment config (not in git)
  .env.example                  # Template for .env
  config/
    keywords.json               # Keywords and reaction mappings
    commenting.json             # AI commenting persona, banned phrases, thresholds
  src/
    index.js                    # Main session runner
    login.js                    # LinkedIn login helper
    config.js                   # Configuration loader
    ai/
      comment-generator.js      # OpenAI-powered comment generation
      comment-safety.js         # Comment validation (banned phrases, length, repetition)
    behavior/
      human.js                  # Human-like behavior (delays, scrolling, clicking)
    browser/
      launch.js                 # Playwright browser launcher with stealth
      session.js                # LinkedIn session validator
    database/
      db.js                     # SQLite database (better-sqlite3)
    feed/
      extractor.js              # Post extraction from DOM
      comment-extractor.js      # Existing comment extraction for AI context
      comment-orchestrator.js   # Comment pipeline: extract → generate → validate → post
      commenter.js              # Browser-level comment typing and submission
      reactor.js                # Reaction clicking logic
      scroller.js               # Feed scrolling with post discovery
      selectors.js              # LinkedIn DOM selectors (centralized)
    matching/
      keywords.js               # 3-tier keyword matching (Fuse.js)
      reactions.js              # Smart reaction type selector
    server/
      api.js                    # REST API + SSE endpoints
      server.js                 # Express server
      public/                   # Dashboard frontend (HTML/CSS/JS)
    utils/
      logger.js                 # Timestamped console logger
  scripts/
    setup-scheduler.bat         # Windows Task Scheduler setup
    remove-scheduler.bat        # Windows Task Scheduler removal
    setup-cron.sh               # macOS/Linux cron setup
    remove-cron.sh              # macOS/Linux cron removal
  start.bat                     # Windows dashboard launcher
  start.sh                      # macOS/Linux dashboard launcher
  browser-profile/              # Chromium profile with LinkedIn session (not in git)
  data/
    growleads.db                # SQLite database (not in git)
```

### Tech Stack

| Component | Technology |
|---|---|
| Browser automation | Playwright + playwright-extra + stealth plugin |
| AI comments | OpenAI API (gpt-4o-mini / gpt-4o) |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Web server | Express 5 |
| Fuzzy matching | Fuse.js |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Real-time updates | Server-Sent Events (SSE) |

### Session Lifecycle

1. **Lockfile check** — prevents concurrent sessions
2. **Jitter delay** — random wait (0 to `MAX_JITTER_MINUTES`)
3. **Daily target check** — skip if reaction and comment targets already met
4. **Session target calculation** — `ceil(remaining / remaining_windows)` for both reactions and comments
5. **Browser launch** — stealth Chromium with persistent profile
6. **Session validation** — navigate to feed, check for login redirects
7. **Selector validation** — verify DOM selectors still work
8. **Feed scrolling** — extract posts, filter seen URNs, detect stuck scrolls
9. **Post processing** — keyword match, reaction selection, human-like clicking
10. **Comment evaluation** — if enabled, check gap/engagement/target criteria, then generate → validate → post
11. **Summary** — log stats (reactions + comments), update database, release lockfile

---

## Troubleshooting

### "Session expired" error
Run `npm run login` again. The person with access to the LinkedIn account's OTP will need to approve once. Sessions typically last weeks to months.

### No reactions happening (0 posts found)
LinkedIn periodically changes their DOM structure. The dashboard will show a selector validation error if this happens. Check the `src/feed/selectors.js` file — the selectors may need updating to match LinkedIn's current DOM.

### Dashboard not loading
Make sure port 3000 is available:
- **macOS/Linux:** `lsof -i :3000`
- **Windows:** `netstat -ano | findstr :3000`

Kill the conflicting process or change the port with `PORT=3001 npm run dashboard`.

### "Another session is running" error
A previous session didn't exit cleanly. Delete the lockfile:
```bash
# Windows
del data\session.lock

# macOS/Linux
rm data/session.lock
```

### Comments not posting
- Verify `ENABLE_COMMENTS=true` in `.env` and that `OPENAI_API_KEY` is set
- Check the Comments page in the dashboard — the status/reason columns show why comments were skipped (e.g., `banned_phrase`, `too_short`, `API_ERROR`)
- If all comments show `dry_run`, set `COMMENT_DRY_RUN=false`
- If you see repeated API errors, check your OpenAI API key and billing

### Reaction picker not opening (falls back to Like)
LinkedIn's hover-triggered reaction picker sometimes needs more time. The system retries once and falls back to Like if the picker doesn't appear. This is normal and doesn't affect engagement metrics.

### `better-sqlite3` installation fails
This native module requires a C++ compiler:
- **Windows:** Install Visual Studio Build Tools (`npm install --global windows-build-tools`)
- **macOS:** Install Xcode Command Line Tools (`xcode-select --install`)
- **Linux:** Install build-essential (`sudo apt install build-essential python3`)

---

## Platform Compatibility

| Feature | Windows | macOS | Linux |
|---|---|---|---|
| Core automation | Yes | Yes | Yes |
| Web dashboard | Yes | Yes | Yes |
| Auto-scheduling | Task Scheduler | cron | cron |
| Browser engine | Chromium | Chromium | Chromium |
| SQLite | Yes | Yes | Yes |
| One-click launcher | `start.bat` | `start.sh` | `start.sh` |

All dependencies are cross-platform. The core system has zero platform-specific code.

---

## NPM Scripts

| Command | Description |
|---|---|
| `npm start` | Run a single session (manual trigger) |
| `npm run dashboard` | Start the web dashboard on port 3000 |
| `npm run login` | Open browser for LinkedIn login |

---

## Admin Server

The `admin/` folder is a separate, optional project: a small Express + SQLite server that collects usage reports from each installation and shows them on a team dashboard. It has its own `package.json` and is not installed by the root `npm install`. It needs Node.js 20 or newer, same as the main project.

### Run it locally

```bash
cd admin
npm install
cp .env.example .env
npm start
```

Open http://localhost:4000. Settings in `admin/.env`:

| Variable | Default | Description |
|---|---|---|
| `ADMIN_PORT` | `4000` | Port the server listens on |
| `ADMIN_API_KEY` | _(none)_ | Bearer token required by the API. If left unset, the API is open to anyone who can reach it |
| `INACTIVE_HOURS` | `48` | Hours without a report before a user is shown as inactive |
| `DOMAIN` | _(none)_ | Public hostname, used only by the Docker/Caddy setup below |

### Run it with Docker

`admin/docker-compose.yml` builds the server from `admin/Dockerfile` and puts Caddy in front of it for HTTPS on ports 80 and 443. Set `DOMAIN` in `admin/.env` to a hostname that points at the machine, then:

```bash
cd admin
cp .env.example .env
docker compose up -d --build
```

`admin/deploy.sh` does the same on a fresh Ubuntu server: it installs Docker, opens ports 80 and 443, asks for the domain and API key, writes `.env` and starts the containers. `admin/render.yaml` is a Render blueprint for the same server.

### Connect an installation to it

In the main project `.env`, set `ADMIN_API_URL` to the admin server address and `ADMIN_API_KEY` to the same key the server uses. Leave `ADMIN_API_URL` empty to disable reporting.

---

## Security Notes

- LinkedIn session cookies are stored locally in `browser-profile/` — never committed to git
- The dashboard binds to `127.0.0.1` only (not accessible from other devices on the network)
- No credentials are stored in config files — authentication is handled via browser cookies
- The `.env` file is gitignored — no secrets in the repository
- OpenAI API key is stored only in `.env` (gitignored) and sent only to OpenAI's API endpoint
