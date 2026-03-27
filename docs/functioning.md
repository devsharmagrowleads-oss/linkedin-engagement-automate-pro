# LinkedIn AutoLiker — How It Works

Complete reference for every decision the system makes from the moment you click **Start Session** to when the session ends.

---

## Layer 1: Should It Even Run Today?

| Check | What it does | Current setting |
|-------|-------------|-----------------|
| **Skip day** | 15% chance the entire day is marked as "no activity" — all sessions blocked | `SKIP_DAY_PERCENT=15` |
| **Captcha cooldown** | If a CAPTCHA was detected previously, blocks all sessions for 24 hours | Automatic |

Roughly **1 in 7 days**, the system decides "no activity today." This creates natural gaps in the weekly pattern.

> **Dashboard override**: When you click "Start Session" from the dashboard, skip-day is bypassed (`FORCE_NO_SKIP=1`) so the session always starts. Skip-day only blocks terminal-launched sessions (`node src/index.js`).

---

## Layer 2: Startup Jitter

| Mode | Jitter range | Purpose |
|------|-------------|---------|
| **Dashboard** (Start Session button) | **0 seconds** — no delay | Instant start, no waiting |
| **Terminal manual** (`node src/index.js`) | **0–5 minutes** | Prevents exact-second start patterns |
| **Daemon mode** (`--daemon`) | **0–30 minutes** | Full range for automated scheduling |

Jitter prevents all sessions from starting at the same clock second every day, which is a detectable pattern.

> **Override**: Set `FORCE_NO_JITTER=1` in terminal to skip jitter.

---

## Layer 3: What Kind of Session?

| Type | Chance | What it does |
|------|--------|-------------|
| **Normal session** | 85% | Scrolls feed, reacts to matching posts, optionally comments |
| **Browse-only** | 15% | Opens LinkedIn, scrolls, reads, visits pages — but **zero reactions, zero comments** |

Browse-only sessions make the account look like it sometimes just casually checks LinkedIn without engaging — this is very human behavior. The session still runs for the full duration (17–32 minutes) so it looks natural.

> **Setting**: `BROWSE_ONLY_PERCENT=15` (change in dashboard Settings page)

---

## Layer 4: Session Personality

Every session gets a **fresh random personality** that controls its entire behavior. No two sessions behave the same way.

### Tempo (overall speed)

| Tempo | Weight | Reaction delay multiplier | Scroll speed |
|-------|--------|--------------------------|-------------|
| **Fast** | 20% | 0.6x (faster) | Quick scrolls |
| **Normal** | 40% | 1.0x (baseline) | Normal scrolls |
| **Slow** | 25% | 1.5x (slower) | Leisurely scrolls |
| **Contemplative** | 15% | 2.2x (much slower) | Long pauses, deep reading |

### Session Type (engagement style)

| Type | Weight | Behavior |
|------|--------|----------|
| **Focused** | 30% | More "see more" clicks (15%), less diversion |
| **Casual** | 35% | More profile visits (10%), relaxed browsing |
| **Distracted** | 20% | Frequent navigation diversions (35%), shorter focus |
| **Power-user** | 15% | Fast and efficient, less wandering |

### Per-Session Parameters (all randomized)

| Parameter | What it controls | Typical range |
|-----------|-----------------|---------------|
| **Reaction delay** | Wait time between reactions | 60–180 sec base, scaled by tempo |
| **Skip match chance** | % of keyword-matched posts NOT reacted to | 60–80% are skipped |
| **Fatigue rate** | Delays increase as session progresses | 0.5–6% slower per reaction |
| **Distraction chance** | Random 1–3 min "stepped away" breaks | 4–10% per reaction |
| **Profile visit chance** | Visit a post author's profile after reacting | 5–10% per reaction |
| **Expand post chance** | Click "see more" to read full content | 8–15% per post |
| **Scroll-back chance** | Scroll up to re-read something passed | ~8% per scroll |
| **Nav diversion chance** | Visit notifications/messages/jobs mid-session | 15–35% at intervals |
| **Hesitation chance** | Pause before clicking a reaction | ~6% per reaction |
| **Reconsider chance** | Undo and re-click a reaction type | ~3% per reaction |
| **Typo chance** | Make a typo while typing a comment, then fix it | ~8% per comment |
| **Thinking pause chance** | Pause between words while typing | 10–25% per word |

All these values get **gaussian jitter** on top — so even two "fast + focused" sessions will differ in exact timings.

---

## Layer 5: Account Maturity Ramp-Up (First 4 Weeks)

New accounts start with very low activity and gradually increase to avoid the "Day 1: 25 reactions" red flag.

| Days since first use | Activity level | Example: if daily target = 45 |
|---------------------|---------------|-------------------------------|
| Days 0–3 | **15%** | ~7 reactions/day |
| Days 4–7 | **30%** | ~14 reactions/day |
| Days 8–14 | **50%** | ~23 reactions/day |
| Days 15–28 | **75%** | ~34 reactions/day |
| Day 29+ | **100%** | Full 45 reactions/day |

> **Setting**: `ENABLE_RAMP_UP=true` (disable with `false` if the account is already mature)

---

## Layer 6: Daily Targets and Quotas

### Reactions

| Setting | Default | What it means |
|---------|---------|--------------|
| `DAILY_TARGET_MIN` | 0 | Minimum reactions per day (0 allows natural zero-days) |
| `DAILY_TARGET_MAX` | 45 | Maximum reactions per day |

A random target is picked within this range at the start of each day. With 2–3 runs/day, each session gets roughly `remaining_reactions / remaining_sessions` as its target.

### Comments (if enabled)

| Setting | Default | What it means |
|---------|---------|--------------|
| `DAILY_COMMENT_MIN` | 3 | Minimum comments per day |
| `DAILY_COMMENT_MAX` | 8 | Maximum comments per day |
| `COMMENT_MIN_GAP` | 3 | Minimum posts between comments |
| `COMMENT_MAX_GAP` | 8 | Maximum posts between comments |

### Session Duration

| Setting | Default | Actual range |
|---------|---------|-------------|
| `MAX_SESSION_MINUTES` | 25 | 17–32 min (±30% variance) |

---

## Layer 7: During the Session — Decision Flow

```
Session starts
│
├── 25% chance: Visit a random LinkedIn page first (notifications, messages, etc.)
│
└── Scroll feed loop (runs until session target met or time expires)
      │
      ├── See post → extract text
      │     │
      │     ├── Keywords match?
      │     │     │
      │     │     ├── 60–80% → SKIP anyway (look selective, not desperate)
      │     │     │
      │     │     └── 20–40% → Proceed to react
      │     │           │
      │     │           ├── Select reaction type (based on keyword → reaction mapping)
      │     │           ├── Bezier curve mouse movement → click reaction
      │     │           ├── Wait 60–180 sec × tempo × fatigue factor
      │     │           │
      │     │           ├── 5–10% chance: Visit author's profile page
      │     │           │     └── Scroll profile, read for 3–10 sec, go back
      │     │           │
      │     │           ├── 4–10% chance: Take a 1–3 min break (distraction pause)
      │     │           │
      │     │           └── Comment eligible? (all must be true)
      │     │                 ├── Commenting enabled + API key set
      │     │                 ├── 3–8 posts gap since last comment
      │     │                 ├── Post has ≥5 reactions OR ≥2 comments
      │     │                 ├── Haven't hit session comment target
      │     │                 ├── Not already commented on this post
      │     │                 └── Session has ≥5 min remaining
      │     │                       │
      │     │                       └── AI generates comment → human-like typing with
      │     │                           variable speed, thinking pauses, possible typo+fix
      │     │
      │     └── No match → scroll past
      │
      ├── Every 8–40 posts: Possibly visit a random LinkedIn page
      │     └── Destinations (weighted): Notifications (25%), Messages (20%),
      │         My Network (20%), Jobs (12%), Groups (8%), Events (8%), Learning (7%)
      │
      ├── Scroll with inertia physics (velocity + friction decay)
      │     ├── 18–50% chance: Pause to read (2–7 sec)
      │     ├── ~7% chance: Long read pause (12–35 sec)
      │     └── ~8% chance: Scroll back up (re-reading something)
      │
      └── Session fatigue: all delays gradually increase as session progresses
```

---

## Layer 8: Human Simulation Details

### Mouse Movement
- **Bezier curves**: 4-point cubic Bezier path from random start offset to target
- **Variable steps**: 8–16 points sampled along the curve
- **Bell curve timing**: Slow start → fast middle → slow approach
- **Micro-jitter**: ±1.5px gaussian noise on each point
- **Overshoot correction**: 5% chance of overshooting target, pausing, then correcting
- **Click position**: Random point within 30–70% of element bounds (not dead center)

### Typing (for comments)
- **Variable speed**: 40–90ms per character (gaussian distributed)
- **Typo simulation**: ~8% chance per comment of making one typo (adjacent QWERTY key), pausing ("oh crap"), backspacing, then typing correct character
- **Thinking pauses**: 10–25% chance of pausing 200–1000ms between words
- **Sentence pauses**: 300–900ms pause after periods, exclamation marks, question marks
- **Thinking delay before typing**: 5–15 sec scaled by comment length and tempo

### Scrolling
- **Inertia physics**: Initial velocity (gaussian, ~5 px/step) decays with friction (0.85–0.95)
- **Variable steps**: 6–18 scroll events per scroll action
- **Micro-jitter**: ±3px random noise on each scroll delta
- **Not fixed pixels**: Every scroll covers a different distance

---

## Realistic Week Example (2–3 Manual Runs/Day)

| Day | Run 1 | Run 2 | Run 3 | Total |
|-----|-------|-------|-------|-------|
| Mon | 8 reactions | 12 reactions | — | 20 |
| Tue | browse-only | 15 reactions | 9 reactions | 24 |
| Wed | **SKIP DAY** (terminal only) | — | — | 0 |
| Thu | 6 reactions | 11 reactions | 10 reactions | 27 |
| Fri | 14 reactions | browse-only | — | 14 |
| Sat | 5 reactions | 8 reactions | — | 13 |
| Sun | 10 reactions | 7 reactions | 5 reactions | 22 |

Numbers vary daily because: target is random (0–45), personality differs per session, browse-only rolls happen, skip-match rate fluctuates.

---

## Comment Safety Filters

Before any AI-generated comment is posted, it passes through these checks:

| Check | What it catches |
|-------|----------------|
| **Banned phrases** | "as an AI", "language model", "delve", "leverage", "game-changer", "groundbreaking", "landscape", "navigate", "realm", "foster", "cultivate", "transformative", "paradigm", "synergy", "holistic", "robust", "nuance", "multifaceted", "comprehensive", "furthermore", "it's fascinating", "I completely agree", "great insights", "incredible", "remarkable", "invaluable", "commendable", "resonate", "harnessing", "pivotal", "kudos" |
| **Length limits** | Must be 15–200 characters |
| **Engagement threshold** | Post must have ≥5 reactions OR ≥2 existing comments |
| **Duplicate check** | Compared against last 5 comments in session for similarity |
| **Already commented** | Won't comment on a post you've already commented on |

---

## Dashboard "Start Session" Guarantees

When you click **Start Session** from the dashboard:

| Guarantee | How |
|-----------|-----|
| **No delay** | `FORCE_NO_JITTER=1` — session starts immediately |
| **No skip-day block** | `FORCE_NO_SKIP=1` — always runs regardless of skip-day status |
| **No orphan lockfile block** | Dashboard checks if the PID in the lockfile is actually alive; cleans up dead locks |
| **Lockfile cleanup on crash** | Both `error` and `close` handlers remove the lockfile |
| **DB cleanup on crash** | `forceEndRunningSessions()` marks stale DB sessions as stopped |

The only thing that can block "Start Session":
1. Another session is genuinely running right now
2. LinkedIn session is expired (need to re-login)
3. Captcha cooldown is active (24-hour safety pause)

---

## Configuration Quick Reference

All settings are editable from the dashboard **Settings** page.

### Timing
| Setting | Default | Description |
|---------|---------|-------------|
| `MORNING_WINDOW` | 08:00–10:00 | Morning session window (daemon mode) |
| `AFTERNOON_WINDOW` | 12:00–14:00 | Afternoon session window (daemon mode) |
| `EVENING_WINDOW` | 17:00–19:00 | Evening session window (daemon mode) |
| `MAX_SESSION_MINUTES` | 25 | Max session duration (±30% variance applied) |
| `MAX_JITTER_MINUTES` | 30 | Max startup delay (capped to 5 min for manual) |

### Targets
| Setting | Default | Description |
|---------|---------|-------------|
| `DAILY_TARGET_MIN` | 0 | Min daily reactions |
| `DAILY_TARGET_MAX` | 45 | Max daily reactions |
| `DAILY_COMMENT_MIN` | 3 | Min daily comments |
| `DAILY_COMMENT_MAX` | 8 | Max daily comments |

### Anti-Detection
| Setting | Default | Description |
|---------|---------|-------------|
| `SKIP_DAY_PERCENT` | 15 | % chance of skipping an entire day |
| `BROWSE_ONLY_PERCENT` | 15 | % chance of browse-only session (no reactions) |
| `WINDOW_VARIANCE_MINUTES` | 45 | Shifts session window boundaries daily |
| `REACTION_DELAY_MIN_SEC` | 60 | Min seconds between reactions |
| `REACTION_DELAY_MAX_SEC` | 180 | Max seconds between reactions |
| `MATCH_SKIP_MIN` | 60 | Min % of keyword matches to skip |
| `MATCH_SKIP_MAX` | 80 | Max % of keyword matches to skip |
| `ENABLE_RAMP_UP` | true | Gradually increase activity over 4 weeks |
