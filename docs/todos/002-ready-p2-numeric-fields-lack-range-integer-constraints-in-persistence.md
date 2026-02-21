---
status: ready
priority: p2
severity: important
category: correctness
effort: small
agents: [kieran-typescript-reviewer, security-sentinel, performance-oracle, architecture-strategist, pattern-recognition-specialist, learnings-researcher, code-simplicity-reviewer]
created: 2026-02-21T01:21:36.413Z
jobId: 3b43d1e3
---

# Numeric fields lack range/integer constraints in persistence schema

## Problem Statement

`confidence`, `retryCount`, `bitrate`, and timestamp fields are currently broad numbers without bounds/integer checks. This allows invalid and boundary-breaking values (negative retries, confidence > 1, absurd timestamps) that can corrupt scheduling logic, cause hot-loop retries, and create data integrity issues under network failures or resource exhaustion scenarios. Stakeholder impact: Developers must add repetitive defensive checks across services; Operations risks queue storms and degraded stability as load grows; End users can experience delayed/missed upgrades and erratic behavior; Security risk includes intentional malformed input causing denial-of-service-like churn; Business impact is strong because early validation prevents downstream production incidents. Recommended fix: enforce canonical constraints at schema level (e.g., confidence [0,1], retryCount integer >= 0, bitrate positive integer, timestamps positive integers). Known Pattern: see docs/solutions/bounded-numeric-validation.md

## Findings

- Severity: important
- Category: correctness
- Effort: small
- Flagged by: kieran-typescript-reviewer, security-sentinel, performance-oracle, architecture-strategist, pattern-recognition-specialist, learnings-researcher, code-simplicity-reviewer
- File: src/db/config.ts
- Known Pattern: docs/solutions/bounded-numeric-validation.md

## Acceptance Criteria

- [ ] Issue described above is resolved
- [ ] No regressions introduced
