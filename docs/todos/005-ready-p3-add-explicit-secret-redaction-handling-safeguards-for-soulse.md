---
status: ready
priority: p3
severity: nice-to-have
category: security
effort: small
agents: [security-sentinel]
created: 2026-02-21T01:21:36.413Z
jobId: 3b43d1e3
---

# Add explicit secret redaction/handling safeguards for Soulseek password

## Problem Statement

`getSoulseekPassword()` is appropriate, but add explicit safeguards/tests to ensure credentials are never logged or serialized in config outputs before worker/logging integration expands. This is preventive hardening rather than an immediate defect.

## Findings

- Severity: nice-to-have
- Category: security
- Effort: small
- Flagged by: security-sentinel
- File: src/config.ts


## Acceptance Criteria

- [ ] Issue described above is resolved
- [ ] No regressions introduced
