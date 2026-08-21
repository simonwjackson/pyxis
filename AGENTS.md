# Agent instructions

## Read this first, every session

This repository is a ground-up rewrite executed across a long, repeatedly compacted
session. Conversation history is not durable. The plan is.

Before doing anything else:

1. Read `work/items/active/20260821123211-pyxis-v2-rewrite/plan.md` in full.
2. Read the `Decision Log` section of that plan. Every decision there is settled.
   Do not re-open a settled decision without the user explicitly asking.
3. Run `git log --oneline -20` to see what has actually landed.
4. Read `work/items/active/20260821123211-pyxis-v2-rewrite/work.md` for the current unit.

Progress is derived from git, not from checkboxes. A unit is done when its commit exists
and its verification holds, not when someone ticked a box.

## Hard rules

- **No v1 compatibility, ever.** The `legacy` branch holds v1. Nothing on `main` reads
  v1 data formats, v1 ids, or v1 wire shapes. No `LEGACY_*` constants. No migration
  shims inside the service.
- **The core must run with zero plugins installed.** Any core code that assumes a
  specific plugin exists is a bug. Core degrades honestly instead.
- **Media bytes never cross the plugin stdio boundary.** Plugins return a URL plus
  headers, or a local file path. Never a byte stream over stdio.
- **UI visual design is out of scope.** This session builds the service, the protocol,
  the client data plane, and a deliberately ugly reference client. A separate model
  designs the real interface later, on top of the documented worker API. Do not spend
  effort on styling, layout, or visual polish.
- **Generated contracts are read-only.** Edit `services/pyxis/src/rpc/contract.rs`, then
  regenerate. Never hand-edit `contracts/generated/`.
- **Soulseek never uploads.** No share directory, no upload path, no ratio negotiation.

## Working posture

- Follow the `Shipping Milestones` table in `plan.md`. Execution order is milestone order,
  not numeric U-ID order.
- Ship only at a milestone boundary, when there is a product the user can validate. Do not
  stop between units inside a milestone.
- One unit is one atomic commit. Conventional commit format.
- Every feature-bearing unit lands with its tests in the same commit.
- When a unit reveals that the plan is wrong, update the plan in the same commit and say
  so in the commit body. The plan is a living document, not a historical record.
- Capture out-of-scope discoveries in the plan's `Deferred to Follow-Up Work` section
  rather than widening the current unit.

## Verification

Run before considering any unit complete:

```sh
just verify        # typecheck, lint, test, contract --check
```

Individual gates are documented in the plan under each unit's Verification field.

## Deployment

Development installs via `nix profile` plus `systemctl --user` units. A NixOS module
comes later and is explicitly out of scope for v1. The previous NixOS wiring has already
been removed from the `mountainous` repository.
