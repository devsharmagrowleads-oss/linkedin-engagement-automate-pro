---
date: 2026-03-19
topic: linkedin-auto-react
focus: Auto-react to LinkedIn posts matching keywords via feed scrolling
---

# Ideation: LinkedIn Auto-React System

## Codebase Context
- Greenfield project (empty directory)
- Team has Playwright browser automation experience (from sibling heimtextil project)
- HeyReach MCP tools available but NOT used for reactions (rate limits too low: 220/month vs 50/day needed)
- LinkedIn has no public API for reactions — browser automation is the only path
- Single LinkedIn account operation

## Constraints (from user)
- ~50 reactions/day target
- Feed scrolling discovery (not search)
- Keyword-based post matching (user provides keywords)
- Smart reaction selection (context-aware)
- Human-like behavior is critical
- No HeyReach integration for the reaction flow

## Ranked Ideas

### 1. Playwright Feed Scroller + Keyword Matcher
**Description:** Playwright opens LinkedIn feed, scrolls naturally, extracts post text, matches against keyword list. Matching posts get queued for reaction.
**Rationale:** Most direct path to the goal. Deterministic, testable, uses team's existing Playwright skills.
**Downsides:** LinkedIn DOM changes can break selectors. Feed content is algorithm-dependent.
**Confidence:** 90%
**Complexity:** Medium
**Status:** Unexplored

### 2. Smart Reaction Selector
**Description:** Analyze matched post content to pick the best reaction type. Promotion → Celebrate. Industry insight → Insightful. Personal story → Love/Support. General → Like.
**Rationale:** Contextually correct reactions are indistinguishable from human behavior. Differentiation from bot-like uniform Likes.
**Downsides:** Keyword rules can misfire. LLM calls add latency/cost if upgraded later.
**Confidence:** 80%
**Complexity:** Low–Medium
**Status:** Unexplored

### 3. Human Behavior Engine
**Description:** Randomized delays (3–15s gaussian), natural scroll patterns, session timing in realistic windows, daily caps with variance (45–55), occasional skips.
**Rationale:** Human-like behavior is the #1 survival factor for LinkedIn automation. This makes or breaks the system.
**Downsides:** Adds time to complete daily quota. Harder to test/validate.
**Confidence:** 85%
**Complexity:** Medium
**Status:** Unexplored

### 4. Session & Cookie Management
**Description:** Store LinkedIn session cookies, detect expiry, handle re-auth. Stealth-mode Playwright to avoid fingerprinting.
**Rationale:** Without reliable sessions, nothing else works. Foundation layer.
**Downsides:** LinkedIn may rotate session tokens or require 2FA periodically.
**Confidence:** 85%
**Complexity:** Low
**Status:** Unexplored

### 5. Reaction Log & Daily Report
**Description:** SQLite log of every reaction. Daily summary of counts by reaction type.
**Rationale:** Measurement enables optimization. Know what the system is doing.
**Downsides:** Storage grows over time (minor).
**Confidence:** 75%
**Complexity:** Low
**Status:** Unexplored

### 6. Keyword Config System
**Description:** JSON/YAML config for keywords, keyword groups, and optional weights.
**Rationale:** Easy to update targeting without code changes.
**Downsides:** None significant.
**Confidence:** 90%
**Complexity:** Low
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | HeyReach Webhook Pipeline | Rate limits too low (220/month vs 1500/month needed) |
| 2 | LinkedIn Mobile API Reverse-Engineering | High legal/TOS risk, unstable endpoints |
| 3 | Make Them Post Then React | Too indirect, low probability |
| 4 | Non-Reaction Engagement (DMs) | User wants reactions specifically |
| 5 | Browser Extension + WebSocket | Requires manual browser — defeats automation goal |
| 6 | Content-Blind Bulk Reactor | User wants smart selection |
| 7 | Declarative State Reconciliation | Overcomplicates simple scheduling |
| 8 | Feed-Learning Engagement Memory | Premature optimization, needs months of data |
| 9 | Email/Notification Hijacking | Fragile, format changes break it |
| 10 | Multi-Account Rotation | User confirmed single account |
| 11 | LinkedIn Search Discovery | User chose feed scrolling |
| 12 | Lead Graph Expansion | Scope creep beyond reactions |
| 13 | Campaign-Synchronized Cadence | No HeyReach integration |
| 14 | Reciprocity Engine | Complex for marginal gain |
| 15 | Reaction-to-Pipeline Converter | Profile view detection unreliable |

## Session Log
- 2026-03-19: Initial ideation — 40+ candidates generated across 5 frames, 6 survived after user constraint refinement. User chose: feed scrolling, single account, smart reaction selection.
