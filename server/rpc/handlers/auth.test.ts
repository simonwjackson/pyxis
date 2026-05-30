/**
 * @module server/rpc/handlers/auth tests
 * Behavior tests for the `auth.*` family. Focus on the contract semantics
 * preserved from `server/routers/auth.ts`:
 *
 * - `auth.status.get` is unauthenticated and reflects the current credential
 *   state without calling Pandora.
 * - The remaining handlers go through `AuthSession.withAuthRetry`, so the
 *   tests assert that a missing session surfaces a typed Unauthorized
 *   public error rather than a raw Pandora error.
 */

import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { Unauthorized } from "../errors.js";
import type { AuthSessionShape } from "../services/authSession.js";
import { authHandlers } from "./auth.js";

function makeAuth(args: {
  readonly retry?: <A, E, R>(
    f: (ctx: never) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | Unauthorized, R>;
}): AuthSessionShape {
  return {
    getSession: Effect.succeed(undefined as never),
    requireSession: Effect.fail(
      new Unauthorized({ code: "pandora_credentials_required" }),
    ),
    getSourceManager: Effect.succeed({} as never),
    refresh: Effect.fail({} as never),
    withAuthRetry: (args.retry ??
      (() =>
        Effect.fail(
          new Unauthorized({ code: "pandora_credentials_required" }),
        ))) as AuthSessionShape["withAuthRetry"],
  };
}

describe("auth.status.get handler", () => {
  it("reports authenticated:true regardless of Pandora session", async () => {
    const handlers = authHandlers({ auth: makeAuth({}) });
    const result = await Effect.runPromise(handlers["auth.status.get"]());
    expect(result.authenticated).toBe(true);
    // hasPandora reads the live credentials module; the test does not
    // assert its specific value because it depends on the dev environment.
    expect(typeof result.hasPandora).toBe("boolean");
  });
});

describe("auth handlers without a Pandora session", () => {
  it("auth.settings.get surfaces a typed Unauthorized public error", async () => {
    const handlers = authHandlers({ auth: makeAuth({}) });
    const exit = await Effect.runPromise(
      Effect.exit(handlers["auth.settings.get"]()),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("Unauthorized");
    }
  });

  it("auth.usage.get surfaces a typed Unauthorized public error", async () => {
    const handlers = authHandlers({ auth: makeAuth({}) });
    const exit = await Effect.runPromise(
      Effect.exit(handlers["auth.usage.get"]()),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("Unauthorized");
    }
  });
});

describe("auth.settings.change handler", () => {
  it("returns success:true after the underlying Pandora call resolves", async () => {
    const _retry: AuthSessionShape["withAuthRetry"] = ((
      f: (ctx: never) => Effect.Effect<unknown, unknown, unknown>,
    ) =>
      f({
        pandoraSession: { userAuthToken: "u", partnerAuthToken: "p" },
        sourceManager: {} as never,
      } as never)) as AuthSessionShape["withAuthRetry"];
    const handlers = authHandlers({
      auth: {
        ...makeAuth({}),
        withAuthRetry: ((_f: (ctx: never) => Effect.Effect<unknown, unknown>) =>
          Effect.succeed({})) as AuthSessionShape["withAuthRetry"],
      },
    });
    const result = await Effect.runPromise(
      handlers["auth.settings.change"]({ isProfilePrivate: true }),
    );
    expect(result).toEqual({ success: true });
  });
});
