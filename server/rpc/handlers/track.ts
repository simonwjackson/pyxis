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

import { Effect } from "effect";
import type {
  ApiRemoveTrackFeedbackInput,
  ApiTrackFeedbackInput,
  ApiTrackIdRequest,
  ApiTrackSleepInput,
  ApiTrackStreamUrlInput,
} from "@shared/api/contracts/track.js";
import * as Pandora from "@shared/sources/pandora/client.js";
import {
  buildStreamUrl,
  formatSourceId,
  parseId,
  resolveTrackSource,
  trackCapabilities,
} from "../../lib/ids.js";
import { publicHandler } from "../handler.js";
import type { AuthSessionShape } from "../services/authSession.js";
import { mapUnknownError } from "../sourceErrorMap.js";

export type TrackHandlerDeps = {
  readonly auth: AuthSessionShape;
};

export const trackHandlers = (deps: TrackHandlerDeps) => ({
  "track.metadata.get": (payload: ApiTrackIdRequest) =>
    publicHandler(
      Effect.tryPromise({
        try: async () => {
          const source = await resolveTrackSource(payload.id);
          return { id: payload.id, capabilities: trackCapabilities(source) };
        },
        catch: (cause) => mapUnknownError(cause),
      }),
    ),

  "track.streamUrl.get": (payload: ApiTrackStreamUrlInput) =>
    Effect.sync(() => ({ url: buildStreamUrl(payload.id, payload.nextId) })),

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
