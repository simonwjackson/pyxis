/**
 * @module pyxis-axes
 *
 * Turns the declared {@link PYXIS_LAB_SOURCES} into per-screen state axes the
 * Caliper lab can pin. Pinning a state writes the source's fixture into every
 * mounted Pyxis registry through the real writable source atom; releasing
 * restores the source's default fixture.
 */

import type * as Atom from "effect/unstable/reactivity/Atom";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import {
  PYXIS_LAB_SOURCES,
  type PyxisLabSource,
  stateOptions,
} from "./pyxis-lab-sources";

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

const mountedRegistries = new Set<AtomRegistry.AtomRegistry>();

export function registerPyxisCaliperRegistry(
  registry: AtomRegistry.AtomRegistry,
): () => void {
  mountedRegistries.add(registry);
  return () => {
    mountedRegistries.delete(registry);
  };
}

export function pyxisAxesForScreen(
  screenPath: string,
): readonly PyxisLabStateAxis[] {
  return PYXIS_LAB_SOURCES.filter(
    (source) => source.screenPath === screenPath,
  ).map(sourceToAxis);
}

function sourceToAxis(source: PyxisLabSource): PyxisLabStateAxis {
  return {
    id: source.axisId,
    kind: "single",
    label: source.label,
    liveLabel: source.liveLabel,
    states: stateOptions(source),
    pin: (stateId) => {
      if (!source.states.includes(stateId)) return;
      writeSource(source, source.makeFixture(stateId));
    },
    release: () => {
      writeSource(source, source.makeFixture(source.defaultState));
    },
  };
}

function writeSource(source: PyxisLabSource, value: unknown): void {
  for (const registry of mountedRegistries) {
    registry.set(source.atom as Atom.Writable<unknown, unknown>, value);
  }
}
