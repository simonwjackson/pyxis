import type { AndroidMediaBridgeState } from "../../src/api/contracts/androidMediaBridge.js";
import type { PlayerStateView } from "./playerStateView.js";

export type AudioRealization = {
  readonly observedAt: number | null;
  readonly failed: boolean;
};

export type AndroidMediaBridgeProjectionOptions = {
  readonly publishedAt: number;
  readonly stateRevision: number;
  readonly audio: AudioRealization;
};

export function toAndroidMediaBridgeState(
  view: PlayerStateView,
  options: AndroidMediaBridgeProjectionOptions,
): AndroidMediaBridgeState {
  const availability = getAvailability(view, options.audio);
  return {
    status: availability === "audio_failed" ? "defect" : view.status,
    availability,
    currentTrack: view.currentTrack,
    progress: Math.max(0, view.progress),
    duration: Math.max(0, view.duration),
    stateRevision: options.stateRevision,
    stateUpdatedAt: view.updatedAt,
    publishedAt: options.publishedAt,
    audioObservedAt: options.audio.observedAt,
    availableActions: getAvailableActions(view, availability),
  };
}

function getAvailability(
  view: PlayerStateView,
  audio: AudioRealization,
): AndroidMediaBridgeState["availability"] {
  if (audio.failed) return "audio_failed";
  if (view.status === "playing" && audio.observedAt === null)
    return "audio_unknown";
  return "controllable";
}

function getAvailableActions(
  view: PlayerStateView,
  availability: AndroidMediaBridgeState["availability"],
): AndroidMediaBridgeState["availableActions"] {
  if (availability !== "controllable") return [];
  if (!view.currentTrack) return [];
  switch (view.status) {
    case "playing":
      return ["pause", "next", "previous"];
    case "paused":
      return ["play", "next", "previous"];
    case "stopped":
      return [];
  }
}
