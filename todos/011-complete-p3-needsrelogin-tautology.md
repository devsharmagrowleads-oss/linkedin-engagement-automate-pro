---
status: fixed
priority: p3
issue_id: "011"
tags: [code-review, quality]
dependencies: []
---

# needsRelogin Logic Is a Tautology + Unnecessary DB Query

## Problem Statement

In `api.js:84-86`:
```js
const lastError = db.getLastError();
const lastSessionExpired = lastError && lastError.error_message === 'Session expired';
const needsRelogin = !profileExists || (lastSessionExpired && !profileExists);
```

The expression `!A || (B && !A)` simplifies to `!A`. The `getLastError()` query runs on every 5-second poll for no effect.

## Proposed Solution

```js
const needsRelogin = !profileExists;
```
Remove the `getLastError()` call from the status endpoint.

## Acceptance Criteria
- [ ] needsRelogin logic simplified
- [ ] One fewer DB query per status poll
