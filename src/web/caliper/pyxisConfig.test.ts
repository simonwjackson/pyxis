import { describe, expect, test } from "bun:test";
import {
  PYXIS_CALIPER_DEVICES,
  PYXIS_CALIPER_KNOBS,
  PYXIS_DEFAULT_PX_PER_MM,
  PYXIS_HERO_DEVICE_ID,
} from "./pyxisConfig";

describe("Pyxis Caliper config", () => {
  test("uses the NW-A306 as the hero device", () => {
    expect(PYXIS_CALIPER_DEVICES[0]?.id).toBe(PYXIS_HERO_DEVICE_ID);
    expect(PYXIS_CALIPER_DEVICES[0]?.name).toContain("NW-A306");
    expect(PYXIS_CALIPER_DEVICES[0]?.widthMm).toBeGreaterThan(40);
    expect(PYXIS_CALIPER_DEVICES[0]?.heightMm).toBeGreaterThan(75);
    expect(PYXIS_DEFAULT_PX_PER_MM).toBeGreaterThan(0);
  });

  test("defines unique knobs with real CSS-variable hooks", async () => {
    const css = await Bun.file(new URL("../index.css", import.meta.url)).text();
    const ids = new Set<string>();
    const vars = new Set<string>();

    for (const knob of PYXIS_CALIPER_KNOBS) {
      expect(ids.has(knob.id)).toBe(false);
      expect(vars.has(knob.cssVar)).toBe(false);
      ids.add(knob.id);
      vars.add(knob.cssVar);
      expect(knob.cssVar.startsWith("--pyxis-")).toBe(true);
      expect(css).toContain(`var(${knob.cssVar},`);
    }
  });
});
