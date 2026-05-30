/**
 * @module server/rpc/services/library tests
 * Behavior tests for the Effect Library service.
 *
 * The service wraps the existing placement-aware library helpers, so the
 * tests focus on three contracts:
 *   1. ordering and placement semantics match the underlying service,
 *   2. validation errors surface as typed PublicErrors before touching DB,
 *   3. failures are mapped to typed PublicErrors with no raw cause on the
 *      wire.
 */

import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { createNodeDatabase } from "@proseql/node";
import { Effect, Exit, Scope } from "effect";
import { dbConfig } from "@shared/db/config.js";
import type { DbInstance } from "@shared/db/index.js";
import {
  Library,
  type LibraryBehavior,
  LibraryLayerFromBehavior,
} from "./library.js";

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
  const tempDir = await mkdtemp(join(process.cwd(), "tmp-rpc-library-"));
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

async function seedAlbum(
  db: DbInstance,
  input: {
    readonly albumId: string;
    readonly placement: "discovery" | "collection" | "archive" | "dismissed";
    readonly placementUpdatedAt: number;
    readonly source?: string;
    readonly sourceAlbumId?: string;
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
    source: input.source ?? "ytmusic",
    sourceId: input.sourceAlbumId ?? `${input.albumId}-source`,
  }).runPromise;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

function makeLayer(db: DbInstance, extra: Partial<LibraryBehavior> = {}) {
  return LibraryLayerFromBehavior({ db, ...extra });
}

describe("Library.list", () => {
  it("returns albums ordered by placementUpdatedAt descending then title", async () => {
    const { db, cleanup } = await createTestDb();
    try {
      await seedAlbum(db, {
        albumId: "alpha",
        placement: "discovery",
        placementUpdatedAt: 100,
      });
      await seedAlbum(db, {
        albumId: "bravo",
        placement: "collection",
        placementUpdatedAt: 200,
      });

      const albums = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const svc = yield* Library;
            return yield* svc.list();
          }),
          makeLayer(db),
        ),
      );
      expect(albums.map((a) => a.id)).toEqual(["bravo", "alpha"]);
    } finally {
      await cleanup();
    }
  });

  it("default listing excludes archive and dismissed placements", async () => {
    const { db, cleanup } = await createTestDb();
    try {
      await seedAlbum(db, {
        albumId: "kept",
        placement: "collection",
        placementUpdatedAt: 1,
      });
      await seedAlbum(db, {
        albumId: "archived",
        placement: "archive",
        placementUpdatedAt: 2,
      });
      await seedAlbum(db, {
        albumId: "gone",
        placement: "dismissed",
        placementUpdatedAt: 3,
      });

      const albums = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const svc = yield* Library;
            return yield* svc.list();
          }),
          makeLayer(db),
        ),
      );
      expect(albums.map((a) => a.id).sort()).toEqual(["kept"]);
    } finally {
      await cleanup();
    }
  });
});

describe("Library.get", () => {
  it("returns the album when present", async () => {
    const { db, cleanup } = await createTestDb();
    try {
      await seedAlbum(db, {
        albumId: "alpha",
        placement: "collection",
        placementUpdatedAt: 1,
      });
      const album = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const svc = yield* Library;
            return yield* svc.get("alpha");
          }),
          makeLayer(db),
        ),
      );
      expect(album?.id).toBe("alpha");
    } finally {
      await cleanup();
    }
  });

  it("returns null for unknown albums", async () => {
    const { db, cleanup } = await createTestDb();
    try {
      const album = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const svc = yield* Library;
            return yield* svc.get("missing");
          }),
          makeLayer(db),
        ),
      );
      expect(album).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("fails with ValidationError on an empty id without touching the database", async () => {
    const { db, cleanup } = await createTestDb();
    try {
      const result = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const svc = yield* Library;
            return yield* Effect.result(svc.get(""));
          }),
          makeLayer(db),
        ),
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure._tag).toBe("ValidationError");
        expect(result.failure.code).toBe("album_id_required");
      }
    } finally {
      await cleanup();
    }
  });
});

describe("Library.setPlacement", () => {
  it("updates placement and timestamp through the service", async () => {
    const { db, cleanup } = await createTestDb();
    try {
      await seedAlbum(db, {
        albumId: "alpha",
        placement: "discovery",
        placementUpdatedAt: 100,
      });

      const updated = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const svc = yield* Library;
            return yield* svc.setPlacement("alpha", "collection");
          }),
          makeLayer(db, { now: () => 500 }),
        ),
      );
      expect(updated.placement).toBe("collection");
      expect(updated.placementUpdatedAt).toBe(500);
    } finally {
      await cleanup();
    }
  });
});

describe("Library.save", () => {
  it("rejects bare nanoid ids with a typed ValidationError before reaching the DB", async () => {
    const { db, cleanup } = await createTestDb();
    try {
      const sourceManager = {
        getAlbumTracks: async () => {
          throw new Error("must not be called");
        },
      };
      const result = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const svc = yield* Library;
            return yield* Effect.result(svc.save("bareid", sourceManager));
          }),
          makeLayer(db),
        ),
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure._tag).toBe("ValidationError");
      }
    } finally {
      await cleanup();
    }
  });

  it("creates a new album in discovery and flushes the DB", async () => {
    const { db, cleanup } = await createTestDb();
    try {
      let flushed = 0;
      const originalFlush = db.flush.bind(db);
      (db as unknown as { flush: () => Promise<void> }).flush = async () => {
        flushed += 1;
        await originalFlush();
      };

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

      let counter = 0;
      const result = await Effect.runPromise(
        Effect.provide(
          Effect.gen(function* () {
            const svc = yield* Library;
            return yield* svc.save("ytmusic:remote_album_1", sourceManager);
          }),
          makeLayer(db, {
            now: () => 1234,
            createId: () => `new_${++counter}`,
          }),
        ),
      );
      expect(result.outcome).toBe("created");
      expect(result.placement).toBe("discovery");
      expect(flushed).toBeGreaterThanOrEqual(1);
    } finally {
      await cleanup();
    }
  });
});
