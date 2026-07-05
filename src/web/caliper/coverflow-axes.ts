/**
 * @module coverflow-axes
 *
 * The state axis for the standalone Queue cover-flow lab surface. Pinning a
 * state writes a fixture queue source into every mounted coverflow registry
 * through the real writable `queueCoverflowSourceAtom`; releasing restores the
 * default fixture.
 */

import {
  makeQueueCoverflowFixtureSource,
  QUEUE_COVERFLOW_FIXTURE_STATES,
  type QueueCoverflowFixtureState,
  queueCoverflowSourceAtom,
} from "@app/features/sandbox/QueueCoverflow/queueCoverflowSource";
import type * as Atom from "effect/unstable/reactivity/Atom";
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import type { PyxisLabStateAxis } from "./pyxis-axes";

const mountedRegistries = new Set<AtomRegistry.AtomRegistry>();

export function registerCoverflowRegistry(
  registry: AtomRegistry.AtomRegistry,
): () => void {
  mountedRegistries.add(registry);
  return () => {
    mountedRegistries.delete(registry);
  };
}

export function coverflowAxesForScreen(
  screenPath: string,
): readonly PyxisLabStateAxis[] {
  if (screenPath !== "/") return [];
  return [queueSourceAxis];
}

const queueSourceAxis: PyxisLabStateAxis = {
  id: "coverflow-source-state",
  kind: "single",
  label: "Queue source",
  liveLabel: "Live queue",
  states: QUEUE_COVERFLOW_FIXTURE_STATES.map((state) => ({
    id: state,
    label: state === "Empty" ? "Ready / empty" : state,
  })),
  pin: (stateId) => {
    if (!isQueueFixtureState(stateId)) return;
    writeSource(makeQueueCoverflowFixtureSource(stateId));
  },
  release: () => {
    writeSource(makeQueueCoverflowFixtureSource("Ready"));
  },
};

function writeSource(value: unknown): void {
  for (const registry of mountedRegistries) {
    registry.set(
      queueCoverflowSourceAtom as unknown as Atom.Writable<unknown, unknown>,
      value,
    );
  }
}

function isQueueFixtureState(
  state: string,
): state is QueueCoverflowFixtureState {
  return QUEUE_COVERFLOW_FIXTURE_STATES.includes(
    state as QueueCoverflowFixtureState,
  );
}
