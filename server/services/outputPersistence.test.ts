import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadPlaybackOutputSelection,
  savePlaybackOutputSelection,
} from "./outputPersistence.js";

const dirs: string[] = [];
function path(): string {
  const dir = mkdtempSync(join(tmpdir(), "pyxis-output-"));
  dirs.push(dir);
  return join(dir, "output.yaml");
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("playback output persistence", () => {
  it("round trips the stable Sonos room anchor", () => {
    const file = path();
    savePlaybackOutputSelection(
      { type: "sonos", roomUuid: "RINCON_KITCHEN", updatedAt: 123 },
      file,
    );
    expect(loadPlaybackOutputSelection(file)).toEqual({
      type: "sonos",
      roomUuid: "RINCON_KITCHEN",
      updatedAt: 123,
    });
  });

  it("fails closed to no output for malformed state", () => {
    const file = path();
    writeFileSync(file, "type: browser\nclientId: ''\nupdatedAt: 1\n");
    expect(loadPlaybackOutputSelection(file)).toEqual({
      type: "none",
      updatedAt: 0,
    });
  });
});
