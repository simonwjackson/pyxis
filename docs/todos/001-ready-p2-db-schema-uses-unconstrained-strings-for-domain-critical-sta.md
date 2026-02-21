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

# DB schema uses unconstrained strings for domain-critical state fields

## Problem Statement

In `src/db/config.ts`, fields such as `trackSources.source`, `trackSources.reviewStatus`, and `upgradeQueue.status` are modeled as generic strings instead of strict literal unions. This permits invalid workflow states (e.g., typos or unsupported values) to be persisted, which can break resolver/scheduler branching on happy path and cause hard-to-debug failures on invalid inputs. At scale (10x/100x queue growth), dirty state can trigger retry churn, branch misses, and cascading operational instability during due-job polling. Stakeholder impact: Developers lose type guarantees and spend more time debugging; Operations faces harder incident triage and rollback risk from poisoned rows; End users may see missed upgrades or inconsistent playback behavior; Security posture weakens because untrusted state transitions increase attack surface for logic abuse; Business impact is high ROI to fix now because late data migrations are costly. Recommended fix: enforce literal unions for these fields (including `SourceType` alignment) at schema boundary. Known Pattern: see docs/solutions/schema-first-domain-enums.md

## Findings

- Severity: important
- Category: correctness
- Effort: small
- Flagged by: kieran-typescript-reviewer, security-sentinel, performance-oracle, architecture-strategist, pattern-recognition-specialist, learnings-researcher, code-simplicity-reviewer
- File: src/db/config.ts
- Known Pattern: docs/solutions/schema-first-domain-enums.md

## Acceptance Criteria

- [ ] Issue described above is resolved
- [ ] No regressions introduced
