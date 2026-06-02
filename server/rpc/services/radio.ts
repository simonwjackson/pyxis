/**
 * @module server/rpc/services/radio
 * Pandora radio station service seam. Owns station lifecycle orchestration,
 * station/seed/feedback/track encoding, playlist item registration, and
 * command result shapes so RPC handlers stay schema-boundary glue.
 */

import type {
  ApiAddRadioSeedInput,
  ApiAddRadioSeedResult,
  ApiCreateStationInput,
  ApiDeleteStationInput,
  ApiGenreCategory,
  ApiGetRadioTracksInput,
  ApiQuickMixInput,
  ApiRadioIdInput,
  ApiRadioStationCommandResult,
  ApiRadioTrack,
  ApiRemoveRadioSeedInput,
  ApiRenameStationInput,
  ApiStationDetail,
  ApiStationSummary,
} from "@shared/api/contracts/radio.js";
import { createLogger } from "@shared/logger.js";
import type { SourceManager } from "@shared/sources/index.js";
import * as Pandora from "@shared/sources/pandora/client.js";
import type { PandoraSession } from "@shared/sources/pandora/client.js";
import type {
  AddMusicResponse,
  CreateStationRequest,
  CreateStationResponse,
  GetGenreStationsResponse,
  GetStationResponse,
  PlaylistItem,
  RenameStationResponse,
  StationListResponse,
} from "@shared/sources/pandora/types/api.js";
import { Context, Effect, Layer } from "effect";
import { formatSourceId, parseId, trackCapabilities } from "../../lib/ids.js";
import {
  getSourceManager,
  registerPandoraPlaylistItems,
} from "../../services/sourceManager.js";
import type { RpcSessionContext } from "../context.js";
import type { PublicError } from "../errors.js";
import { AuthSession, type AuthSessionShape } from "./authSession.js";
import { mapUnknownError } from "../sourceErrorMap.js";

const log = createLogger("radio").child({ component: "radio.service" });

export type RadioShape = {
  readonly listStations: () => Effect.Effect<
    readonly ApiStationSummary[],
    PublicError
  >;
  readonly getStation: (
    input: ApiRadioIdInput,
  ) => Effect.Effect<ApiStationDetail, PublicError>;
  readonly getStationTracks: (
    input: ApiGetRadioTracksInput,
  ) => Effect.Effect<readonly ApiRadioTrack[], PublicError>;
  readonly createStation: (
    input: ApiCreateStationInput,
  ) => Effect.Effect<ApiRadioStationCommandResult, PublicError>;
  readonly deleteStation: (
    input: ApiDeleteStationInput,
  ) => Effect.Effect<{ readonly success: true }, PublicError>;
  readonly renameStation: (
    input: ApiRenameStationInput,
  ) => Effect.Effect<ApiRadioStationCommandResult, PublicError>;
  readonly listGenres: () => Effect.Effect<
    readonly ApiGenreCategory[],
    PublicError
  >;
  readonly setQuickMix: (
    input: ApiQuickMixInput,
  ) => Effect.Effect<{ readonly success: true }, PublicError>;
  readonly addSeed: (
    input: ApiAddRadioSeedInput,
  ) => Effect.Effect<ApiAddRadioSeedResult, PublicError>;
  readonly removeSeed: (
    input: ApiRemoveRadioSeedInput,
  ) => Effect.Effect<{ readonly success: true }, PublicError>;
};

export class Radio extends Context.Service<Radio, RadioShape>()(
  "Pyxis/Radio",
) {}

type PandoraRadioOps = {
  readonly getStationList: (
    session: PandoraSession,
  ) => Effect.Effect<StationListResponse, unknown>;
  readonly getStation: (
    session: PandoraSession,
    request: Parameters<typeof Pandora.getStation>[1],
  ) => Effect.Effect<GetStationResponse, unknown>;
  readonly getPlaylistWithQuality: (
    session: PandoraSession,
    stationToken: string,
    quality?: ApiGetRadioTracksInput["quality"],
  ) => Effect.Effect<{ readonly items: readonly PlaylistItem[] }, unknown>;
  readonly createStation: (
    session: PandoraSession,
    request: CreateStationRequest,
  ) => Effect.Effect<CreateStationResponse, unknown>;
  readonly deleteStation: (
    session: PandoraSession,
    request: Parameters<typeof Pandora.deleteStation>[1],
  ) => Effect.Effect<Record<string, never>, unknown>;
  readonly renameStation: (
    session: PandoraSession,
    request: Parameters<typeof Pandora.renameStation>[1],
  ) => Effect.Effect<RenameStationResponse, unknown>;
  readonly getGenreStations: (
    session: PandoraSession,
  ) => Effect.Effect<GetGenreStationsResponse, unknown>;
  readonly setQuickMix: (
    session: PandoraSession,
    stationIds: readonly string[],
  ) => Effect.Effect<Record<string, never>, unknown>;
  readonly addMusic: (
    session: PandoraSession,
    request: Parameters<typeof Pandora.addMusic>[1],
  ) => Effect.Effect<AddMusicResponse, unknown>;
  readonly deleteMusic: (
    session: PandoraSession,
    request: Parameters<typeof Pandora.deleteMusic>[1],
  ) => Effect.Effect<Record<string, never>, unknown>;
};

export type RadioBehavior = {
  readonly auth: Pick<AuthSessionShape, "withAuthRetry">;
  readonly pandora?: Partial<PandoraRadioOps>;
  readonly getSourceManager?: (
    session: PandoraSession,
  ) => Promise<SourceManager>;
  readonly registerPlaylistItems?: (
    manager: SourceManager,
    items: readonly PlaylistItem[],
  ) => void;
};

const defaultPandora: PandoraRadioOps = {
  getStationList: Pandora.getStationList,
  getStation: Pandora.getStation,
  getPlaylistWithQuality: Pandora.getPlaylistWithQuality,
  createStation: Pandora.createStation,
  deleteStation: Pandora.deleteStation,
  renameStation: Pandora.renameStation,
  getGenreStations: Pandora.getGenreStations,
  setQuickMix: Pandora.setQuickMix,
  addMusic: Pandora.addMusic,
  deleteMusic: Pandora.deleteMusic,
};

const PUBLIC_ERROR_TAGS = new Set([
  "ValidationError",
  "Unauthorized",
  "AuthRefreshFailed",
  "NotFound",
  "SourceUnavailable",
  "PersistenceError",
  "UpstreamProviderError",
  "StaleCommand",
  "StaleReport",
  "Defect",
]);

function isPublicError(err: unknown): err is PublicError {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { readonly _tag?: unknown })._tag === "string" &&
    PUBLIC_ERROR_TAGS.has((err as { readonly _tag: string })._tag)
  );
}

function mapRadioError(error: unknown): PublicError {
  return isPublicError(error) ? error : mapUnknownError(error);
}

function withPandora<A, R>(
  auth: Pick<AuthSessionShape, "withAuthRetry">,
  f: (ctx: RpcSessionContext) => Effect.Effect<A, unknown, R>,
): Effect.Effect<A, PublicError, R> {
  return auth.withAuthRetry(f).pipe(Effect.mapError(mapRadioError));
}

function stationToken(id: string): string {
  return parseId(id).id;
}

function encodeStationSummary(
  station: StationListResponse["stations"][number],
): ApiStationSummary {
  return {
    id: formatSourceId("pandora", station.stationToken),
    stationId: formatSourceId("pandora", station.stationId),
    name: station.stationName,
    isQuickMix: station.isQuickMix ?? false,
    quickMixStationIds: (station.quickMixStationIds ?? []).map((sid) =>
      formatSourceId("pandora", sid),
    ),
    allowDelete: station.allowDelete ?? false,
    allowRename: station.allowRename ?? false,
  };
}

function encodeStationCommand(
  station: CreateStationResponse | RenameStationResponse,
): ApiRadioStationCommandResult {
  return {
    id: formatSourceId("pandora", station.stationToken),
    stationId: formatSourceId("pandora", station.stationId),
    name: station.stationName,
  };
}

function encodeSeeds(
  seeds: ReadonlyArray<{
    readonly seedId: string;
    readonly artistName?: string;
    readonly songName?: string;
    readonly musicToken: string;
  }>,
) {
  return seeds.map((seed) => ({
    seedId: formatSourceId("pandora", seed.seedId),
    ...(seed.artistName != null ? { artistName: seed.artistName } : {}),
    ...(seed.songName != null ? { songName: seed.songName } : {}),
    musicToken: formatSourceId("pandora", seed.musicToken),
  }));
}

function encodeFeedback(
  items: ReadonlyArray<{
    readonly feedbackId: string;
    readonly songName: string;
    readonly artistName: string;
    readonly isPositive: boolean;
    readonly dateCreated: { readonly time: number };
  }>,
) {
  return items.map((feedback) => ({
    feedbackId: formatSourceId("pandora", feedback.feedbackId),
    songName: feedback.songName,
    artistName: feedback.artistName,
    isPositive: feedback.isPositive,
    dateCreated: feedback.dateCreated,
  }));
}

function encodeStationDetail(
  requestedId: string,
  station: GetStationResponse,
): ApiStationDetail {
  return {
    id: requestedId,
    name: station.stationName,
    stationId: formatSourceId("pandora", station.stationId),
    ...(station.music
      ? {
          music: {
            artists: encodeSeeds(station.music.artists ?? []),
            songs: encodeSeeds(station.music.songs ?? []),
          },
        }
      : {}),
    ...(station.feedback
      ? {
          feedback: {
            thumbsUp: encodeFeedback(station.feedback.thumbsUp ?? []),
            thumbsDown: encodeFeedback(station.feedback.thumbsDown ?? []),
          },
        }
      : {}),
  };
}

function encodePlaylistItem(item: PlaylistItem): ApiRadioTrack | null {
  if (!item.songName || !item.artistName || !item.albumName) {
    log.warn(
      {
        trackToken: item.trackToken,
        songName: item.songName,
        artistName: item.artistName,
        albumName: item.albumName,
      },
      "dropping playlist item with missing metadata",
    );
    return null;
  }
  return {
    id: formatSourceId("pandora", item.trackToken),
    title: item.songName,
    artist: item.artistName,
    album: item.albumName,
    artworkUrl: item.albumArtUrl ?? null,
    capabilities: trackCapabilities("pandora"),
  };
}

function createStationRequest(input: ApiCreateStationInput): CreateStationRequest {
  const request: Record<string, unknown> = {};
  if (input.musicToken !== undefined) request.musicToken = input.musicToken;
  if (input.trackToken !== undefined) request.trackToken = input.trackToken;
  if (input.musicType !== undefined) request.musicType = input.musicType;
  return request as CreateStationRequest;
}

function makeShape(behavior: RadioBehavior): RadioShape {
  const pandora = { ...defaultPandora, ...behavior.pandora };
  const resolveSourceManager = behavior.getSourceManager ?? getSourceManager;
  const registerItems =
    behavior.registerPlaylistItems ?? registerPandoraPlaylistItems;
  const auth = behavior.auth;

  return {
    listStations: () =>
      withPandora(auth, (ctx) =>
        pandora
          .getStationList(ctx.pandoraSession)
          .pipe(Effect.map((result) => result.stations.map(encodeStationSummary))),
      ),

    getStation: (input) =>
      withPandora(auth, (ctx) =>
        pandora
          .getStation(ctx.pandoraSession, {
            stationToken: stationToken(input.id),
            includeExtendedAttributes: true,
          })
          .pipe(Effect.map((station) => encodeStationDetail(input.id, station))),
      ),

    getStationTracks: (input) =>
      withPandora(auth, (ctx) =>
        Effect.gen(function* () {
          const result = yield* pandora.getPlaylistWithQuality(
            ctx.pandoraSession,
            stationToken(input.id),
            input.quality ?? "high",
          );
          const manager = yield* Effect.tryPromise({
            try: () => resolveSourceManager(ctx.pandoraSession),
            catch: mapRadioError,
          });
          registerItems(manager, result.items);
          return result.items
            .map(encodePlaylistItem)
            .filter((item): item is ApiRadioTrack => item !== null);
        }),
      ),

    createStation: (input) =>
      withPandora(auth, (ctx) =>
        pandora
          .createStation(ctx.pandoraSession, createStationRequest(input))
          .pipe(Effect.map(encodeStationCommand)),
      ),

    deleteStation: (input) =>
      withPandora(auth, (ctx) =>
        pandora
          .deleteStation(ctx.pandoraSession, {
            stationToken: stationToken(input.id),
          })
          .pipe(Effect.map(() => ({ success: true as const }))),
      ),

    renameStation: (input) =>
      withPandora(auth, (ctx) =>
        pandora
          .renameStation(ctx.pandoraSession, {
            stationToken: stationToken(input.id),
            stationName: input.name,
          })
          .pipe(Effect.map(encodeStationCommand)),
      ),

    listGenres: () =>
      withPandora(auth, (ctx) =>
        pandora
          .getGenreStations(ctx.pandoraSession)
          .pipe(Effect.map((result) => result.categories)),
      ),

    setQuickMix: (input) =>
      withPandora(auth, (ctx) =>
        pandora
          .setQuickMix(
            ctx.pandoraSession,
            input.radioIds.map((id) => stationToken(id)),
          )
          .pipe(Effect.map(() => ({ success: true as const }))),
      ),

    addSeed: (input) =>
      withPandora(auth, (ctx) =>
        pandora
          .addMusic(ctx.pandoraSession, {
            stationToken: stationToken(input.radioId),
            musicToken: input.musicToken,
          })
          .pipe(
            Effect.map((seed) => ({
              seedId: formatSourceId("pandora", seed.seedId),
              ...(seed.artistName != null ? { artistName: seed.artistName } : {}),
              ...(seed.songName != null ? { songName: seed.songName } : {}),
            })),
          ),
      ),

    removeSeed: (input) =>
      withPandora(auth, (ctx) =>
        pandora
          .deleteMusic(ctx.pandoraSession, {
            seedId: stationToken(input.seedId),
          })
          .pipe(Effect.map(() => ({ success: true as const }))),
      ),
  };
}

export function RadioLayerFromBehavior(
  behavior: RadioBehavior,
): Layer.Layer<Radio> {
  return Layer.sync(Radio)(() => makeShape(behavior));
}

export const RadioLayerLive: Layer.Layer<Radio, never, AuthSession> =
  Layer.effect(
    Radio,
    Effect.gen(function* () {
      const auth = yield* AuthSession;
      return makeShape({ auth });
    }),
  );
