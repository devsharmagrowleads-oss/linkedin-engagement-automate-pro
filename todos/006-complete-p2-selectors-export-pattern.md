---
status: fixed
priority: p2
issue_id: "006"
tags: [code-review, quality, architecture]
dependencies: []
---

# selectors.js Module Export Overwrite Pattern

## Problem Statement

In `selectors.js:78-79`, `module.exports` is set to the SELECTORS object, then mutated to add `validateSelectors`. This means `validateSelectors` is mixed into the SELECTORS object alongside selector strings. Any code iterating `Object.keys(SELECTORS)` would include a function.

## Proposed Solution

```js
module.exports = { ...SELECTORS, validateSelectors };
// Or cleaner: module.exports = { SELECTORS, validateSelectors };
// (requires updating importers)
```
- **Effort**: Small
- **Risk**: Low — update all importers

## Acceptance Criteria
- [ ] SELECTORS and validateSelectors are cleanly separated in exports
- [ ] All importers updated and working
