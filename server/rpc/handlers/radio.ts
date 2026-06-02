/**
 * @module server/rpc/handlers/radio
 * Effect RPC handlers for the `radio.*` family. Pandora station lifecycle,
 * station detail encoding, playlist item registration, and command envelopes
 * live in the Radio service; this module binds RPC payloads to that seam.
 */

import type {
  ApiAddRadioSeedInput,
  ApiCreateStationInput,
  ApiDeleteStationInput,
  ApiGetRadioTracksInput,
  ApiQuickMixInput,
  ApiRadioIdInput,
  ApiRemoveRadioSeedInput,
  ApiRenameStationInput,
} from "@shared/api/contracts/radio.js";
import { publicHandler } from "../handler.js";
import type { RadioShape } from "../services/radio.js";

export type RadioHandlerDeps = {
  readonly radio: RadioShape;
};

export const radioHandlers = (deps: RadioHandlerDeps) => ({
  "radio.stations.list": () => publicHandler(deps.radio.listStations()),

  "radio.station.get": (payload: ApiRadioIdInput) =>
    publicHandler(deps.radio.getStation(payload)),

  "radio.stationTracks.get": (payload: ApiGetRadioTracksInput) =>
    publicHandler(deps.radio.getStationTracks(payload)),

  "radio.station.create": (payload: ApiCreateStationInput) =>
    publicHandler(deps.radio.createStation(payload)),

  "radio.station.delete": (payload: ApiDeleteStationInput) =>
    publicHandler(deps.radio.deleteStation(payload)),

  "radio.station.rename": (payload: ApiRenameStationInput) =>
    publicHandler(deps.radio.renameStation(payload)),

  "radio.genres.list": () => publicHandler(deps.radio.listGenres()),

  "radio.quickMix.set": (payload: ApiQuickMixInput) =>
    publicHandler(deps.radio.setQuickMix(payload)),

  "radio.seed.add": (payload: ApiAddRadioSeedInput) =>
    publicHandler(deps.radio.addSeed(payload)),

  "radio.seed.remove": (payload: ApiRemoveRadioSeedInput) =>
    publicHandler(deps.radio.removeSeed(payload)),
});
