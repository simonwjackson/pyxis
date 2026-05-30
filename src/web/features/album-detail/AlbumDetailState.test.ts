import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiSourceAlbumWithTracks } from "../../../api/contracts/album.js";
import type {
  ApiLibraryAlbum,
  ApiLibraryAlbumState,
  ApiLibraryAlbumTrack,
} from "../../../api/contracts/library.js";
import {
  LibraryAlbumDetailState,
  SourceAlbumDetailState,
} from "./AlbumDetailState.js";

const libraryAlbum = (
  overrides: Partial<ApiLibraryAlbum> = {},
): ApiLibraryAlbum => ({
  id: "album-1",
  title: "Selected Ambient Works",
  artist: "Aphex Twin",
  placement: "collection",
  placementUpdatedAt: 0,
  sourceIds: ["ytmusic:album-1"],
  isHot: false,
  hotRank: null,
  ...overrides,
});

const libraryTrack = (
  overrides: Partial<ApiLibraryAlbumTrack> = {},
): ApiLibraryAlbumTrack => ({
  id: "track-1",
  trackIndex: 0,
  title: "Xtal",
  artist: "Aphex Twin",
  capabilities: {
    feedback: false,
    sleep: false,
    bookmark: false,
    explain: false,
    radio: true,
  },
  ...overrides,
});

const sourceWithTracks = (
  overrides: Partial<ApiSourceAlbumWithTracks> = {},
): ApiSourceAlbumWithTracks => ({
  album: {
    id: "ytmusic:album-1",
    title: "Selected Ambient Works",
    artist: "Aphex Twin",
  },
  tracks: [
    {
      id: "ytmusic:track-1",
      trackIndex: 0,
      title: "Xtal",
      artist: "Aphex Twin",
      album: "Selected Ambient Works",
      capabilities: {
        feedback: false,
        sleep: false,
        bookmark: false,
        explain: false,
        radio: true,
      },
    },
  ],
  ...overrides,
});

const libraryState = (
  overrides: Partial<ApiLibraryAlbumState> = {},
): ApiLibraryAlbumState => ({
  sourceId: "ytmusic:album-1",
  albumId: "album-1",
  placement: "collection",
  isHot: false,
  ...overrides,
});

describe("LibraryAlbumDetailState.fromResults", () => {
  it("is Loading while the album query is loading", () => {
    expect(
      LibraryAlbumDetailState.fromResults(
        AsyncResult.initial(true),
        AsyncResult.success([libraryTrack()]),
      ),
    ).toEqual({ _tag: "Loading" });
  });

  it("is NotFound when the album resolver returns null", () => {
    expect(
      LibraryAlbumDetailState.fromResults(
        AsyncResult.success(null),
        AsyncResult.success([libraryTrack()]),
      ),
    ).toEqual({ _tag: "NotFound" });
  });

  it("is Loading while tracks are loading for a known album", () => {
    expect(
      LibraryAlbumDetailState.fromResults(
        AsyncResult.success(libraryAlbum()),
        AsyncResult.initial(true),
      ),
    ).toEqual({ _tag: "Loading" });
  });

  it("is Ready with album metadata and tracks", () => {
    const album = libraryAlbum();
    const tracks = [libraryTrack()];
    expect(
      LibraryAlbumDetailState.fromResults(
        AsyncResult.success(album),
        AsyncResult.success(tracks),
      ),
    ).toEqual({ _tag: "Ready", album, tracks });
  });

  it("is LoadError when the album query fails with a typed public error", () => {
    const error = { _tag: "NotFound" as const };
    expect(
      LibraryAlbumDetailState.fromResults(
        AsyncResult.failure(Cause.fail(error)),
        AsyncResult.success([libraryTrack()]),
      ),
    ).toEqual({ _tag: "LoadError", error });
  });

  it("is LoadError when the tracks query fails after the album resolves", () => {
    const error = { _tag: "SourceUnavailable" as const, code: "offline" };
    expect(
      LibraryAlbumDetailState.fromResults(
        AsyncResult.success(libraryAlbum()),
        AsyncResult.failure(Cause.fail(error)),
      ),
    ).toEqual({ _tag: "LoadError", error });
  });

  it("is Defect when the album query fails with a transport defect", () => {
    const defect = new Error("transport");
    const state = LibraryAlbumDetailState.fromResults(
      AsyncResult.failure(Cause.die(defect)),
      AsyncResult.success([libraryTrack()]),
    );
    expect(state._tag).toBe("Defect");
    if (state._tag === "Defect") expect(state.defect).toBe(defect);
  });
});

describe("SourceAlbumDetailState.fromResults", () => {
  it("is Loading while the source query is loading", () => {
    expect(
      SourceAlbumDetailState.fromResults(
        AsyncResult.initial(true),
        AsyncResult.success([libraryState()]),
      ),
    ).toEqual({ _tag: "Loading" });
  });

  it("is Loading while the states query is loading after source resolves", () => {
    expect(
      SourceAlbumDetailState.fromResults(
        AsyncResult.success(sourceWithTracks()),
        AsyncResult.initial(true),
      ),
    ).toEqual({ _tag: "Loading" });
  });

  it("is Ready with album, tracks, and projected library state", () => {
    const data = sourceWithTracks();
    const state = SourceAlbumDetailState.fromResults(
      AsyncResult.success(data),
      AsyncResult.success([libraryState()]),
    );
    expect(state).toEqual({
      _tag: "Ready",
      album: data.album,
      tracks: data.tracks,
      libraryState: {
        albumId: "album-1",
        placement: "collection",
        isHot: false,
      },
    });
  });

  it("is Ready with libraryState=null when the states result has no row", () => {
    const data = sourceWithTracks();
    const state = SourceAlbumDetailState.fromResults(
      AsyncResult.success(data),
      AsyncResult.success([]),
    );
    expect(state).toEqual({
      _tag: "Ready",
      album: data.album,
      tracks: data.tracks,
      libraryState: null,
    });
  });

  it("is Ready with libraryState=null when the states query errors", () => {
    const data = sourceWithTracks();
    const state = SourceAlbumDetailState.fromResults(
      AsyncResult.success(data),
      AsyncResult.failure(
        Cause.fail({ _tag: "SourceUnavailable" as const, code: "x" }),
      ),
    );
    expect(state).toEqual({
      _tag: "Ready",
      album: data.album,
      tracks: data.tracks,
      libraryState: null,
    });
  });

  it("is Ready with libraryState including only defined fields", () => {
    const data = sourceWithTracks();
    const state = SourceAlbumDetailState.fromResults(
      AsyncResult.success(data),
      AsyncResult.success([{ sourceId: "ytmusic:album-1" }]),
    );
    expect(state).toEqual({
      _tag: "Ready",
      album: data.album,
      tracks: data.tracks,
      libraryState: { isHot: false },
    });
  });

  it("is LoadError when the source query fails with a typed public error", () => {
    const error = { _tag: "NotFound" as const };
    expect(
      SourceAlbumDetailState.fromResults(
        AsyncResult.failure(Cause.fail(error)),
        AsyncResult.success([]),
      ),
    ).toEqual({ _tag: "LoadError", error });
  });

  it("is Defect when the source query fails with a transport defect", () => {
    const defect = new Error("transport");
    const state = SourceAlbumDetailState.fromResults(
      AsyncResult.failure(Cause.die(defect)),
      AsyncResult.success([]),
    );
    expect(state._tag).toBe("Defect");
    if (state._tag === "Defect") expect(state.defect).toBe(defect);
  });
});
