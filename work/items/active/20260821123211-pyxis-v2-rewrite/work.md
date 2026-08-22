---
id: 20260821123211-pyxis-v2-rewrite
title: "Pyxis v2: account-scoped music service with plugin sources and offline clients"
type: feat
status: active
created: 2026-08-21
parent: none
---

# Pyxis v2 rewrite

Big-bang ground-up rewrite. No v1 compatibility.

## Artifacts

- `plan.md` — the authoritative plan. Read it in full before working.

## Origin

Shaped through conversation on 2026-08-21. There is no upstream requirements document;
requirements and decisions were captured directly into `plan.md` sections
`Requirements` and `Decision Log`.

## Current position

**Milestone M2 implementation is complete locally. Tailnet activation is pending the
external `mountainous` deployment.** The live 386-entry legacy manifest is fully accounted:
370 albums are in Discovery, 16 remain unresolved after manual review, and no import
request failed. The durable audit is
`docs/operations/2026-08-21-v1-album-import.md`.

The packaged product reopened the completed `~/.local/share/pyxis` store at
`http://127.0.0.1:4491`. The old system `pyxis.service` and
`tsnet-proxy-pyxis.service` units remain active and conflict with the new user units. The
user owns their removal through the pending `mountainous` deployment.

Next: validate M2 through `https://pyxis.hummingbird-lake.ts.net`, then execute **M3 / U5**.

Execution order is the `Shipping Milestones` table in `plan.md`, not numeric U-ID order.
Per-unit progress comes from `git log`, not from this file.

Ship only at a milestone boundary.
