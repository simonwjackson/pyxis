import type { RouterHistory } from "@tanstack/history";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { type MountPyxisOptions, mountPyxis } from "../mountPyxis";
import {
  type PyxisLabStateAxis,
  pyxisAxesForScreen,
  registerPyxisCaliperRegistry,
} from "./pyxis-axes";
import { makePyxisSeedInitialValues } from "./pyxis-seed";
import {
  PYXIS_CALIPER_DEVICES,
  PYXIS_CALIPER_KNOBS,
  PYXIS_DEFAULT_PX_PER_MM,
  type PyxisCaliperDeviceConfig,
  type PyxisCaliperKnob,
} from "./pyxisConfig";

interface PyxisLabSurfaceAdapter {
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

export const pyxisLabSurfaceAdapter: PyxisLabSurfaceAdapter = {
  id: "pyxis",
  devices: PYXIS_CALIPER_DEVICES,
  defaultPxPerMm: PYXIS_DEFAULT_PX_PER_MM,
  knobs: PYXIS_CALIPER_KNOBS,
  screens: [
    { label: "Home", path: "/", pagePartId: "pyxis.home" },
    { label: "Queue", path: "/sandbox/queue", pagePartId: "pyxis.queue" },
    { label: "Search", path: "/search" },
    { label: "Stations", path: "/stations" },
    { label: "Settings", path: "/settings" },
  ],
  sources: [
    {
      id: "fixture-home",
      label: "Fixture home source",
      description:
        "Pinned Home shelf data through Pyxis's real Effect atom source edge.",
    },
    {
      id: "fixture-queue",
      label: "Fixture queue source",
      description:
        "Pinned queue snapshot through Pyxis's real queue-stream source edge.",
    },
  ],
  axesForScreen: pyxisAxesForScreen,
  makeSeedInitialValues: async () => makePyxisSeedInitialValues(),
  makeSeedInitialValuesForBinding: async () => makePyxisSeedInitialValues(),
  mountSurface: (host, options) => {
    let unregisterRegistry = () => {};
    const mountOptions: MountPyxisOptions = {
      data: { initialValues: options.initialValues as never },
      ...(options.history ? { navigation: { history: options.history } } : {}),
      onRegistry: (registry: AtomRegistry.AtomRegistry) => {
        unregisterRegistry();
        unregisterRegistry = registerPyxisCaliperRegistry(registry);
        options.onRegistry?.(registry);
      },
    };
    const mounted = mountPyxis(host, mountOptions);
    return {
      router: mounted.router,
      dispose: () => {
        unregisterRegistry();
        mounted.dispose();
      },
    };
  },
};
