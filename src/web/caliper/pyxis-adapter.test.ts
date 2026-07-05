import { beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { HOME_FIXTURE_STATES } from "@app/features/home/homeSource";
import { PYXIS_HERO_DEVICE_ID } from "./pyxisConfig";

beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    GlobalRegistrator.register();
  }
});

describe("pyxisLabSurfaceAdapter", () => {
  test("renders Pyxis as a Caliper surface with the NW-A306 first", async () => {
    const { pyxisLabSurfaceAdapter } = await import("./pyxis-adapter");

    expect(pyxisLabSurfaceAdapter.id).toBe("pyxis");
    expect(pyxisLabSurfaceAdapter.devices[0]?.id).toBe(PYXIS_HERO_DEVICE_ID);
    expect(pyxisLabSurfaceAdapter.screens?.[0]?.path).toBe("/");
    expect(pyxisLabSurfaceAdapter.knobs?.length).toBeGreaterThan(0);
  });

  test("derives the Home axis from the real fixture source states", async () => {
    const { pyxisLabSurfaceAdapter } = await import("./pyxis-adapter");

    const axes = pyxisLabSurfaceAdapter.axesForScreen?.("/") ?? [];
    expect(axes).toHaveLength(1);
    expect(axes[0]?.states.map((state) => state.id)).toEqual([
      ...HOME_FIXTURE_STATES,
    ]);
    expect(pyxisLabSurfaceAdapter.axesForScreen?.("/settings") ?? []).toEqual(
      [],
    );
  });

  test("creates seed initial values for Caliper bindings", async () => {
    const { pyxisLabSurfaceAdapter } = await import("./pyxis-adapter");

    const initialValues = await pyxisLabSurfaceAdapter.makeSeedInitialValues();
    expect(Array.isArray(initialValues)).toBe(true);

    const loadErrorValues =
      await pyxisLabSurfaceAdapter.makeSeedInitialValuesForBinding?.({
        sourceId: "fixture-home",
        stateId: "LoadError",
      });
    expect(Array.isArray(loadErrorValues)).toBe(true);
  });
});
