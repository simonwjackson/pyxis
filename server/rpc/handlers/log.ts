/**
 * @module server/rpc/handlers/log
 * Effect RPC handler for `log.client.write`. Mirrors `server/routers/log.ts`:
 * receives a bounded client log message (already validated by
 * `ClientLogMessageSchema` at the contract boundary), writes it to the
 * playback logger as fire-and-forget structured output, and never echoes
 * the message back to the client.
 *
 * The contract caps the payload size, so this handler does not need to
 * truncate. The endpoint is intentionally cheap so client log bursts do not
 * block the RPC pipeline.
 */

import { Effect } from "effect";
import type { ApiClientLogInput } from "../../../src/api/contracts/log.js";
import { createLogger } from "../../../src/logger.js";

const log = createLogger("playback").child({ component: "client" });

export const logHandlers = () => ({
  "log.client.write": (payload: ApiClientLogInput) =>
    Effect.sync(() => {
      log.info({ clientMsg: payload.message }, "client log");
      return { ok: true as const };
    }),
});
