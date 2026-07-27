import { describe, expect, it } from "bun:test";
import { resolveBrowserOutputAuthority } from "./browserOutputAuthority.js";

describe("browser output authority", () => {
  it("allows only the selected Player client to realize local audio", () => {
    const output = {
      type: "browser",
      clientId: "client_owner",
      updatedAt: 1,
    } as const;
    expect(
      resolveBrowserOutputAuthority("player", output, "client_owner"),
    ).toEqual({
      ownsLocalPlayback: true,
      canSelectLocalOutput: true,
    });
    expect(
      resolveBrowserOutputAuthority("player", output, "client_other")
        .ownsLocalPlayback,
    ).toBe(false);
  });

  it("never permits local output in Console mode", () => {
    const output = {
      type: "browser",
      clientId: "client_console",
      updatedAt: 1,
    } as const;
    expect(
      resolveBrowserOutputAuthority("console", output, "client_console"),
    ).toEqual({
      ownsLocalPlayback: false,
      canSelectLocalOutput: false,
    });
  });
});
