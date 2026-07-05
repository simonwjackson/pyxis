import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import { Cause } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type { ApiLibraryAlbum } from "../../../api/contracts/library.js";
import type { ApiPlaylist } from "../../../api/contracts/playlist.js";
import {
  LIBRARY_ALBUMS_TAG,
  LIBRARY_HOT_ALBUMS_TAG,
  PLAYLIST_LIST_TAG,
} from "./libraryReactivityTags";

type HomeSourceError = ApiPublicError | RpcClientError;

export interface HomeSource {
  readonly playlistsQueryAtom: Atom.Atom<
    AsyncResult.AsyncResult<readonly ApiPlaylist[], HomeSourceError>
  >;
  readonly hotAlbumsQueryAtom: Atom.Atom<
    AsyncResult.AsyncResult<readonly ApiLibraryAlbum[], HomeSourceError>
  >;
  readonly discoveryAlbumsQueryAtom: Atom.Atom<
    AsyncResult.AsyncResult<readonly ApiLibraryAlbum[], HomeSourceError>
  >;
  readonly collectionAlbumsQueryAtom: Atom.Atom<
    AsyncResult.AsyncResult<readonly ApiLibraryAlbum[], HomeSourceError>
  >;
  readonly archiveAlbumsQueryAtom: Atom.Atom<
    AsyncResult.AsyncResult<readonly ApiLibraryAlbum[], HomeSourceError>
  >;
}

const rpcHomeSource: HomeSource = {
  playlistsQueryAtom: PyxisRpcClient.query(
    "library.playlists.list",
    undefined,
    {
      reactivityKeys: [PLAYLIST_LIST_TAG] as const,
    },
  ),
  hotAlbumsQueryAtom: PyxisRpcClient.query(
    "library.hotAlbums.list",
    { includeDismissed: true, limit: 10 },
    { reactivityKeys: [LIBRARY_HOT_ALBUMS_TAG, LIBRARY_ALBUMS_TAG] as const },
  ),
  discoveryAlbumsQueryAtom: PyxisRpcClient.query(
    "library.albums.list",
    { placements: ["discovery"] as const },
    { reactivityKeys: [LIBRARY_ALBUMS_TAG] as const },
  ),
  collectionAlbumsQueryAtom: PyxisRpcClient.query(
    "library.albums.list",
    { placements: ["collection"] as const },
    { reactivityKeys: [LIBRARY_ALBUMS_TAG] as const },
  ),
  archiveAlbumsQueryAtom: PyxisRpcClient.query(
    "library.albums.list",
    { placements: ["archive"] as const },
    { reactivityKeys: [LIBRARY_ALBUMS_TAG] as const },
  ),
};

export const homeSourceAtom: Atom.Writable<HomeSource> =
  Atom.make<HomeSource>(rpcHomeSource);

export const HOME_FIXTURE_STATES = [
  "Loading",
  "Ready",
  "Empty",
  "LoadError",
  "Defect",
] as const;

export type HomeFixtureState = (typeof HOME_FIXTURE_STATES)[number];

export function makeHomeFixtureSource(state: HomeFixtureState): HomeSource {
  return {
    playlistsQueryAtom: Atom.make<
      AsyncResult.AsyncResult<readonly ApiPlaylist[], HomeSourceError>
    >(playlistsResultFor(state)),
    hotAlbumsQueryAtom: Atom.make<
      AsyncResult.AsyncResult<readonly ApiLibraryAlbum[], HomeSourceError>
    >(albumsResultFor(state, "collection", true)),
    discoveryAlbumsQueryAtom: Atom.make<
      AsyncResult.AsyncResult<readonly ApiLibraryAlbum[], HomeSourceError>
    >(albumsResultFor(state, "discovery")),
    collectionAlbumsQueryAtom: Atom.make<
      AsyncResult.AsyncResult<readonly ApiLibraryAlbum[], HomeSourceError>
    >(albumsResultFor(state, "collection")),
    archiveAlbumsQueryAtom: Atom.make<
      AsyncResult.AsyncResult<readonly ApiLibraryAlbum[], HomeSourceError>
    >(albumsResultFor(state, "archive")),
  };
}

function playlistsResultFor(
  state: HomeFixtureState,
): AsyncResult.AsyncResult<readonly ApiPlaylist[], HomeSourceError> {
  switch (state) {
    case "Loading":
      return AsyncResult.initial(true);
    case "Empty":
      return AsyncResult.success([]);
    case "LoadError":
      return AsyncResult.failure(Cause.fail(fixtureError));
    case "Defect":
      return AsyncResult.failure(Cause.die(new Error("home fixture defect")));
    case "Ready":
      return AsyncResult.success([
        {
          id: "pandora:station-fixture",
          name: "Fixture Station",
          source: "pandora",
          artworkUrl: "https://example.com/station.jpg",
        },
      ]);
  }
}

function albumsResultFor(
  state: HomeFixtureState,
  placement: ApiLibraryAlbum["placement"],
  hot = false,
): AsyncResult.AsyncResult<readonly ApiLibraryAlbum[], HomeSourceError> {
  switch (state) {
    case "Loading":
      return AsyncResult.initial(true);
    case "Empty":
      return AsyncResult.success([]);
    case "LoadError":
      return AsyncResult.failure(Cause.fail(fixtureError));
    case "Defect":
      return AsyncResult.failure(Cause.die(new Error("home fixture defect")));
    case "Ready":
      return AsyncResult.success([
        {
          id: `album-${placement}`,
          title: `${placement} fixture`,
          artist: "Caliper Fixture",
          placement,
          placementUpdatedAt: 1,
          sourceIds: [`ytmusic:${placement}-fixture`],
          artworkUrl: "https://example.com/album.jpg",
          year: 2026,
          isHot: hot,
          hotRank: hot ? 1 : null,
        },
      ]);
  }
}

const fixtureError: ApiPublicError = {
  _tag: "PersistenceError",
  code: "fixture_home_source_failed",
};
