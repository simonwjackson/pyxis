/**
 * @module QueueCoverflowState
 *
 * Pure domain projection for the Queue cover-flow surface. The surface reads
 * the real queue edge (an {@link ApiQueueState} snapshot) and this module
 * turns each AsyncResult into a tagged {@link QueueCoverflowState} union so the
 * page composes state-specific surfaces (skeleton / cover-flow / empty /
 * error) instead of branching on raw stream fields.
 *
 * The album-to-card helpers below remain for fixture callers that project the
 * legacy album shape without importing the production RPC client.
 */

import { AsyncResult } from "effect/unstable/reactivity";
import type {
  ApiQueueState,
  ApiQueueTrack,
} from "../../../../api/contracts/queue.js";

export type QueueCoverflowTrack = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly artwork: string;
  readonly dominantColor: string;
};

export type QueueCoverflowState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Empty" }
  | {
      readonly _tag: "Ready";
      readonly tracks: readonly QueueCoverflowTrack[];
      readonly activeIndex: number;
    }
  | { readonly _tag: "LoadError"; readonly error: unknown }
  | { readonly _tag: "Defect"; readonly defect: unknown };

function trackFromQueueItem(item: ApiQueueTrack): QueueCoverflowTrack | null {
  if (!item.artworkUrl) return null;
  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    artwork: item.artworkUrl,
    dominantColor: colorFromId(item.id),
  };
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.floor(index)), length - 1);
}

export function queueCoverflowStateFromResult(
  result: AsyncResult.AsyncResult<ApiQueueState, unknown>,
): QueueCoverflowState {
  return AsyncResult.matchWithWaiting(result, {
    onWaiting: (): QueueCoverflowState => ({ _tag: "Loading" }),
    onError: (error): QueueCoverflowState => ({ _tag: "LoadError", error }),
    onDefect: (defect): QueueCoverflowState => ({ _tag: "Defect", defect }),
    onSuccess: (success): QueueCoverflowState => {
      const tracks = success.value.items
        .map(trackFromQueueItem)
        .filter((track): track is QueueCoverflowTrack => track !== null);
      if (tracks.length === 0) return { _tag: "Empty" };
      return {
        _tag: "Ready",
        tracks,
        activeIndex: clampIndex(success.value.currentIndex, tracks.length),
      };
    },
  });
}

export type QueueCoverflowAlbumFixture = {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly artworkUrl?: string | null;
};

export function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 45% 48%)`;
}

export function toQueueCoverflowTrack(
  album: QueueCoverflowAlbumFixture,
): QueueCoverflowTrack | null {
  if (!album.artworkUrl) return null;
  return {
    id: album.id,
    title: album.title,
    artist: album.artist,
    artwork: album.artworkUrl,
    dominantColor: colorFromId(album.id),
  };
}

export function queueCoverflowTracksFromAlbums(
  albums: readonly QueueCoverflowAlbumFixture[],
  fallback: readonly QueueCoverflowTrack[],
): readonly QueueCoverflowTrack[] {
  const tracks = albums
    .map(toQueueCoverflowTrack)
    .filter((track): track is QueueCoverflowTrack => track !== null);
  return tracks.length > 0 ? tracks : fallback;
}
