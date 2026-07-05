/**
 * @module pyxis-lab-sources
 *
 * Declares the real per-screen source-layer edges the Caliper lab can pin to
 * fixture states. Each entry names the writable source atom, its screen, and
 * the fixture builder — so axes, seeds, and the adapter all derive from one
 * list and a new surface is a single entry.
 */

import {
  HOME_FIXTURE_STATES,
  type HomeFixtureState,
  homeSourceAtom,
  makeHomeFixtureSource,
} from "@app/features/home/homeSource";
import {
  makeQueueCoverflowFixtureSource,
  QUEUE_COVERFLOW_FIXTURE_STATES,
  type QueueCoverflowFixtureState,
  queueCoverflowSourceAtom,
} from "@app/features/sandbox/QueueCoverflow/queueCoverflowSource";
import type { Atom } from "effect/unstable/reactivity";

export interface PyxisLabSource {
  readonly axisId: string;
  readonly label: string;
  readonly liveLabel: string;
  readonly screenPath: string;
  readonly atom: Atom.Writable<unknown, unknown>;
  readonly states: readonly string[];
  readonly defaultState: string;
  readonly makeFixture: (state: string) => unknown;
}

function labelForState(state: string): string {
  return state === "Empty" ? "Ready / empty" : state;
}

export function stateOptions(
  source: PyxisLabSource,
): readonly { readonly id: string; readonly label: string }[] {
  return source.states.map((id) => ({ id, label: labelForState(id) }));
}

const homeLabSource: PyxisLabSource = {
  axisId: "home-source-state",
  label: "Home source",
  liveLabel: "Live RPC",
  screenPath: "/",
  atom: homeSourceAtom as unknown as Atom.Writable<unknown, unknown>,
  states: HOME_FIXTURE_STATES,
  defaultState: "Ready",
  makeFixture: (state) => makeHomeFixtureSource(state as HomeFixtureState),
};

const queueLabSource: PyxisLabSource = {
  axisId: "queue-source-state",
  label: "Queue source",
  liveLabel: "Live queue",
  screenPath: "/sandbox/queue",
  atom: queueCoverflowSourceAtom as unknown as Atom.Writable<unknown, unknown>,
  states: QUEUE_COVERFLOW_FIXTURE_STATES,
  defaultState: "Ready",
  makeFixture: (state) =>
    makeQueueCoverflowFixtureSource(state as QueueCoverflowFixtureState),
};

export const PYXIS_LAB_SOURCES: readonly PyxisLabSource[] = [
  homeLabSource,
  queueLabSource,
];
