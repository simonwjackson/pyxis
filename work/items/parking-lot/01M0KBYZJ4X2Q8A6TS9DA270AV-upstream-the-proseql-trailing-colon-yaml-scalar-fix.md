---
id: 01M0KBYZJ4X2Q8A6TS9DA270AV
slug: upstream-the-proseql-trailing-colon-yaml-scalar-fix
title: Upstream the ProseQL trailing-colon YAML scalar fix
origin: parked
status: To Do
priority: medium
labels:
  - proseql
  - persistence
  - follow-up
created: 2026-08-21
source: se-work
context:
  cwd: /home/simonwjackson/code/github/simonwjackson/pyxis
  branch: main
  commit: 0485702
  repo: pyxis
  invoked_by: user
---

# Upstream the ProseQL trailing-colon YAML scalar fix

## Why it matters

Pyxis now carries a local dependency patch because ProseQL 0f9c9cc emits invalid YAML for strings such as `Note to Self:`. Upstreaming the fix and bumping the pin removes a maintenance patch and gives every ProseQL consumer the same persistence guarantee.

## Acceptance Criteria

- [ ] ProseQL quotes plain YAML scalar values that end in `:`.
- [ ] The ProseQL format conformance test covers encode and decode of `Note to Self:`.
- [ ] Pyxis pins the upstream fixed revision and removes `nix/patches/proseql-yaml-trailing-colon.patch`.

## Related

- `flake.nix`
- `nix/patches/proseql-yaml-trailing-colon.patch`
- `services/pyxis/tests/library.rs`
