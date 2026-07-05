import type { RouterHistory } from "@tanstack/history";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import { mountPyxis, type MountPyxisOptions } from "../mountPyxis";
import {
  HOME_FIXTURE_STATES,
  type HomeFixtureState,
} from "@app/features/home/homeSource";
import {
  type PyxisLabStateAxis,
  pyxisAxesForScreen,
  registerPyxisCaliperRegistry,
} from "./pyxis-axes";
import {
  PYXIS_CALIPER_DEVICES,
  PYXIS_CALIPER_KNOBS,
  PYXIS_DEFAULT_PX_PER_MM,
  type PyxisCaliperDeviceConfig,
  type PyxisCaliperKnob,
} from "./pyxisConfig";
import { makePyxisSeedInitialValues } from "./pyxis-seed";

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
  readonly states: readonly { readonly id: string; readonly label: string }[];
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
  ],
  states: HOME_FIXTURE_STATES.map((state) => ({
    id: state,
    label: state === "Empty" ? "Ready / empty" : state,
  })),
  axesForScreen: pyxisAxesForScreen,
  makeSeedInitialValues: async () => makePyxisSeedInitialValues("Ready"),
  makeSeedInitialValuesForBinding: async ({ stateId }) =>
    makePyxisSeedInitialValues(homeFixtureStateFromInput(stateId)),
  mountSurface: (host, options) => {
    let unregisterRegistry = () => {};
    const seedState = seedStateFromInitialValues(options.initialValues);
    const mountOptions: MountPyxisOptions = {
      data: { initialValues: options.initialValues as never },
      ...(options.history ? { navigation: { history: options.history } } : {}),
      onRegistry: (registry: AtomRegistry.AtomRegistry) => {
        unregisterRegistry();
        unregisterRegistry = registerPyxisCaliperRegistry(registry, seedState);
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

function homeFixtureStateFromInput(value: unknown): HomeFixtureState {
  return typeof value === "string" && isHomeFixtureState(value)
    ? value
    : "Ready";
}

function isHomeFixtureState(value: string): value is HomeFixtureState {
  return HOME_FIXTURE_STATES.includes(value as HomeFixtureState);
}

function seedStateFromInitialValues(initialValues: unknown): HomeFixtureState {
  if (!Array.isArray(initialValues)) return "Ready";
  for (const entry of initialValues) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const source = entry[1];
    const state = readFixtureState(source);
    if (state) return state;
  }
  return "Ready";
}

function readFixtureState(source: unknown): HomeFixtureState | null {
  if (typeof source !== "object" || source === null) return null;
  const serialized = JSON.stringify(source);
  for (const state of HOME_FIXTURE_STATES) {
    if (serialized.includes(`home fixture ${state.toLowerCase()}`)) {
      return state;
    }
  }
  return null;
}
