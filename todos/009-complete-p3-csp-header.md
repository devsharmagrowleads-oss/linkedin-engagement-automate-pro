---
status: fixed
priority: p3
issue_id: "009"
tags: [code-review, security]
dependencies: []
---

# Missing Content-Security-Policy Header

## Problem Statement

`server.js:13-18` sets X-Content-Type-Options, X-Frame-Options, and X-XSS-Protection, but no CSP. A CSP would mitigate the impact of XSS by preventing inline script execution.

## Proposed Solution

```js
res.setHeader('Content-Security-Policy',
  "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:");
```

## Acceptance Criteria
- [ ] CSP header present on all responses
- [ ] Dashboard still renders correctly with CSP
