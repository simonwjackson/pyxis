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

Later M3 storage work isolated an environment dependency: `nix/devshell.nix` does not supply
Node. In the background process environment, `nix develop -c sh -c 'command -v node; node
--version'` found no Node, while Bun 1.3.13 was available. Even `--shell=system` then failed
the same four Console tests (231/235 passing). Prepending the installed Node 22.22.1 bin
directory made the otherwise identical background command pass all 235 tests; the final
237-test suite also passed with that explicit runtime. The foreground tool already had Node
on PATH, explaining why its system-shell workaround worked. Pin Node in the development/test
environment and recheck the default aggregate command rather than relying on inherited PATH.
Logs: `/tmp/pyxis-m3-read-only-open-final-tests.log`,
`/tmp/pyxis-m3-read-only-open-explicit-node-tests.log`, and
`/tmp/pyxis-m3-no-seed-explicit-node-tests.log`. No test-runner code was changed in this slice.
