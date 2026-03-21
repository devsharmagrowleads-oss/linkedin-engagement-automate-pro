---
status: fixed
priority: p2
issue_id: "003"
tags: [code-review, quality, frontend]
dependencies: []
---

# Frontend api() Helper Missing Response Status Check

## Problem Statement

The `api()` function in `app.js:3-8` does not check `res.ok`. Error responses (400, 500) are parsed as JSON and returned as if they were success data. Callers then access properties like `data.sessions.length` on error objects, causing silent failures or confusing UI states.

## Proposed Solutions

### Option A: Add res.ok check and throw (Recommended)
```js
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API ${res.status}`);
  }
  return res.json();
}
```
- **Effort**: Small
- **Risk**: Low — callers already have catch blocks

## Acceptance Criteria
- [ ] API errors show meaningful toast messages
- [ ] 400/500 responses don't cause silent UI failures
