---
title: "refactor: Align tooling wrapper commands"
type: refactor
status: completed
date: 2026-05-25
verify_command: "just format && just typecheck && just test-unit && just lint"
---

# refactor: Align tooling wrapper commands

## Summary

Align Pyxis's local verification command surface around project wrappers: Just remains the developer-facing entrypoint, package scripts gain parity where contributors and automation expect `bun run ...`, and TypeScript validation becomes whole-repo by covering both server/sources and web configs. The plan preserves the existing Biome formatting policy and avoids turning wrapper cleanup into a broad style, Fallow, or release-system migration.

---

## Problem Frame

Pyxis already uses the Lattice stack tools, but its command surfaces have drifted: current Just wrappers exist, package scripts are missing equivalent lint/format/test-unit entries, TypeScript validation does not cover `src/web/**/*`, and developer docs/process files still reference obsolete split dev scripts. This makes the expected verification path harder for humans and agents to follow consistently.

---

## Requirements

- R1. Provide consistent local wrappers for formatting, linting, unit tests, and typechecking through `just` and `bun run` surfaces.
- R2. Make the primary TypeScript verification path whole-repo by covering both `tsconfig.json` and `tsconfig.web.json`.
- R3. Preserve existing Biome behavior and formatting policy, including tab indentation and changed-file-focused formatting to avoid unrelated churn.
- R4. Update developer-facing command references so documented and process-manager startup commands point at scripts that exist.
- R5. Keep Fallow out of the mandatory verification gate until the repo has an intentional Fallow dependency/config/baseline.
- R6. Leave release packaging drift visible but do not invent a CLI release path as part of wrapper alignment.

---

## Scope Boundaries

- No change to `biome.json` indentation, quote, lint, or assist policy beyond what is necessary for command wiring.
- No full-repo formatting sweep; formatting should remain focused on files relevant to the current change unless a human explicitly opts into broader cleanup.
- No Fallow dependency, Fallow config, or hard `fallow audit` gate in this work.
- No React architecture, Storybook, Effect runtime, or source-module refactor work except type fixes required for whole-repo TypeScript verification.
- No release artifact redesign or restoration of the missing CLI binary entrypoint.

### Deferred to Follow-Up Work

- Release workflow repair: `.github/workflows/release.yml` references a missing CLI entrypoint and should be handled by a dedicated release-packaging plan before relying on release automation.
- Fallow adoption: add Fallow only after deciding the repo's boundary policy, baseline location, and CI posture.
- Formatter policy migration: if the project wants Lattice's two-space default instead of the current tab policy, plan it as an explicit style migration with churn controls.

---

## Context & Research

### Relevant Code and Patterns

- `justfile` is already the project automation surface and includes documented recipes for `format`, `lint`, `test-unit`, `test`, `typecheck`, `dev`, and Android commands.
- `package.json` currently has `dev`, `build:web`, `typecheck`, `test`, `test:watch`, and `test:coverage`, but lacks `format`, `lint`, and `test-unit` parity.
- `tsconfig.json` covers server/sources/database code and explicitly excludes `src/web/**/*`; `tsconfig.web.json` covers the web frontend and shared source imports.
- `biome.json` uses Biome 2.3.8, enables formatter/linter/import organization, and intentionally enforces tab indentation.
- `README.md` already prefers `just dev` for the unified embedded-Vite server, while `AGENTS.md`, `CLAUDE.md`, and `Procfile` still reference missing `dev:web` and `dev:server` scripts.

### Institutional Learnings

- `docs/solutions/feature-patterns/2026-04-15-shared-primitives-react-audit.md` supports separating true convention gaps from acceptable project behavior during audits; here that means fixing wrappers without unrelated style or UI refactors.
- `docs/solutions/correctness/enforce-strict-upgrade-domain-contracts-in-config-and-db-sch.md` reinforces keeping verification commands trustworthy rather than narrowing or masking checks.

### External References

- External research was intentionally skipped: the repo has direct local patterns for Bun, Just, Biome, TypeScript configs, and Nix-based dev tooling, and this is not a security/payment/privacy/API-integration change.

---

## Key Technical Decisions

- Use package scripts as the canonical reusable command surface where practical, with Just delegating to them for shared actions: this reduces drift between `just ...` and `bun run ...` while keeping Just as the discoverable developer workflow.
- Keep Biome formatting changed-file-focused instead of switching to full-repo `biome check .`: this preserves the current no-churn behavior and honors the handoff caution about broad formatting rewrites.
- Preserve the existing tracked changed-file Biome scope for this wrapper cleanup: it avoids full-repo churn and behavior surprises; untracked-file inclusion can be evaluated later as a deliberate wrapper behavior change.
- Make `typecheck` run both TypeScript configs, with separate server and web subcommands available for diagnosis: the user explicitly chose whole-repo typechecking for this plan.
- Update `Procfile` to the current single-process dev command rather than restoring obsolete split-process scripts: the current app architecture uses the Bun server with embedded Vite middleware.
- Treat release workflow repair as follow-up rather than active scope: `.github/workflows/release.yml` has deeper packaging drift than a missing `build` script, especially the absent CLI entrypoint.

---

## Open Questions

### Resolved During Planning

- Should `typecheck` remain server-only or become whole-repo? Resolved: make typecheck whole-repo by covering both server/sources and web TypeScript configs.
- Should Fallow be added now? Resolved: defer Fallow until the repo has an intentional config/baseline and adoption plan.
- Should Biome indentation be changed to match Lattice's two-space default? Resolved: no; preserve current project formatter policy.

### Deferred to Implementation

- Exact web type errors that must be fixed for `tsconfig.web.json` to pass: implementation should enumerate them with the new web typecheck command and fix only the minimum type-correctness issues needed for the command to pass.
- Whether the changed-file Biome selector should live as a tiny shell helper, an inline package script, or another small shared mechanism: choose the simplest maintainable shape that keeps `just` and package scripts behaviorally aligned while preserving the current tracked-file scope.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

| Command surface | Intended behavior | Notes |
|---|---|---|
| `bun run lint` | Biome check on tracked changed files | Preserve current changed-file posture; do not expand to full-repo or untracked-file formatting in this cleanup. |
| `bun run format` | Biome safe write/check behavior on relevant changed files | Preserve existing `biome check --write` semantics rather than narrowing to formatter-only. |
| `bun run test-unit` | Run Bun unit tests | Keep `bun run test` as a compatibility alias or equivalent. |
| `bun run typecheck` | Run server/sources typecheck and web typecheck | Add subcommands for each config so failures are diagnosable. |
| `just lint` / `just format` / `just test-unit` / `just typecheck` | Delegate to the corresponding package script | Just stays the documented wrapper layer. |
| `Procfile` | Start the current unified dev server | Do not restore missing split dev scripts. |

---

## Implementation Units

### U1. Canonicalize command wrappers

**Goal:** Add package-script parity for the Lattice verification commands and make Just delegate to the same command definitions without changing existing developer-facing recipe names.

**Requirements:** R1, R3, R5

**Dependencies:** None

**Files:**
- Modify: `package.json`
- Modify: `justfile`
- Create or modify: `scripts/biome-changed-files.sh` only if a small helper is needed to share changed-file Biome selection
- Test: none -- wrapper behavior is command-verified unless implementation introduces non-trivial runtime code; if a TypeScript helper is introduced instead, create `scripts/biome-changed-files.test.ts` and include `scripts/**/*` in the relevant typecheck scope

**Approach:**
- Add package scripts for `lint`, `format`, and `test-unit` that mirror the current Just behavior.
- Keep `test` available as the existing compatibility command.
- Prefer one shared implementation for Biome file selection so `just lint` and `bun run lint` cannot drift.
- Keep Biome invocation tied to the repo dependency already declared in `package.json`; avoid opportunistic tool downloads or new dependencies.
- Do not add Fallow to `package.json`, `justfile`, or verification gates.

**Patterns to follow:**
- `justfile` recipe comments that make `just --list` useful.
- Existing `justfile` changed-file Biome behavior.
- Existing `package.json` Bun script style.

**Test scenarios:**
- Happy path: with a changed tracked TypeScript file, `bun run lint` and `just lint` inspect the same file set and report the same Biome outcome.
- Happy path: with no relevant changed files, `bun run lint`, `bun run format`, `just lint`, and `just format` exit successfully without invoking broad full-repo formatting.
- Edge case: with a new untracked relevant file, lint/format preserve the current tracked-only behavior and do not unexpectedly expand into untracked-file checks.
- Error path: with a relevant file containing a Biome violation, lint exits non-zero while format applies only safe configured writes.
- Integration: `just --list` shows the expected `format`, `lint`, `test-unit`, `test`, and `typecheck` recipes after delegation changes.

**Verification:**
- A contributor can run both `bun run ...` and `just ...` variants for lint, format, and unit tests without hitting missing-script errors.
- The wrapper change does not modify `biome.json` or require unrelated formatting churn.

---

### U2. Make TypeScript verification whole-repo

**Goal:** Update the primary typecheck path so it validates both backend/source code and the web frontend, then fix the minimum existing type errors required for that command to pass.

**Requirements:** R1, R2

**Dependencies:** U1 for package-script convention, though the typecheck script changes may be made in the same commit if small.

**Files:**
- Modify: `package.json`
- Modify: `justfile`
- Modify: `tsconfig.json` only if needed to keep server/sources validation behavior clear
- Modify: `tsconfig.web.json` only if needed to keep web validation behavior clear
- Modify: `src/web/**/*` files surfaced by web typechecking failures
- Test: TypeScript verification through `tsconfig.json` and `tsconfig.web.json`

**Approach:**
- Add separate package scripts for server/sources and web typechecking, then make the primary `typecheck` run both.
- Keep `just typecheck` delegating to the primary package script.
- Treat existing web type errors as part of this plan because whole-repo typechecking was explicitly chosen.
- Limit web fixes to type correctness and contract alignment; do not opportunistically refactor React state, routing, or UI structure unless the compiler failure requires it.
- Stop and report rather than continuing inside this plan if web typecheck failures require broad UI architecture changes or behavior redesign instead of small type-contract fixes.
- Preserve the two-config structure because the repo intentionally uses NodeNext settings for server/sources and bundler/DOM settings for the web app.

**Execution note:** Start with the failing web typecheck as characterization of current gaps, then make the minimal fixes needed for the new whole-repo command to pass.

**Patterns to follow:**
- `tsconfig.json` and `tsconfig.web.json` split described in `AGENTS.md`.
- Existing strict TypeScript posture with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.

**Test scenarios:**
- Happy path: `bun run typecheck` validates both the server/sources config and the web config.
- Happy path: `just typecheck` runs the same whole-repo validation as `bun run typecheck`.
- Error path: if the server/sources config fails, the primary typecheck exits non-zero and exposes that failure.
- Error path: if the web config fails, the primary typecheck exits non-zero and exposes that failure.
- Integration: web files under `src/web/**/*` are no longer invisible to the primary verification path.

**Verification:**
- Whole-repo typechecking passes through the primary wrapper.
- Any touched web type fixes are behavior-preserving and scoped to compiler-contract correctness.

---

### U3. Repair developer command references

**Goal:** Align docs and process-manager command references with the current unified dev server and the new verification wrappers.

**Requirements:** R1, R4

**Dependencies:** U1, U2

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `Procfile`

**Approach:**
- Update the Testing & Quality examples to prefer `just lint`, `just format`, `just test-unit`, and `just typecheck`, with package-script equivalents only where useful.
- Replace stale `dev:web` / `dev:server` references with the current single-process dev command.
- Update `Procfile` to start the current dev command instead of referencing missing package scripts.
- Keep historical docs under `history/`, `openspec/`, and older plans unchanged unless they are actively presented as current instructions.

**Patterns to follow:**
- `README.md` already describes the single Bun server with embedded Vite middleware.
- Existing `justfile` recipe names and descriptions.

**Test scenarios:**
- Happy path: every command shown in the current README development section exists after the wrapper changes.
- Happy path: every command shown in `AGENTS.md` and `CLAUDE.md` command snippets exists after the wrapper changes.
- Integration: `Procfile` no longer references missing `dev:web` or `dev:server` scripts.

**Verification:**
- Current developer documentation points to working wrappers and no longer contradicts `package.json` / `justfile`.

---

## System-Wide Impact

- **Interaction graph:** Developer and agent entrypoints converge around `justfile` and `package.json`; `Procfile` becomes a consumer of existing dev scripts rather than obsolete split scripts.
- **Error propagation:** Verification wrappers should preserve underlying command exit codes so Biome, Bun test, and TypeScript failures remain visible to callers and automation.
- **State lifecycle risks:** Formatting wrappers can mutate files; keeping them changed-file-focused avoids broad unrelated churn.
- **API surface parity:** `just` and `bun run` command surfaces should expose the same core verification behaviors; `just build` remains distinct as the Nix package build.
- **Integration coverage:** The important cross-surface checks are command existence, delegation parity, and whole-repo typecheck coverage.
- **Unchanged invariants:** Existing Biome policy, Android Just recipes, Nix dev-shell tooling, and release workflow semantics are not changed by this plan.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Whole-repo typecheck reveals many existing web errors | Fix only small type-contract issues required for the command to pass; stop and split follow-up work if failures imply architectural UI cleanup. |
| Wrapper delegation hides useful command output | Preserve underlying command exit codes and output rather than swallowing failures. |
| Formatting command rewrites unrelated files | Keep changed-file-focused behavior and inspect the diff after running format. |
| Package scripts and Just recipes drift again | Prefer Just delegation to package scripts or another shared implementation instead of duplicated logic. |
| Release workflow appears fixed when it is not | Document release drift as follow-up; do not claim `.github/workflows/release.yml` is healthy unless its missing CLI path is addressed. |

---

## Documentation / Operational Notes

- Update current contributor-facing command docs as part of implementation; do not rewrite historical migration docs or completed plans.
- If implementation adds or changes command wrappers in a way worth preserving for future agents, consider capturing a follow-up learning under `docs/solutions/` after the work lands.

---

## Sources & References

- Session handoff provided by the user for “Fix tooling wrappers”.
- Related code: `justfile`
- Related code: `package.json`
- Related code: `tsconfig.json`
- Related code: `tsconfig.web.json`
- Related code: `biome.json`
- Related code: `README.md`
- Related code: `AGENTS.md`
- Related code: `CLAUDE.md`
- Related code: `Procfile`
- Related code: `.github/workflows/release.yml`
- Institutional learning: `docs/solutions/feature-patterns/2026-04-15-shared-primitives-react-audit.md`
- Institutional learning: `docs/solutions/correctness/enforce-strict-upgrade-domain-contracts-in-config-and-db-sch.md`
