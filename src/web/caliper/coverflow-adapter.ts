/**
 * @module coverflow-adapter
 *
 * Caliper surface adapter for the Queue cover-flow, mounted as its own lab
 * surface (`themeId=coverflow`, e.g. /lab/none/coverflow/). It renders the real
 * page through {@link mountCoverflow} and exposes the queue source-state axis
 * so the design can be driven through every state at true device size.
 */

import {
  makeQueueCoverflowFixtureSource,
  queueCoverflowSourceAtom,
} from "@app/features/sandbox/QueueCoverflow/queueCoverflowSource";
import type { RouterHistory } from "@tanstack/history";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import {
  coverflowAxesForScreen,
  registerCoverflowRegistry,
} from "./coverflow-axes";
import { mountCoverflow } from "./mountCoverflow";
import type { PyxisLabStateAxis } from "./pyxis-axes";
import {
  PYXIS_CALIPER_DEVICES,
  PYXIS_CALIPER_KNOBS,
  PYXIS_DEFAULT_PX_PER_MM,
  type PyxisCaliperDeviceConfig,
  type PyxisCaliperKnob,
} from "./pyxisConfig";

interface CoverflowLabSurfaceAdapter {
  readonly id: string;
  readonly devices: readonly PyxisCaliperDeviceConfig[];
  readonly defaultPxPerMm: number;
  readonly knobs: readonly PyxisCaliperKnob[];
  readonly screens: readonly {
    readonly label: string;
    readonly path: string;
    readonly pagePartId?: string;
  }[];
  readonly sources: readonly {
    readonly id: string;
    readonly label: string;
    readonly description?: string;
  }[];
  readonly axesForScreen: (screenPath: string) => readonly PyxisLabStateAxis[];
  readonly makeSeedInitialValues: () => Promise<unknown>;
  readonly makeSeedInitialValuesForBinding: (binding: {
    readonly sourceId: string;
    readonly stateId: unknown;
  }) => Promise<unknown>;
  readonly mountSurface: (
    host: HTMLElement,
    options: {
      readonly initialValues: unknown;
      readonly history?: RouterHistory;
      readonly onRegistry?: (registry: unknown) => void;
    },
  ) => { readonly router: unknown; readonly dispose: () => void };
}

function coverflowSeedInitialValues(): readonly (readonly [
  unknown,
  unknown,
])[] {
  return [[queueCoverflowSourceAtom, makeQueueCoverflowFixtureSource("Ready")]];
}

export const coverflowLabSurfaceAdapter: CoverflowLabSurfaceAdapter = {
  id: "coverflow",
  devices: PYXIS_CALIPER_DEVICES,
  defaultPxPerMm: PYXIS_DEFAULT_PX_PER_MM,
  knobs: PYXIS_CALIPER_KNOBS,
  screens: [{ label: "Coverflow", path: "/", pagePartId: "coverflow" }],
  sources: [
    {
      id: "fixture-queue",
      label: "Fixture queue source",
      description:
        "Pinned queue snapshot through Pyxis's real queue-stream source edge.",
    },
  ],
  axesForScreen: coverflowAxesForScreen,
  makeSeedInitialValues: async () => coverflowSeedInitialValues(),
  makeSeedInitialValuesForBinding: async () => coverflowSeedInitialValues(),
  mountSurface: (host, options) => {
    let unregisterRegistry = () => {};
    const mounted = mountCoverflow(host, {
      initialValues: options.initialValues as never,
      onRegistry: (registry: AtomRegistry.AtomRegistry) => {
        unregisterRegistry();
        unregisterRegistry = registerCoverflowRegistry(registry);
        options.onRegistry?.(registry);
      },
    });
    return {
      router: null,
      dispose: () => {
        unregisterRegistry();
        mounted.dispose();
      },
    };
  },
};
