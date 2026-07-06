/**
 * @module pressings
 *
 * Stylized colored/marbled vinyl "pressing" artwork used as the vinyl surface
 * of the turntable record. One is chosen at random per mount so the record
 * looks different each time the page loads. The center label is drawn on top
 * by VinylRecord, so these images intentionally carry a plain center.
 */
import amberTranslucent from "./assets/pressings/amber-translucent.jpg";
import blackWhiteMarble from "./assets/pressings/black-white-marble.jpg";
import galaxyNebula from "./assets/pressings/galaxy-nebula.jpg";
import halfHalf from "./assets/pressings/half-half.jpg";
import splatter from "./assets/pressings/splatter.jpg";
import tealMarble from "./assets/pressings/teal-marble.jpg";

export const VINYL_PRESSINGS: readonly [string, ...string[]] = [
  tealMarble,
  blackWhiteMarble,
  splatter,
  galaxyNebula,
  amberTranslucent,
  halfHalf,
];

/** Pick a random pressing. Falls back to the first entry so the return is
 * always a defined URL under noUncheckedIndexedAccess. */
export function randomPressing(): string {
  const i = Math.floor(Math.random() * VINYL_PRESSINGS.length);
  return VINYL_PRESSINGS[i] ?? VINYL_PRESSINGS[0];
}
