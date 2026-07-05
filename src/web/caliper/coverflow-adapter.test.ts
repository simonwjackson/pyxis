import { beforeAll, describe, expect, test } from "bun:test";
import { QUEUE_COVERFLOW_FIXTURE_STATES } from "@app/features/sandbox/QueueCoverflow/queueCoverflowSource";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { PYXIS_HERO_DEVICE_ID } from "./pyxisConfig";

beforeAll(() => {
  if (typeof globalThis.window === "undefined") {
    GlobalRegistrator.register();
  }
});

describe("coverflowLabSurfaceAdapter", () => {
  test("is its own lab surface with a single Coverflow screen", async () => {
    const { coverflowLabSurfaceAdapter } = await import("./coverflow-adapter");

    expect(coverflowLabSurfaceAdapter.id).toBe("coverflow");
    expect(coverflowLabSurfaceAdapter.devices[0]?.id).toBe(
      PYXIS_HERO_DEVICE_ID,
    );
    expect(coverflowLabSurfaceAdapter.screens).toHaveLength(1);
    expect(coverflowLabSurfaceAdapter.screens[0]?.path).toBe("/");
    expect(coverflowLabSurfaceAdapter.knobs.length).toBeGreaterThan(0);
  });

  test("exposes the queue source axis with every fixture state", async () => {
    const { coverflowLabSurfaceAdapter } = await import("./coverflow-adapter");

    const axes = coverflowLabSurfaceAdapter.axesForScreen("/");
    expect(axes).toHaveLength(1);
    expect(axes[0]?.id).toBe("coverflow-source-state");
    expect(axes[0]?.states.map((state) => state.id)).toEqual([
      ...QUEUE_COVERFLOW_FIXTURE_STATES,
    ]);
    expect(coverflowLabSurfaceAdapter.axesForScreen("/other")).toEqual([]);
  });

  test("seeds the queue source fixture for the surface mount", async () => {
    const { coverflowLabSurfaceAdapter } = await import("./coverflow-adapter");

    const initialValues =
      await coverflowLabSurfaceAdapter.makeSeedInitialValues();
    expect(Array.isArray(initialValues)).toBe(true);
    expect((initialValues as unknown[]).length).toBe(1);
  });
});
