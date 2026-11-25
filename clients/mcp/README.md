# Pyxis MCP server

Point a native MCP agent at `http://127.0.0.1:4489/mcp`. Set its `Authorization` header
on **every request** to `Bearer <Pyxis API token>` from `auth.token.create`. `system.status`
reads the core's version, contract and installed capabilities, even with no plugins installed.

## Run

```sh
nix run .#pyxis-mcp
# Or, from the repo root inside nix develop:
bun install --frozen-lockfile
bun run --cwd clients/mcp start
```

| Setting | Default | Purpose |
|---|---|---|
| `PYXIS_MCP_HOST` | `127.0.0.1` | MCP listener address |
| `PYXIS_MCP_PORT` | `4489` | MCP listener port |
| `PYXIS_BASE_URL` | `http://127.0.0.1:4488` | Trusted Pyxis origin, without path or credentials |

`GET /healthz` returns `200` while the MCP listener is running. It does not check upstream
health. Keep the listener on loopback behind a trusted TLS edge when serving remote agents;
protect the MCP-to-core hop too. Requests with a browser `Origin` are not supported.

## Wire contract

The [v2 SDK](https://ts.sdk.modelcontextprotocol.io/v2/serving/http) handles
[2026-07-28 Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).
Each POST stands alone. Send the per-request `_meta` envelope and its mirrored headers,
including `Mcp-Method` and (for `tools/call`) `Mcp-Name`. `server/discover` is available
but not required. There is no legacy `initialize`, session ID or stored client identity.

This private adapter uses Pyxis API keys per D29, **not the optional MCP OAuth flow**.
Neither the server nor its deployment needs a Pyxis service credential. Only the configured
origin receives the agent's bearer; redirects are disabled. Use one narrowly scoped token
per agent, not a device token. See [Pyxis authentication](../../docs/api/authentication.md).

`system.status.get` on the core is public. To check revocation even on public reads and
MCP metadata calls, the adapter probes the protected `account.list` once per request. It
discards the result. `auth.insufficientScope` from that probe proves authentication; the
agent need not have `account:read`. Missing or revoked credentials get HTTP 401 before MCP
dispatch. Each tool operation still runs under the same caller's real Pyxis scopes. During
a tool call, `RpcFailure` becomes `isError: true` with `code`, `message` and `retryable` in
`structuredContent` and text.

## Add a tool

1. Put the tool in its area under `src/tools/` (`playback/` or `library/`). Follow
   `src/tools/system.ts`: register with the SDK, declare an input schema, wrap execution
   in `runTool`, and use the request's `PyxisClient.call` with a generated `_tag` and payload.
   Handle typed domain outcomes such as `unknown` and `noSources`; do not turn them into
   successful empty results. Never retain the client between requests.
2. Import and invoke the area's registration function in `src/tools/registry.ts` once.
   Additional tools in that area change only its own module. U49 can register resources
   and prompts in the per-request server factory without changing tool registration.
3. Before a destructive action, takeover or ambiguous target, call `confirmAction(ctx,
   message)` and **return its result if present**, before any write. Name the proposed
   action and resolved target (including ID) in the message. The helper requests form input
   via [MRTR](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr);
   an explicit no/cancel makes no change. If the client lacks form support, proceed (D27).
   This is a user prompt, not authorization. Core account/scopes always govern the write.
4. Run `bun run --cwd clients/mcp test` inside `nix develop`. `test/harness.ts` starts the
   repo's Rust core on a fresh store, empty plugin path and OS-assigned port, then makes a
   new account, device grant and scoped API token via RPC. Use `startHarness({ scopes })`,
   seed data with `owner.call`, send wire requests with `post`, and `await close()` in
   teardown. A suite needing real plugin fixtures can install them under `plugins/` with
   `prepareState` before boot; the default is zero plugins.
