/**
 * @module server/rpc/handler tests
 * End-to-end contract tests for the assembled non-realtime handler layer.
 * Uses the Effect RPC in-memory test transport (`RpcTest.makeClient`) so
 * the entire encode → handler → decode flow is exercised against the live
 * schema definitions.
 *
 * The realtime player/queue handlers are intentionally omitted from
 * {@link NonRealtimeRpc}; U5 will replace this layer with the full group.
 */

import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { RpcTest } from "effect/unstable/rpc";
import type {
  CanonicalAlbum,
  CanonicalTrack,
} from "@shared/sources/types.js";
import { NonRealtimeRpcHandlersLayer, NonRealtimeRpc } from "./handler.js";
import {
  type AuthSessionBehavior,
  AuthSessionLayerFromBehavior,
} from "./services/authSession.js";
import {
  type LibraryBehavior,
  LibraryLayerFromBehavior,
} from "./services/library.js";
import {
  type SourceCatalogBehavior,
  SourceCatalogLayerFromBehavior,
} from "./services/sourceCatalog.js";

function authBehavior(): AuthSessionBehavior {
  return {
    getSession: () => undefined,
    setSession: () => {},
    sourceManagerForSession: async () => ({}) as never,
    sourceManagerFallback: async () => ({}) as never,
    refresh: async () => undefined,
  };
}

function libraryBehavior(): LibraryBehavior {
  return {
    db: async () => ({}) as never,
  };
}

const sampleAlbum: CanonicalAlbum = {
  id: "ytmusic:remote_1",
  title: "Remote Album",
  artist: "Remote Artist",
  sourceIds: [{ source: "ytmusic", id: "remote_1" }],
  tracks: [],
};

const sampleTracks: readonly CanonicalTrack[] = [
  {
    sourceId: { source: "ytmusic", id: "rt1" },
    title: "Track 1",
    artist: "Remote Artist",
    album: "Remote Album",
  },
];

function catalogBehavior(): SourceCatalogBehavior {
  return {
    resolveManager: async () =>
      ({
        getAlbumTracks: async () => ({
          album: sampleAlbum,
          tracks: sampleTracks,
        }),
        searchAll: async () => ({
          tracks: sampleTracks,
          albums: [],
        }),
        listAllPlaylists: () => [],
        getPlaylistTracks: async () => [],
        getStreamUrl: async () => "/stream/none",
      }) as never,
  };
}

function makeServiceLayer() {
  return Layer.mergeAll(
    AuthSessionLayerFromBehavior(authBehavior()),
    LibraryLayerFromBehavior(libraryBehavior()),
    SourceCatalogLayerFromBehavior(catalogBehavior()),
  );
}

const TestRpcLayer = NonRealtimeRpcHandlersLayer.pipe(
  Layer.provide(makeServiceLayer()),
);

describe("NonRealtimeRpc handler layer", () => {
  it("answers track.streamUrl.get with a /stream/-rooted URL", async () => {
    const program = Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(NonRealtimeRpc);
      return yield* client["track.streamUrl.get"]({ id: "ytmusic:abc" });
    });
    const result = await Effect.runPromise(
      Effect.scoped(program).pipe(Effect.provide(TestRpcLayer)),
    );
    expect(result.url).toBe("/stream/ytmusic%3Aabc");
  });

  it("answers log.client.write with ok:true", async () => {
    const program = Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(NonRealtimeRpc);
      return yield* client["log.client.write"]({ message: "test" });
    });
    const result = await Effect.runPromise(
      Effect.scoped(program).pipe(Effect.provide(TestRpcLayer)),
    );
    expect(result).toEqual({ ok: true });
  });

  it("answers album.withTracks.get with the batched album+tracks shape", async () => {
    const program = Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(NonRealtimeRpc);
      return yield* client["album.withTracks.get"]({
        id: "ytmusic:remote_1",
      });
    });
    const result = await Effect.runPromise(
      Effect.scoped(program).pipe(Effect.provide(TestRpcLayer)),
    );
    expect(result.album.title).toBe("Remote Album");
    expect(result.tracks.length).toBe(1);
    expect(result.tracks[0]?.trackIndex).toBe(0);
  });

  it("propagates Unauthorized through the wire for Pandora-only endpoints when no session is configured", async () => {
    const program = Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(NonRealtimeRpc);
      return yield* Effect.exit(client["auth.settings.get"]());
    });
    const exit = await Effect.runPromise(
      Effect.scoped(program).pipe(Effect.provide(TestRpcLayer)),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(JSON.stringify(exit.cause)).toContain("Unauthorized");
    }
  });
});
