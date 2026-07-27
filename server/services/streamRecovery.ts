import type { StreamRecoveryHint } from "@shared/sources/types.js";
import { parseId } from "../lib/ids.js";
import * as Queue from "./queue.js";

function originForCurrentQueue(
  source: string,
  context: Queue.QueueContext,
): StreamRecoveryHint["origin"] {
  const sourceId =
    context.type === "radio"
      ? context.seedId
      : context.type === "playlist"
        ? context.playlistId
        : context.type === "album"
          ? context.albumId
          : undefined;
  if (!sourceId) return undefined;
  const parsed = parseId(sourceId);
  if (!parsed.source || parsed.source !== source) return undefined;
  return context.type === "album"
    ? { type: "album", id: parsed.id }
    : { type: "playlist", id: parsed.id };
}

/**
 * Builds non-secret recovery context from the canonical queue. Ephemeral source
 * credentials and media URLs remain owned by the source instance in memory.
 */
export function streamRecoveryHintForQueue(
  state: Queue.QueueState,
  compositeId: string,
): StreamRecoveryHint | undefined {
  const track = state.items.find((item) => item.id === compositeId);
  if (!track) return undefined;
  const origin = originForCurrentQueue(track.source, state.context);
  return {
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    ...(origin ? { origin } : {}),
  };
}

export function getStreamRecoveryHint(
  compositeId: string,
): StreamRecoveryHint | undefined {
  return streamRecoveryHintForQueue(Queue.getState(), compositeId);
}
