---
title: "Enforce strict upgrade domain contracts in config and DB schemas"
category: correctness
problem_type: architecture_issue
component: database
severity: high
root_cause_type: missing_validation
resolution_type: code_fix
tags: [schema-validation, domain-enums, bounded-numbers, config-hardening, negative-tests]
created: 2026-02-21T01:24:39.900Z
---

# Enforce strict upgrade domain contracts in config and DB schemas

## Symptoms

- Invalid workflow states could be persisted (e.g., bad status/source values)
- Retry and resolver logic risked branch misses from malformed records
- Config lacked Soulseek/upgrade defaults and secret accessor coverage
- Tests were mostly happy-path and missed contract-failure scenarios

## What Didn't Work

N/A

## Solution

Added strict schema boundaries in both config and DB: `SoulseekSourceSchema`, `UpgradeSchema`, `TrackSourceSchema`, and `UpgradeQueueSchema`, then registered `trackSources`/`upgradeQueue` collections with hot-path indexes like `["status", "nextRetryAt"]` and `["trackId", "reviewStatus"]`. Introduced enum-style literals for stateful fields (e.g., `source`, `reviewStatus`, `status`) and bounded numerics such as `confidence` via `Schema.Number.pipe(Schema.between(0, 1))`, `retryCount` via `Schema.nonNegative()`, and finite time fields. Expanded tests to include negative validation cases plus one CRUD smoke test, and added `getSoulseekPassword()` with tests ensuring `PYXIS_SOULSEEK_PASSWORD` is not serialized in resolved config.

## Why This Works

Validating domain constraints at the persistence/config boundary prevents invalid states from entering the system, so scheduler/resolver code can rely on trusted invariants instead of defensive branching everywhere. Composite indexes align with expected polling and lookup patterns, reducing scan-heavy operations as queue size grows. Secret handling stays outside structured config output, reducing accidental exposure through logs/serialization.

## Prevention

Adopt a schema-first rule for all new state machines: represent statuses/sources as literals/unions and require bounded numeric constraints before collection registration. For each schema addition, require contract-negative tests (invalid enum, out-of-range numbers, missing required fields) plus index review for predicted hot queries. Keep secrets environment-only and add explicit non-serialization assertions whenever introducing new credential accessors.

## Related Issues

- docs/solutions/schema-first-domain-enums.md
- docs/solutions/bounded-numeric-validation.md
- docs/solutions/contract-negative-testing.md
