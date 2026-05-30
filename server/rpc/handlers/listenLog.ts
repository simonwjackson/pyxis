/**
 * @module server/rpc/handlers/listenLog
 * Effect RPC handler for `listenLog.entries.list`. Mirrors
 * `server/routers/listenLog.ts`: read-only descending listing of the
 * append-only listen log with bounded pagination.
 */

import { Effect } from "effect";
import type { ApiListenLogInput } from "@shared/api/contracts/listenLog.js";
import { getDb } from "@shared/db/index.js";
import { publicHandler } from "../handler.js";

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const listenLogHandlers = () => ({
  "listenLog.entries.list": (payload: ApiListenLogInput) =>
    publicHandler(
      Effect.tryPromise({
        try: async () => {
          const db = await getDb();
          return db.listenLog.query({
            sort: { listenedAt: "desc" },
            limit: payload.limit ?? DEFAULT_LIMIT,
            offset: payload.offset ?? DEFAULT_OFFSET,
          }).runPromise;
        },
        catch: (cause) => cause,
      }),
    ),
});
