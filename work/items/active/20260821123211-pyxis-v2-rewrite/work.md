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

**Milestone M1 — "A song plays" — shipped locally.** Product is running at
`http://127.0.0.1:5173` for validation. Next: **M2 / U8**.

Execution order is the `Shipping Milestones` table in `plan.md`, not numeric U-ID order.
Update this line when a milestone boundary is crossed. Per-unit progress comes from
`git log`, not from this file.

Ship only at a milestone boundary.
