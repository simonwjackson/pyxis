/**
 * @module server/rpc/handlers/track
 * Effect RPC handlers for the `track.*` family. Preserves
 * `server/routers/track.ts` semantics:
 *
 * - `track.metadata.get` reports capabilities, resolving the source for bare
 *   nanoid library ids via the DB.
 * - `track.streamUrl.get` is a pure URL construction; it does not perform
 *   network I/O and returns a `/stream/` path that the browser/Android
 *   bridge fetches over plain HTTP. Audio bytes remain outside RPC.
 * - `track.feedback.*`, `track.sleep.set`, and `track.explanation.get`
 *   require a Pandora session.
 */

import type {
  ApiRemoveTrackFeedbackInput,
  ApiTrackFeedbackInput,
  ApiTrackIdRequest,
  ApiTrackSleepInput,
  ApiTrackStreamUrlInput,
} from "@shared/api/contracts/track.js";
import * as Pandora from "@shared/sources/pandora/client.js";
import { Effect } from "effect";
import { formatSourceId, parseId } from "../../lib/ids.js";
import { publicHandler } from "../handler.js";
import type { AuthSessionShape } from "../services/authSession.js";
import type { SourceCatalogShape } from "../services/sourceCatalog.js";

export type TrackHandlerDeps = {
  readonly auth: AuthSessionShape;
  readonly catalog: SourceCatalogShape;
};

export const trackHandlers = (deps: TrackHandlerDeps) => ({
  "track.metadata.get": (payload: ApiTrackIdRequest) =>
    publicHandler(
      deps.catalog
        .getTrackCapabilities(payload.id)
        .pipe(Effect.map((capabilities) => ({ id: payload.id, capabilities }))),
    ),

  "track.streamUrl.get": (payload: ApiTrackStreamUrlInput) =>
    publicHandler(
      deps.catalog
        .getStreamUrl(payload.id, payload.nextId)
        .pipe(Effect.map((url) => ({ url }))),
    ),

  "track.feedback.add": (payload: ApiTrackFeedbackInput) =>
    publicHandler(
      deps.auth
        .withAuthRetry((ctx) => {
          const { id: trackToken } = parseId(payload.id);
          const { id: stationToken } = parseId(payload.radioId);
          return Pandora.addFeedback(
            ctx.pandoraSession,
            stationToken,
            trackToken,
            payload.positive,
          );
        })
        .pipe(
          Effect.map((result) => ({
            feedbackId: formatSourceId("pandora", result.feedbackId),
            songName: result.songName,
            artistName: result.artistName,
          })),
        ),
    ),

  "track.feedback.remove": (payload: ApiRemoveTrackFeedbackInput) =>
    publicHandler(
      deps.auth
        .withAuthRetry((ctx) => {
          const { id: feedbackId } = parseId(payload.feedbackId);
          return Pandora.deleteFeedback(ctx.pandoraSession, feedbackId);
        })
        .pipe(Effect.map(() => ({ success: true as const }))),
    ),

  "track.sleep.set": (payload: ApiTrackSleepInput) =>
    publicHandler(
      deps.auth
        .withAuthRetry((ctx) => {
          const { id: trackToken } = parseId(payload.id);
          return Pandora.sleepSong(ctx.pandoraSession, trackToken);
        })
        .pipe(Effect.map(() => ({ success: true as const }))),
    ),

  "track.explanation.get": (payload: ApiTrackIdRequest) =>
    publicHandler(
      deps.auth
        .withAuthRetry((ctx) => {
          const { id: trackToken } = parseId(payload.id);
          return Pandora.explainTrack(ctx.pandoraSession, trackToken);
        })
        .pipe(
          Effect.map((result) => ({
            explanations: result.explanations.map((explanation) => ({
              traitId: explanation.focusTraitId,
              traitName: explanation.focusTraitName,
            })),
          })),
        ),
    ),
});
