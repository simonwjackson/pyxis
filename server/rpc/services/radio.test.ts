import { describe, expect, it } from "bun:test";
import type { SourceManager } from "@shared/sources/index.js";
import type { PandoraSession } from "@shared/sources/pandora/client.js";
import type { PlaylistItem } from "@shared/sources/pandora/types/api.js";
import { Effect } from "effect";
import type { RpcSessionContext } from "../context.js";
import { Unauthorized } from "../errors.js";
import type { AuthSessionShape } from "./authSession.js";
import { Radio, RadioLayerFromBehavior } from "./radio.js";

const session: PandoraSession = {
  syncTime: 0,
  partnerId: "partner",
  partnerAuthToken: "partner-token",
  userId: "user",
  userAuthToken: "user-token",
};

const sourceManager = {} as SourceManager;

function authWithRetry(
  onRetry?: () => void,
): Pick<AuthSessionShape, "withAuthRetry"> {
  return {
    withAuthRetry: (f) => {
      onRetry?.();
      return f({ pandoraSession: session, sourceManager } as RpcSessionContext);
    },
  };
}

function failingAuth(): Pick<AuthSessionShape, "withAuthRetry"> {
  return {
    withAuthRetry: () =>
      Effect.fail(new Unauthorized({ code: "pandora_credentials_required" })),
  };
}

function runRadio<A>(
  auth: Pick<AuthSessionShape, "withAuthRetry">,
  effect: Effect.Effect<A, unknown, Radio>,
  behavior: Parameters<typeof RadioLayerFromBehavior>[0] = { auth },
) {
  return Effect.runPromise(Effect.provide(effect, RadioLayerFromBehavior(behavior)));
}

describe("Radio service", () => {
  it("encodes station detail seeds and feedback behind the service seam", async () => {
    const result = await runRadio(
      authWithRetry(),
      Effect.gen(function* () {
        const radio = yield* Radio;
        return yield* radio.getStation({ id: "pandora:station-token" });
      }),
      {
        auth: authWithRetry(),
        pandora: {
          getStation: () =>
            Effect.succeed({
              stationToken: "station-token",
              stationName: "Indie",
              stationId: "station-id",
              music: {
                artists: [
                  {
                    seedId: "artist-seed",
                    artistName: "Artist",
                    musicToken: "artist-token",
                  },
                ],
                songs: [
                  {
                    seedId: "song-seed",
                    songName: "Song",
                    musicToken: "song-token",
                  },
                ],
              },
              feedback: {
                thumbsUp: [
                  {
                    feedbackId: "fb-up",
                    songName: "Liked",
                    artistName: "Artist",
                    isPositive: true,
                    dateCreated: { time: 1 },
                  },
                ],
                thumbsDown: [],
              },
            }),
        },
      },
    );

    expect(result).toEqual({
      id: "pandora:station-token",
      name: "Indie",
      stationId: "pandora:station-id",
      music: {
        artists: [
          {
            seedId: "pandora:artist-seed",
            artistName: "Artist",
            musicToken: "pandora:artist-token",
          },
        ],
        songs: [
          {
            seedId: "pandora:song-seed",
            songName: "Song",
            musicToken: "pandora:song-token",
          },
        ],
      },
      feedback: {
        thumbsUp: [
          {
            feedbackId: "pandora:fb-up",
            songName: "Liked",
            artistName: "Artist",
            isPositive: true,
            dateCreated: { time: 1 },
          },
        ],
        thumbsDown: [],
      },
    });
  });

  it("adds and removes station seeds with typed command envelopes", async () => {
    const auth = authWithRetry();
    const behavior = {
      auth,
      pandora: {
        addMusic: () =>
          Effect.succeed({
            seedId: "seed-1",
            artistName: "Artist",
          }),
        deleteMusic: () => Effect.succeed({}),
      },
    };

    const added = await runRadio(
      auth,
      Effect.gen(function* () {
        const radio = yield* Radio;
        return yield* radio.addSeed({
          radioId: "pandora:station-token",
          musicToken: "music-token",
        });
      }),
      behavior,
    );
    const removed = await runRadio(
      auth,
      Effect.gen(function* () {
        const radio = yield* Radio;
        return yield* radio.removeSeed({
          radioId: "pandora:station-token",
          seedId: "pandora:seed-1",
        });
      }),
      behavior,
    );

    expect(added).toEqual({ seedId: "pandora:seed-1", artistName: "Artist" });
    expect(removed).toEqual({ success: true });
  });

  it("registers fetched station tracks before returning encoded radio tracks", async () => {
    let registered: readonly PlaylistItem[] = [];
    const item: PlaylistItem = {
      trackToken: "track-token",
      songName: "Song",
      artistName: "Artist",
      albumName: "Album",
    };

    const result = await runRadio(
      authWithRetry(),
      Effect.gen(function* () {
        const radio = yield* Radio;
        return yield* radio.getStationTracks({ id: "pandora:station-token" });
      }),
      {
        auth: authWithRetry(),
        pandora: {
          getPlaylistWithQuality: () => Effect.succeed({ items: [item] }),
        },
        getSourceManager: async () => sourceManager,
        registerPlaylistItems: (_manager, items) => {
          registered = items;
        },
      },
    );

    expect(registered).toEqual([item]);
    expect(result).toEqual([
      {
        id: "pandora:track-token",
        title: "Song",
        artist: "Artist",
        album: "Album",
        artworkUrl: null,
        capabilities: {
          feedback: true,
          sleep: true,
          bookmark: true,
          explain: true,
          radio: true,
        },
      },
    ]);
  });

  it("parses QuickMix station ids before calling Pandora", async () => {
    let stationIds: readonly string[] = [];
    const result = await runRadio(
      authWithRetry(),
      Effect.gen(function* () {
        const radio = yield* Radio;
        return yield* radio.setQuickMix({
          radioIds: ["pandora:a", "pandora:b"],
        });
      }),
      {
        auth: authWithRetry(),
        pandora: {
          setQuickMix: (_session, ids) => {
            stationIds = ids;
            return Effect.succeed({});
          },
        },
      },
    );

    expect(stationIds).toEqual(["a", "b"]);
    expect(result).toEqual({ success: true });
  });

  it("runs station operations through AuthSession.withAuthRetry", async () => {
    let retryCalls = 0;
    const auth = authWithRetry(() => {
      retryCalls += 1;
    });

    const result = await runRadio(
      auth,
      Effect.gen(function* () {
        const radio = yield* Radio;
        return yield* radio.listStations();
      }),
      {
        auth,
        pandora: {
          getStationList: () =>
            Effect.succeed({
              stations: [
                {
                  stationToken: "tok1",
                  stationId: "sid1",
                  stationName: "Station",
                },
              ],
            }),
        },
      },
    );

    expect(retryCalls).toBe(1);
    expect(result[0]?.id).toBe("pandora:tok1");
  });

  it("propagates Unauthorized when AuthSession cannot provide a Pandora session", async () => {
    const exit = await Effect.runPromise(
      Effect.exit(
        Effect.provide(
          Effect.gen(function* () {
            const radio = yield* Radio;
            return yield* radio.listStations();
          }),
          RadioLayerFromBehavior({ auth: failingAuth() }),
        ),
      ),
    );

    expect(JSON.stringify(exit)).toContain("Unauthorized");
  });
});
