/*
 * @module server/rpc/handlers/track tests
 * Behavior tests for the parts of the `track.*` family that do not require
 * Pandora upstream calls. The unauthenticated surfaces delegate source/id
 * validation to SourceCatalog:
 *
 * - `track.metadata.get` reports catalog-derived capabilities,
 * - `track.streamUrl.get` returns the catalog-built `/stream/` URL with
 *   optional `next=` prefetch hints.
 */

import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import type { AuthSessionShape } from "../services/authSession.js";
import type { SourceCatalogShape } from "../services/sourceCatalog.js";
import { trackHandlers } from "./track.js";

const auth: AuthSessionShape = {
  getSession: Effect.succeed(undefined as never),
  requireSession: Effect.fail({} as never),
  getSourceManager: Effect.succeed({} as never),
  refresh: Effect.fail({} as never),
  withAuthRetry: () => Effect.fail({} as never),
};

const catalog: SourceCatalogShape = {
  listPlaylists: () => Effect.succeed([] as never),
  getPlaylistTracks: () => Effect.succeed([] as never),
  searchAll: () => Effect.succeed({ tracks: [], albums: [] } as never),
  getAlbumTracks: () => Effect.fail({} as never),
  getStreamUrl: (id, nextId) =>
    Effect.succeed(
      nextId
        ? `/stream/${encodeURIComponent(id)}?next=${encodeURIComponent(nextId)}`
        : `/stream/${encodeURIComponent(id)}`,
    ),
  getTrackCapabilities: (id) =>
    Effect.succeed({
      feedback: id.startsWith("pandora:"),
      sleep: id.startsWith("pandora:"),
      bookmark: id.startsWith("pandora:"),
      explain: id.startsWith("pandora:"),
      radio: true,
    }),
  resolveManager: Effect.succeed({} as never),
};

describe("track handlers", () => {
  it("track.metadata.get returns Pandora-only capability flags for pandora-prefixed ids", async () => {
    const handlers = trackHandlers({ auth, catalog });
    const result = await Effect.runPromise(
      handlers["track.metadata.get"]({ id: "pandora:abc" }),
    );
    expect(result).toEqual({
      id: "pandora:abc",
      capabilities: {
        feedback: true,
        sleep: true,
        bookmark: true,
        explain: true,
        radio: true,
      },
    });
  });

  it("track.metadata.get reports non-Pandora capabilities for ytmusic ids", async () => {
    const handlers = trackHandlers({ auth, catalog });
    const result = await Effect.runPromise(
      handlers["track.metadata.get"]({ id: "ytmusic:abc" }),
    );
    expect(result.capabilities.feedback).toBe(false);
    expect(result.capabilities.radio).toBe(true);
  });

  it("track.streamUrl.get returns a /stream/-rooted URL with the encoded id", async () => {
    const handlers = trackHandlers({ auth, catalog });
    const result = await Effect.runPromise(
      handlers["track.streamUrl.get"]({ id: "ytmusic:abc" }),
    );
    expect(result.url).toBe("/stream/ytmusic%3Aabc");
  });

  it("track.streamUrl.get includes the next-track prefetch hint when supplied", async () => {
    const handlers = trackHandlers({ auth, catalog });
    const result = await Effect.runPromise(
      handlers["track.streamUrl.get"]({
        id: "ytmusic:abc",
        nextId: "ytmusic:def",
      }),
    );
    expect(result.url).toBe("/stream/ytmusic%3Aabc?next=ytmusic%3Adef");
  });

  it("track.explanation.get maps Pandora focus-trait fields to the public contract", async () => {
    const handlers = trackHandlers({
      catalog,
      auth: {
        ...auth,
        withAuthRetry: () =>
          Effect.succeed({
            explanations: [
              {
                focusTraitId: "trait-1",
                focusTraitName: "Acoustic texture",
              },
            ],
          }) as never,
      },
    });

    const result = await Effect.runPromise(
      handlers["track.explanation.get"]({ id: "pandora:track-token" }),
    );

    expect(result).toEqual({
      explanations: [{ traitId: "trait-1", traitName: "Acoustic texture" }],
    });
  });
});
