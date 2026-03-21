---
status: fixed
priority: p2
issue_id: "004"
tags: [code-review, performance, frontend]
dependencies: []
---

# innerHTML += Causes Full DOM Reparse on Pagination

## Problem Statement

In `app.js:256`, `loadMoreReactions()` uses `tbody.innerHTML += html` which serializes the entire existing DOM subtree, concatenates new HTML, then reparses everything. After loading 5 pages (250 rows), each "Load More" click rebuilds all 300 rows from scratch.

## Proposed Solutions

### Fix: Use insertAdjacentHTML (one-line change)
```js
if (append) {
    tbody.insertAdjacentHTML('beforeend', html);
}
```
- **Effort**: Trivial (1 line)
- **Risk**: None

## Also fix: escapeHtml DOM allocation
Replace DOM-based escapeHtml with string replacement:
```js
function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

## Acceptance Criteria
- [ ] "Load More" appends without reflowing existing rows
- [ ] No DOM element creation in escapeHtml
