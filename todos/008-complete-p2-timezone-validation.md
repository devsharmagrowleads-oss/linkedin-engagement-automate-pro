---
status: fixed
priority: p2
issue_id: "008"
tags: [code-review, security]
dependencies: []
---

# TIMEZONE Setting Not Validated

## Problem Statement

In `api.js:262`, the TIMEZONE field receives only `sanitizeValue` treatment (strip newlines). No format validation. A value like `'; DROP TABLE reactions; --` would be written to .env. While dotenv parsing prevents injection, malformed values could cause timezone parsing failures.

## Proposed Solution

Add regex validation:
```js
if (settings.TIMEZONE && !/^[A-Za-z_/]+$/.test(sanitizeValue(settings.TIMEZONE))) {
  return res.status(400).json({ error: 'TIMEZONE must be a valid IANA timezone' });
}
```
- **Effort**: Small

## Acceptance Criteria
- [ ] Invalid TIMEZONE values are rejected with 400
