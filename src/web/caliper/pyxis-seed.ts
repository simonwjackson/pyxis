/**
 * @module pyxis-seed
 *
 * Builds the mount-time atom seed for the Pyxis Caliper surface: inert infra
 * atoms (auth status, queue stream) plus every declared lab source at its
 * default fixture, so the mounted app never reaches for the network and each
 * surface opens in a representative state.
 */

import { authStatusQueryAtom } from "@app/shared/layout/authStatusAtom";
import { queueStateStreamAtom } from "@app/shared/playback/queueStateStreamAtom";
import { AsyncResult } from "effect/unstable/reactivity";
import { PYXIS_LAB_SOURCES } from "./pyxis-lab-sources";

export type PyxisSeedInitialValues = readonly (readonly [unknown, unknown])[];

export function makePyxisSeedInitialValues(): PyxisSeedInitialValues {
  return [
    [authStatusQueryAtom, AsyncResult.success(labAuthStatus)],
    [queueStateStreamAtom, AsyncResult.success(labQueueState)],
    ...PYXIS_LAB_SOURCES.map(
      (source) =>
        [source.atom, source.makeFixture(source.defaultState)] as const,
    ),
  ];
}

const labAuthStatus = {
  authenticated: false,
  hasPandora: false,
};

const labQueueState = {
  items: [],
  currentIndex: 0,
  context: { type: "manual" as const },
};
