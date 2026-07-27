---
id: 01KYJDWY5WKG86W65H2ZXNWT3Y
slug: stabilize-full-unit-suite-isolation-and-mount-authorization-
title: Stabilize full unit suite isolation and mount authorization setup
origin: parked
status: To Do
priority: medium
labels:
  - testing
  - reliability
created: 2026-07-27
source: se-debug
context:
  cwd: /home/simonwjackson/code/github/simonwjackson/pyxis
  branch: main
  commit: fc35c4f
  repo: pyxis
---

# Stabilize full unit suite isolation and mount authorization setup

## Why it matters

`just test-unit` currently reports nine unrelated failures: `mountPyxis.test.tsx` fails independently because client-mode authorization is never initialized, while stream/client-mode/router tests pass alone but fail in the full run from shared global state. This prevents the default verification gate from providing a trustworthy green signal.

## Acceptance Criteria

- [ ] `src/web/mountPyxis.test.tsx` initializes client mode authorization through the public boot seam and passes independently.
- [ ] Stream, client-mode, and HTTP router tests pass both independently and in the full `just test-unit` run.
- [ ] `just test-unit` completes without order-dependent failures.

## Related

- `src/web/mountPyxis.test.tsx`
- `server/services/stream.test.ts`
- `server/services/clientMode.test.ts`
- `server/http/router.test.ts`
