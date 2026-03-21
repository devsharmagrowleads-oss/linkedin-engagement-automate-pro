---
status: fixed
priority: p3
issue_id: "010"
tags: [code-review, performance]
dependencies: []
---

# SSE Connection Has No Limit

## Problem Statement

`api.js:13-24` — the `/api/events` endpoint accepts unlimited SSE connections with no cap. Could exhaust memory or file descriptors.

## Proposed Solution

```js
if (sseClients.size >= 10) {
  return res.status(503).end();
}
```

## Acceptance Criteria
- [ ] SSE connections capped at a reasonable limit
