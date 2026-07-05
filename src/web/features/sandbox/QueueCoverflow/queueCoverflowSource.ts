/**
 * @module queueCoverflowSource
 *
 * The swappable last-mile data edge for the Queue cover-flow surface. In
 * production the source reads the authoritative realtime queue stream; the
 * dev lab pins a fixture source into the same writable atom so the surface can
 * be driven through every state without changing the surface itself.
 *
 * Mirrors the `homeSource` pattern: one writable `Atom` holding a source
 * object, defaulting to the real edge, with a `make*FixtureSource` builder the
 * Caliper adapter swaps in.
 */

import { queueStateStreamAtom } from "@app/shared/playback/queueStateStreamAtom";
import { Cause } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import type { ApiPublicError } from "../../../../api/contracts/common.js";
import type { ApiQueueState } from "../../../../api/contracts/queue.js";
import { QUEUE_COVERFLOW_FIXTURE_STATE } from "./QueueCoverflowFixtures";

export interface QueueCoverflowSource {
  readonly queueStateAtom: Atom.Atom<
    AsyncResult.AsyncResult<ApiQueueState, unknown>
  >;
}

const realQueueCoverflowSource: QueueCoverflowSource = {
  queueStateAtom: queueStateStreamAtom,
};

export const queueCoverflowSourceAtom: Atom.Writable<QueueCoverflowSource> =
  Atom.make<QueueCoverflowSource>(realQueueCoverflowSource);

export const QUEUE_COVERFLOW_FIXTURE_STATES = [
  "Loading",
  "Ready",
  "Empty",
  "LoadError",
  "Defect",
] as const;

export type QueueCoverflowFixtureState =
  (typeof QUEUE_COVERFLOW_FIXTURE_STATES)[number];

export function makeQueueCoverflowFixtureSource(
  state: QueueCoverflowFixtureState,
): QueueCoverflowSource {
  return {
    queueStateAtom: Atom.make<AsyncResult.AsyncResult<ApiQueueState, unknown>>(
      queueStateResultFor(state),
    ),
  };
}

function queueStateResultFor(
  state: QueueCoverflowFixtureState,
): AsyncResult.AsyncResult<ApiQueueState, unknown> {
  switch (state) {
    case "Loading":
      return AsyncResult.initial(true);
    case "Empty":
      return AsyncResult.success({
        items: [],
        currentIndex: 0,
        context: { type: "manual" },
      });
    case "LoadError":
      return AsyncResult.failure(Cause.fail(fixtureError));
    case "Defect":
      return AsyncResult.failure(Cause.die(new Error("queue fixture defect")));
    case "Ready":
      return AsyncResult.success(QUEUE_COVERFLOW_FIXTURE_STATE);
  }
}

const fixtureError: ApiPublicError = {
  _tag: "PersistenceError",
  code: "fixture_queue_source_failed",
};
