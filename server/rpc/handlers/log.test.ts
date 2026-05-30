/**
 * @module server/rpc/handlers/log tests
 * Contract behavior tests for `log.client.write`. The handler is a tiny
 * fire-and-forget wrapper around the structured logger, so the assertion
 * surface is intentionally narrow: well-formed payloads return `ok: true`,
 * and the contract rejects oversized/empty payloads before the handler is
 * even constructed.
 */

import { describe, expect, it } from "bun:test";
import { Effect, Exit, Schema } from "effect";
import { ClientLogInputSchema } from "@shared/api/contracts/log.js";
import { logHandlers } from "./log.js";

const handlers = logHandlers();

describe("log.client.write handler", () => {
  it("returns ok: true for a valid payload", async () => {
    const result = await Effect.runPromise(
      handlers["log.client.write"]({ message: "hello world" }),
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejects empty messages at the contract boundary", () => {
    const exit = Schema.decodeUnknownExit(ClientLogInputSchema)({
      message: "",
    });
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("rejects messages that exceed the configured size cap", () => {
    const exit = Schema.decodeUnknownExit(ClientLogInputSchema)({
      message: "a".repeat(4097),
    });
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
