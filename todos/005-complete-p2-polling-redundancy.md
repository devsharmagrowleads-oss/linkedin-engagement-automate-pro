---
status: fixed
priority: p2
issue_id: "005"
tags: [code-review, performance, frontend]
dependencies: []
---

# Redundant 5-Second Polling Alongside SSE

## Problem Statement

The frontend fires 3 HTTP requests every 5 seconds (`/status`, `/stats`, `/reactions`) via `setInterval`, while simultaneously maintaining an SSE connection. During idle periods (no session running), every response is identical. This creates 36 unnecessary HTTP requests per minute.

Additionally, the `pollInterval` can stack multiple intervals due to rapid visibility changes (`app.js:455-461`).

## Proposed Solutions

### Option A: Reduce idle poll rate + fix interval stacking
```js
// Fix stacking:
document.addEventListener('visibilitychange', () => {
  clearInterval(pollInterval);
  if (!document.hidden) {
    refreshDashboard();
    pollInterval = setInterval(refreshDashboard, 5000);
  }
});

// Optionally: poll every 30s when idle, 5s when session running
```
- **Effort**: Small
- **Risk**: Low

### Option B: SSE-driven refresh (larger refactor)
Push `data_changed` events from server after mutations, only poll on initial load.
- **Effort**: Medium
- **Risk**: Low

## Acceptance Criteria
- [ ] No stacking of setInterval
- [ ] Reduced network overhead during idle periods
