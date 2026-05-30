/**
 * @module BookmarksPage
 * Page for viewing and managing bookmarked artists and songs.
 *
 * Reads `library.bookmarks.list` through the Effect RPC client and adapts
 * the AsyncResult into the pure {@link BookmarksState} ADT before
 * rendering. Bookmark removals publish {@link LIBRARY_BOOKMARKS_TAG}
 * (mirroring the legacy `utils.library.bookmarks.invalidate()`), and
 * station creation publishes {@link RADIO_STATIONS_TAG} (mirroring the
 * legacy `utils.radio.list.invalidate()`).
 */

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Music, Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import { Button } from "@app/shared/ui/Button";
import { Spinner } from "@app/shared/ui/Spinner";
import { RADIO_STATIONS_TAG } from "../stations/radioReactivityTags";
import { BookmarksState } from "./BookmarksState";
import { LIBRARY_BOOKMARKS_TAG } from "./bookmarksReactivityTags";

const bookmarksReactivityKeys = [LIBRARY_BOOKMARKS_TAG] as const;

const bookmarksQueryAtom = PyxisRpcClient.query(
  "library.bookmarks.list",
  undefined,
  {
    reactivityKeys: bookmarksReactivityKeys,
  },
);

const removeBookmarkMutationAtom = PyxisRpcClient.mutation(
  "library.bookmark.remove",
);
const removeBookmarkReactivityKeys = [LIBRARY_BOOKMARKS_TAG] as const;

const createStationMutationAtom = PyxisRpcClient.mutation(
  "radio.station.create",
);
const createStationReactivityKeys = [RADIO_STATIONS_TAG] as const;

/**
 * Bookmarks page displaying user's saved artists and songs.
 * Allows removing bookmarks and creating stations from bookmarked items.
 */
export function BookmarksPage() {
  const result = projectQueryResult(useAtomValue(bookmarksQueryAtom));
  const state = BookmarksState.fromResult(result);

  const removeBookmark = useAtomSet(removeBookmarkMutationAtom, {
    mode: "promiseExit",
  });
  const createStation = useAtomSet(createStationMutationAtom, {
    mode: "promiseExit",
  });

  const handleCreateStation = (musicToken: string, kind: "artist" | "song") => {
    void createStation({
      payload: { musicToken, musicType: kind },
      reactivityKeys: createStationReactivityKeys,
    }).then((exit) => {
      if (exit._tag === "Success") {
        toast.success("station created");
      } else {
        toast.error("Failed to create station");
      }
    });
  };

  const handleRemoveBookmark = (
    bookmarkToken: string,
    kind: "artist" | "song",
  ) => {
    void removeBookmark({
      payload: { bookmarkToken, type: kind },
      reactivityKeys: removeBookmarkReactivityKeys,
    }).then((exit) => {
      if (exit._tag === "Success") {
        toast.success(
          kind === "artist"
            ? "artist bookmark removed"
            : "song bookmark removed",
        );
      } else {
        toast.error("Failed to remove bookmark");
      }
    });
  };

  if (state._tag === "Loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (state._tag === "LoadError" || state._tag === "Defect") {
    return (
      <div className="flex-1 px-4 sm:px-8 py-10">
        <p className="text-[var(--color-error)]">failed to load bookmarks</p>
      </div>
    );
  }

  const artists = state._tag === "Ready" ? state.artists : [];
  const songs = state._tag === "Ready" ? state.songs : [];

  return (
    <div className="flex-1 px-4 sm:px-8 py-10 space-y-8">
      <h2 className="zune-display zune-page-title text-[var(--color-text)]">
        bookmarks
      </h2>

      {artists.length > 0 && (
        <section>
          <h3 className="zune-label text-[var(--color-text-muted)] mb-2">
            artists
          </h3>
          <ul className="space-y-1">
            {artists.map((artist) => (
              <li
                key={artist.bookmarkToken}
                className="flex items-center gap-3 p-3 hover:bg-[var(--color-bg-highlight)] group"
              >
                <div className="w-10 h-10 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-[var(--color-text-muted)]" />
                </div>
                <span className="flex-1 zune-list-title text-[var(--color-text)]">
                  {artist.artistName}
                </span>
                <div className="flex items-center gap-1 max-md:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-success)]"
                    onClick={() =>
                      handleCreateStation(artist.musicToken, "artist")
                    }
                    title="Create station"
                    aria-label={`Create station from ${artist.artistName}`}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                    onClick={() =>
                      handleRemoveBookmark(artist.bookmarkToken, "artist")
                    }
                    title="Remove bookmark"
                    aria-label={`Remove ${artist.artistName} bookmark`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {songs.length > 0 && (
        <section>
          <h3 className="zune-label text-[var(--color-text-muted)] mb-2">
            songs
          </h3>
          <ul className="space-y-1">
            {songs.map((song) => (
              <li
                key={song.bookmarkToken}
                className="flex items-center gap-3 p-3 hover:bg-[var(--color-bg-highlight)] group"
              >
                <div className="w-10 h-10 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
                  <Music className="w-5 h-5 text-[var(--color-text-muted)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="zune-list-title text-[var(--color-text)] truncate">
                    {song.songName}
                  </p>
                  <p className="zune-eyebrow text-[var(--color-text-dim)]">
                    {song.artistName}
                  </p>
                </div>
                <div className="flex items-center gap-1 max-md:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-success)]"
                    onClick={() => handleCreateStation(song.musicToken, "song")}
                    title="Create station"
                    aria-label={`Create station from ${song.songName}`}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                    onClick={() =>
                      handleRemoveBookmark(song.bookmarkToken, "song")
                    }
                    title="Remove bookmark"
                    aria-label={`Remove ${song.songName} bookmark`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {state._tag === "Empty" && (
        <div className="py-16 text-[var(--color-text-dim)]">
          <p className="zune-display text-4xl text-[var(--color-text-dim)]/40 mb-4">
            no bookmarks
          </p>
          <p className="text-sm">bookmark artists and songs while playing.</p>
        </div>
      )}
    </div>
  );
}
