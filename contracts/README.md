# Contracts

The Rust service owns the application protocol in
`services/pyxis/src/rpc/contract.rs`. `generated/pyxis.ts` and `generated/pyxis.schema.json`
are build artifacts and must not be edited by hand.

Regenerate both from the repository development shell:

```sh
services/pyxis/generate-contracts.sh
```

Verify that checked-in artifacts match Rust without changing them:

```sh
services/pyxis/generate-contracts.sh --check
```

`--check` runs as part of `just verify`.

## What each artifact is for

`pyxis.ts` provides compile-time request and response unions for TypeScript clients and
for the plugin SDK.

`pyxis.schema.json` is the runtime trust boundary. Clients validate responses against it
so a malformed or unrecognised payload is rejected instead of half-parsed. The service
worker cannot load the page's validator bundle, so it re-validates the handful of shapes
it consumes by hand, against this same schema as the reference.

## Wire conventions

- Request: `{ "_tag": "entity.concept.action", "payload": { ... } }`
- Response: `{ "_tag": "entity.concept.action", "outcome": { ... } }`
- Outcome: `{ "status": "...", "value": ... }`

Operations report failure inside the outcome rather than through transport status codes,
so a client handles one shape instead of two. Every operation has an `unavailable` outcome
carrying a failure envelope with a `retryable` flag, which lets an offline client decide
whether to keep a queued write or surface a permanent error.

Media bytes are outside this contract. They travel over plain HTTP at `/stream/:trackId`
so range requests, caching and speaker hardware work without protocol translation.
