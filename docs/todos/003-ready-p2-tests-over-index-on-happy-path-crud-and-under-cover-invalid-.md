---
status: ready
priority: p2
severity: important
category: testing
effort: small
agents: [kieran-typescript-reviewer, code-simplicity-reviewer, security-sentinel, performance-oracle, pattern-recognition-specialist]
created: 2026-02-21T01:21:36.413Z
jobId: 3b43d1e3
---

# Tests over-index on happy-path CRUD and under-cover invalid schema inputs

## Problem Statement

Current DB/config tests largely validate successful CRUD/default behavior but do not assert rejection for invalid enums/ranges and key boundary cases. This leaves gaps for invalid inputs, boundary conditions, and future regressions once worker/scheduler logic depends on strict contracts. Add negative tests for invalid status/reviewStatus/source, confidence > 1, negative retryCount, malformed retry schedules, and missing required fields; keep one CRUD smoke path and prioritize contract-failure tests. Stakeholder impact: Developers gain faster feedback and safer refactors; Operations gets better deploy safety; End users benefit from fewer runtime failures due to bad persisted data; Security benefits from stronger input-validation guarantees. Known Pattern: see docs/solutions/contract-negative-testing.md

## Findings

- Severity: important
- Category: testing
- Effort: small
- Flagged by: kieran-typescript-reviewer, code-simplicity-reviewer, security-sentinel, performance-oracle, pattern-recognition-specialist
- File: src/db/config.test.ts
- Known Pattern: docs/solutions/contract-negative-testing.md

## Acceptance Criteria

- [ ] Issue described above is resolved
- [ ] No regressions introduced
