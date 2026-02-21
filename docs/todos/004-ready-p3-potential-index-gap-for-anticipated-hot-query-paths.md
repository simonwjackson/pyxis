---
status: ready
priority: p3
severity: nice-to-have
category: performance
effort: medium
agents: [performance-oracle, architecture-strategist, pattern-recognition-specialist]
created: 2026-02-21T01:21:36.413Z
jobId: 3b43d1e3
---

# Potential index gap for anticipated hot query paths

## Problem Statement

Given planned scheduler/resolver flows, consider composite indexes such as `[status, nextRetryAt]` for due-job polling and `[trackId, reviewStatus]` for source resolution; also evaluate whether standalone `source` index is needed beyond current composite usage. Risk is low now but may surface at 100k+ rows with scan-heavy polling patterns.

## Findings

- Severity: nice-to-have
- Category: performance
- Effort: medium
- Flagged by: performance-oracle, architecture-strategist, pattern-recognition-specialist
- File: src/db/config.ts


## Acceptance Criteria

- [ ] Issue described above is resolved
- [ ] No regressions introduced
