import { beforeAll, describe, expect, test } from "bun:test";
import { HOME_FIXTURE_STATES } from "@app/features/home/homeSource";
import { QUEUE_COVERFLOW_FIXTURE_STATES } from "@app/features/sandbox/QueueCoverflow/queueCoverflowSource";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
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

  test("exposes the Queue cover-flow as a lab screen", async () => {
    const { pyxisLabSurfaceAdapter } = await import("./pyxis-adapter");

    const queue = pyxisLabSurfaceAdapter.screens.find(
      (screen) => screen.path === "/sandbox/queue",
    );
    expect(queue?.label).toBe("Queue");
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

  test("derives the Queue axis from the real queue fixture states", async () => {
    const { pyxisLabSurfaceAdapter } = await import("./pyxis-adapter");

    const axes = pyxisLabSurfaceAdapter.axesForScreen?.("/sandbox/queue") ?? [];
    expect(axes).toHaveLength(1);
    expect(axes[0]?.id).toBe("queue-source-state");
    expect(axes[0]?.states.map((state) => state.id)).toEqual([
      ...QUEUE_COVERFLOW_FIXTURE_STATES,
    ]);
  });

  test("creates seed initial values for Caliper bindings", async () => {
    const { pyxisLabSurfaceAdapter } = await import("./pyxis-adapter");

    const initialValues = await pyxisLabSurfaceAdapter.makeSeedInitialValues();
    expect(Array.isArray(initialValues)).toBe(true);

    const loadErrorValues =
      await pyxisLabSurfaceAdapter.makeSeedInitialValuesForBinding?.({
        sourceId: "fixture-queue",
        stateId: "LoadError",
      });
    expect(Array.isArray(loadErrorValues)).toBe(true);
  });
});
