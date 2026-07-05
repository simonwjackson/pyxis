import {
  type HomeFixtureState,
  homeSourceAtom,
  makeHomeFixtureSource,
} from "@app/features/home/homeSource";

export type PyxisSeedInitialValues = readonly (readonly [unknown, unknown])[];

export function makePyxisSeedInitialValues(
  state: HomeFixtureState = "Ready",
): PyxisSeedInitialValues {
  return [[homeSourceAtom, makeHomeFixtureSource(state)]];
}
