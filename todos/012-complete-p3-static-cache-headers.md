---
status: fixed
priority: p3
issue_id: "012"
tags: [code-review, performance]
dependencies: []
---

# No Cache Headers on Static Assets

## Problem Statement

`server.js:20` uses `express.static` with defaults — no Cache-Control headers. The 23KB CSS and 19KB JS are re-downloaded on every page load.

## Proposed Solution

```js
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
```

## Acceptance Criteria
- [ ] Static assets served with Cache-Control headers
