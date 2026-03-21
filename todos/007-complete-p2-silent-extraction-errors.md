---
status: fixed
priority: p2
issue_id: "007"
tags: [code-review, quality]
dependencies: []
---

# Silent Error Swallowing in Post Extraction

## Problem Statement

In `extractor.js:114-117`, the outer try/catch returns `null` for both "not a valid post" and "unexpected error". If LinkedIn changes their DOM, every post silently returns `null` — sessions end with zero reactions and no diagnostic output.

## Proposed Solution

Add warning-level logging:
```js
} catch (err) {
  log.warn(`Post extraction failed: ${err.message}`);
  return null;
}
```

## Acceptance Criteria
- [ ] Extraction failures are logged with error message
- [ ] Systemic DOM changes produce visible warnings
