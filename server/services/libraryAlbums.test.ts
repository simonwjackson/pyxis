import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { createNodeDatabase } from "@proseql/node";
import { Effect, Exit, Scope } from "effect";
import { dbConfig } from "../../src/db/config.js";
import type { DbInstance } from "../../src/db/index.js";
import { formatSourceId } from "../lib/ids.js";
import { getHotAlbumMap } from "./hotAlbums.js";
import {
  listLibraryAlbums,
  resolveAlbumStatesForSourceIds,
  saveAlbumToLibrary,
  setAlbumPlacement,
} from "./libraryAlbums.js";

type TestDb = {
  readonly db: DbInstance;
  readonly cleanup: () => Promise<void>;
};

const tempDirs: string[] = [];

function withTempFiles(baseDir: string) {
  return {
    ...dbConfig,
    albums: { ...dbConfig.albums, file: join(baseDir, "albums.yaml") },
    albumSourceRefs: {
      ...dbConfig.albumSourceRefs,
      file: join(baseDir, "album-source-refs.yaml"),
    },
    albumTracks: {
      ...dbConfig.albumTracks,
      file: join(baseDir, "album-tracks.yaml"),
    },
    playlists: { ...dbConfig.playlists, file: join(baseDir, "playlists.yaml") },
    playerState: {
      ...dbConfig.playerState,
      file: join(baseDir, "player-state.yaml"),
    },
    queueState: {
      ...dbConfig.queueState,
      file: join(baseDir, "queue-state.yaml"),
    },
    listenLog: {
      ...dbConfig.listenLog,
      file: join(baseDir, "listen-log.jsonl"),
    },
    trackSources: {
      ...dbConfig.trackSources,
      file: join(baseDir, "track-sources.yaml"),
    },
    upgradeQueue: {
      ...dbConfig.upgradeQueue,
      file: join(baseDir, "upgrade-queue.yaml"),
    },
  } as const;
}

async function createTestDb(): Promise<TestDb> {
  const tempDir = await mkdtemp(join(process.cwd(), "tmp-library-service-"));
  tempDirs.push(tempDir);
  const scope = await Effect.runPromise(Scope.make());
  const db = await Effect.runPromise(
    Scope.provide(scope)(createNodeDatabase(withTempFiles(tempDir))),
  );
  return {
    db: db as DbInstance,
    cleanup: async () => {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    },
  };
}

function createIdFactory(prefix: string) {
  let index = 0;
  return () => `${prefix}_${String(++index)}`;
}

async function seedAlbum(
  db: DbInstance,
  input: {
    readonly albumId: string;
    readonly source: string;
    readonly sourceAlbumId: string;
    readonly sourceTrackId: string;
    readonly placement: "discovery" | "collection" | "archive" | "dismissed";
    readonly placementUpdatedAt: number;
  },
): Promise<void> {
  await db.albums.create({
    id: input.albumId,
    title: `Album ${input.albumId}`,
    artist: "Artist",
    placement: input.placement,
    placementUpdatedAt: input.placementUpdatedAt,
    createdAt: input.placementUpdatedAt,
  } as never).runPromise;
  await db.albumSourceRefs.create({
    id: `${input.albumId}-ref`,
    albumId: input.albumId,
    source: input.source,
    sourceId: input.sourceAlbumId,
  }).runPromise;
  await db.albumTracks.create({
    id: `${input.albumId}-track-1`,
    albumId: input.albumId,
    trackIndex: 0,
    title: "Track 1",
    artist: "Artist",
    source: input.source,
    sourceTrackId: input.sourceTrackId,
  }).runPromise;
}

async function seedListen(
  db: DbInstance,
  input: {
    readonly id: string;
    readonly source: string;
    readonly sourceTrackId: string;
    readonly listenedAt: number;
  },
): Promise<void> {
  await db.listenLog.create({
    id: input.id,
    compositeId: formatSourceId(input.source as never, input.sourceTrackId),
    title: "Track 1",
    artist: "Artist",
    source: input.source,
    listenedAt: input.listenedAt,
  }).runPromise;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("saveAlbumToLibrary", () => {
  it("creates new albums in discovery", async () => {
    const { db, cleanup } = await createTestDb();
    const createId = createIdFactory("new_album");

    try {
      const sourceManager = {
        getAlbumTracks: async () => ({
          album: {
            id: "remote_album_1",
            title: "Remote Album",
            artist: "Remote Artist",
            sourceIds: [{ source: "ytmusic", id: "remote_album_1" }] as const,
            tracks: [],
          },
          tracks: [
            {
              id: "remote_track_1",
              title: "Remote Track",
              artist: "Remote Artist",
              album: "Remote Album",
              sourceId: { source: "ytmusic", id: "remote_track_1" } as const,
            },
          ],
        }),
      };

      const result = await saveAlbumToLibrary(
        db,
        sourceManager,
        "ytmusic:remote_album_1",
        { now: 1000, createId },
      );

      expect(result).toEqual({
        id: "new_album_1",
        outcome: "created",
        placement: "discovery",
      });

      const albums = await listLibraryAlbums(db, { placements: ["discovery"] });
      expect(albums).toHaveLength(1);
      expect(albums[0]).toMatchObject({
        id: "new_album_1",
        placement: "discovery",
        placementUpdatedAt: 1000,
        sourceIds: ["ytmusic:remote_album_1"],
      });
    } finally {
      await cleanup();
    }
  });

  it("re-adding a dismissed album restores it to discovery", async () => {
    const { db, cleanup } = await createTestDb();
    try {
      await seedAlbum(db, {
        albumId: "album_1",
        source: "ytmusic",
        sourceAlbumId: "remote_album_1",
        sourceTrackId: "remote_track_1",
        placement: "dismissed",
        placementUpdatedAt: 50,
      });

      const sourceManager = {
        getAlbumTracks: async () => {
          throw new Error("should not refetch existing dismissed album");
        },
      };

      const result = await saveAlbumToLibrary(
        db,
        sourceManager,
        "ytmusic:remote_album_1",
        { now: 250 },
      );
      expect(result).toEqual({
        id: "album_1",
        outcome: "restored",
        placement: "discovery",
      });

      const restored = await listLibraryAlbums(db, {
        placements: ["discovery"],
      });
      expect(restored.map((album) => album.id)).toEqual(["album_1"]);
      expect(restored[0]?.placementUpdatedAt).toBe(250);
    } finally {
      await cleanup();
    }
  });
});

describe("placement-aware listing", () => {
  it("default library queries exclude archive and dismissed", async () => {
    const { db, cleanup } = await createTestDb();
    try {
      await seedAlbum(db, {
        albumId: "discovery_album",
        source: "ytmusic",
        sourceAlbumId: "discovery_source",
        sourceTrackId: "discovery_track",
        placement: "discovery",
        placementUpdatedAt: 10,
      });
      await seedAlbum(db, {
        albumId: "collection_album",
        source: "ytmusic",
        sourceAlbumId: "collection_source",
        sourceTrackId: "collection_track",
        placement: "collection",
        placementUpdatedAt: 20,
      });
      await seedAlbum(db, {
        albumId: "archive_album",
        source: "ytmusic",
        sourceAlbumId: "archive_source",
        sourceTrackId: "archive_track",
        placement: "archive",
        placementUpdatedAt: 30,
      });
      await seedAlbum(db, {
        albumId: "dismissed_album",
        source: "ytmusic",
        sourceAlbumId: "dismissed_source",
        sourceTrackId: "dismissed_track",
        placement: "dismissed",
        placementUpdatedAt: 40,
      });

      const defaultAlbums = await listLibraryAlbums(db);
      expect(defaultAlbums.map((album) => album.id).sort()).toEqual([
        "collection_album",
        "discovery_album",
      ]);

      const withArchive = await listLibraryAlbums(db, { includeArchive: true });
      expect(withArchive.map((album) => album.id).sort()).toEqual([
        "archive_album",
        "collection_album",
        "discovery_album",
      ]);
    } finally {
      await cleanup();
    }
  });

  it("setAlbumPlacement moves albums between placements", async () => {
    const { db, cleanup } = await createTestDb();
    try {
      await seedAlbum(db, {
        albumId: "album_1",
        source: "ytmusic",
        sourceAlbumId: "album_source_1",
        sourceTrackId: "track_source_1",
        placement: "discovery",
        placementUpdatedAt: 10,
      });

      const updated = await setAlbumPlacement(db, "album_1", "archive", {
        now: 999,
      });
      expect(updated.placement).toBe("archive");
      expect(updated.placementUpdatedAt).toBe(999);
    } finally {
      await cleanup();
    }
  });
});

describe("resolveAlbumStatesForSourceIds and hot albums", () => {
  it("maps listen history back to albums via source track ids", async () => {
    const { db, cleanup } = await createTestDb();
    try {
      await seedAlbum(db, {
        albumId: "album_hot",
        source: "ytmusic",
        sourceAlbumId: "hot_album_source",
        sourceTrackId: "hot_track_source",
        placement: "dismissed",
        placementUpdatedAt: 10,
      });
      await seedListen(db, {
        id: "listen_1",
        source: "ytmusic",
        sourceTrackId: "hot_track_source",
        listenedAt: 1_000,
      });
      await seedListen(db, {
        id: "listen_2",
        source: "ytmusic",
        sourceTrackId: "hot_track_source",
        listenedAt: 2_000,
      });
      await seedListen(db, {
        id: "listen_3",
        source: "ytmusic",
        sourceTrackId: "hot_track_source",
        listenedAt: 3_000,
      });

      const hotMap = await getHotAlbumMap(db, { now: 4_000 });
      expect(hotMap.get("album_hot")).toMatchObject({
        albumId: "album_hot",
        isHot: true,
        hotRank: 1,
        recentListenCount: 3,
      });

      const states = await resolveAlbumStatesForSourceIds(
        db,
        ["ytmusic:hot_album_source"],
        { now: 4_000 },
      );
      expect(states).toEqual([
        {
          sourceId: "ytmusic:hot_album_source",
          albumId: "album_hot",
          placement: "dismissed",
          isHot: true,
          hotRank: 1,
          recentListenCount: 3,
        },
      ]);
    } finally {
      await cleanup();
    }
  });
});
