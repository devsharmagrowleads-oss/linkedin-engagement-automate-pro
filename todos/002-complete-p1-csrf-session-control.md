---
status: fixed
priority: p1
issue_id: "002"
tags: [code-review, security]
dependencies: []
---

# CSRF on Session Start/Stop Endpoints

## Problem Statement

The Express API has no CSRF protection. Any website open in the user's browser can make POST requests to `localhost:3000/api/session/start` and `localhost:3000/api/session/stop`. These endpoints don't read the request body, so a simple POST from a malicious page bypasses CORS preflight and succeeds.

## Findings

- **Security Sentinel**: Confirmed MEDIUM severity. POST endpoints without body requirements (session/start, session/stop) are exploitable via cross-origin requests.

## Proposed Solutions

### Option A: Origin/Referer header check (Recommended)
```js
// In server.js, before API routes:
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer || '';
    if (!origin.includes('localhost:') && !origin.includes('127.0.0.1:')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  next();
});
```
- **Pros**: Simple, no client-side changes needed
- **Cons**: Referer can be suppressed (but then request is blocked, which is safe)
- **Effort**: Small
- **Risk**: Low

### Option B: CSRF token
- **Pros**: More robust
- **Cons**: Overkill for localhost tool, requires client-side token management
- **Effort**: Medium
- **Risk**: Low

## Technical Details
- **Affected files**: `src/server/server.js`, `src/server/api.js`

## Acceptance Criteria
- [ ] Cross-origin POST requests to /api/* are rejected with 403
- [ ] Dashboard POST requests continue to work normally
