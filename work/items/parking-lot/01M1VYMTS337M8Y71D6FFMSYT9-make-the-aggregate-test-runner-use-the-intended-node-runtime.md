---
id: 01M1VYMTS337M8Y71D6FFMSYT9
slug: make-the-aggregate-test-runner-use-the-intended-node-runtime
title: Make the aggregate test runner use the intended Node runtime
origin: parked
status: To Do
priority: medium
labels:[]
created: 2026-09-06
source: se-work
---

# Make the aggregate test runner use the intended Node runtime

## Why it matters

Under the current Nix/Bun environment, `bun run test` repeatedly fails four default-worker Console tests, while the identical test script with `--shell=system` and direct client-suite execution pass. This makes the documented aggregate gate unreliable and can hide genuine regressions behind runtime-specific behavior.

## Acceptance Criteria

- [ ] Identify and document why the default Bun shell changes the client test runtime or worker behavior.
- [ ] Ensure the standard `just test-ts` command runs all plugin/SDK and client tests successfully without special invocation flags.
- [ ] Keep production browser-worker behavior unchanged.

## Related

- `package.json`
- `justfile`
- `clients/app/src/reference/Console.test.tsx`
- `nix/devshell.nix`

## Notes

2026-09-06: default `nix develop -c just test-ts` failed the same four Console tests twice; `nix develop -c bun run --shell=system test` passed 71 plugin/SDK and 207 client tests. Targeted Console test suite passed 51/51.
