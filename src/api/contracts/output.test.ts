import { describe, expect, it } from "bun:test";
import { Schema } from "effect";
import {
  PlaybackOutputStateSchema,
  SelectBrowserOutputInputSchema,
} from "./output.js";

describe("playback output contracts", () => {
  it("represents unavailable Sonos without changing the selection", () => {
    expect(
      Schema.decodeUnknownSync(PlaybackOutputStateSchema)({
        type: "sonos",
        roomUuid: "RINCON_KITCHEN",
        roomName: null,
        coordinatorUuid: null,
        coordinatorName: null,
        available: false,
        updatedAt: 123,
      }),
    ).toMatchObject({ type: "sonos", available: false });
  });

  it("requires a stable browser client id and server authorization", () => {
    expect(() =>
      Schema.decodeUnknownSync(SelectBrowserOutputInputSchema)({
        clientId: "",
      }),
    ).toThrow();
    expect(
      Schema.decodeUnknownSync(SelectBrowserOutputInputSchema)({
        clientId: "client_player",
        authorization: "player-authorization-token",
      }),
    ).toMatchObject({ clientId: "client_player" });
  });
});
