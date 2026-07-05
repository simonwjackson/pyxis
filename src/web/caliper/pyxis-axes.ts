import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import {
  HOME_FIXTURE_STATES,
  type HomeFixtureState,
  homeSourceAtom,
  makeHomeFixtureSource,
} from "@app/features/home/homeSource";

export interface PyxisLabStateAxisContext {
  readonly scopeId?: string;
}

export interface PyxisLabStateAxis {
  readonly id: string;
  readonly kind: "single" | "multi";
  readonly label: string;
  readonly liveLabel: string;
  readonly states: readonly { readonly id: string; readonly label: string }[];
  readonly pin: (stateId: string, context?: PyxisLabStateAxisContext) => void;
  readonly release: (context?: PyxisLabStateAxisContext) => void;
}

interface MountedPyxisRegistry {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly seedState: HomeFixtureState;
}

const mountedRegistries = new Set<MountedPyxisRegistry>();

export function registerPyxisCaliperRegistry(
  registry: AtomRegistry.AtomRegistry,
  seedState: HomeFixtureState,
): () => void {
  const entry = { registry, seedState };
  mountedRegistries.add(entry);
  return () => mountedRegistries.delete(entry);
}

export function pyxisAxesForScreen(
  screenPath: string,
): readonly PyxisLabStateAxis[] {
  if (screenPath !== "/") return [];
  return [homeSourceAxis];
}

const homeSourceAxis: PyxisLabStateAxis = {
  id: "home-source-state",
  kind: "single",
  label: "Home source",
  liveLabel: "Live RPC",
  states: HOME_FIXTURE_STATES.map((state) => ({
    id: state,
    label: state === "Empty" ? "Ready / empty" : state,
  })),
  pin: (stateId, context) => {
    if (!isHomeFixtureState(stateId)) return;
    writeHomeSourceState(stateId, context);
  },
  release: (context) => {
    forEachTargetRegistry(context, ({ registry, seedState }) => {
      registry.set(homeSourceAtom, makeHomeFixtureSource(seedState));
    });
  },
};

function writeHomeSourceState(
  state: HomeFixtureState,
  context?: PyxisLabStateAxisContext,
): void {
  forEachTargetRegistry(context, ({ registry }) => {
    registry.set(homeSourceAtom, makeHomeFixtureSource(state));
  });
}

function forEachTargetRegistry(
  _context: PyxisLabStateAxisContext | undefined,
  run: (entry: MountedPyxisRegistry) => void,
): void {
  for (const entry of mountedRegistries) run(entry);
}

function isHomeFixtureState(state: string): state is HomeFixtureState {
  return HOME_FIXTURE_STATES.includes(state as HomeFixtureState);
}
