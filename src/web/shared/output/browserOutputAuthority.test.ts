import { describe, expect, it } from "bun:test";
import { resolveBrowserOutputAuthority } from "./browserOutputAuthority.js";

const standard = {
  name: "standard",
  localOutputAllowed: true,
  sonosRequired: false,
} as const;
const wall = {
  name: "wall-sonos",
  localOutputAllowed: false,
  sonosRequired: true,
} as const;

describe("browser output authority", () => {
  it("allows only the selected browser client to realize local audio", () => {
    const output = { type: "browser", clientId: "client_owner", updatedAt: 1 } as const;
    expect(resolveBrowserOutputAuthority(standard, output, "client_owner")).toEqual({
      ownsLocalPlayback: true,
      canSelectLocalOutput: true,
    });
    expect(resolveBrowserOutputAuthority(standard, output, "client_other").ownsLocalPlayback).toBe(false);
  });

  it("never permits local output for the wall Sonos profile", () => {
    const output = { type: "browser", clientId: "client_wall", updatedAt: 1 } as const;
    expect(resolveBrowserOutputAuthority(wall, output, "client_wall")).toEqual({
      ownsLocalPlayback: false,
      canSelectLocalOutput: false,
    });
  });
});
