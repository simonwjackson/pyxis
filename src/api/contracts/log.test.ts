import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import { ClientLogInputSchema } from "./log.js";

describe("client log API contract", () => {
  it("accepts a non-empty bounded message", () => {
    expect(
      Schema.decodeUnknownSync(ClientLogInputSchema)({ message: "hello" }),
    ).toEqual({ message: "hello" });
  });

  it("rejects empty client log messages", () => {
    expect(() =>
      Schema.decodeUnknownSync(ClientLogInputSchema)({ message: "" }),
    ).toThrow();
  });

  it("rejects oversized client log messages", () => {
    expect(() =>
      Schema.decodeUnknownSync(ClientLogInputSchema)({
        message: "x".repeat(4097),
      }),
    ).toThrow();
  });
});
