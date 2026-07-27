import type { ApiPlaybackOutputState } from "@shared/api/contracts/output.js";
import type { AppConfig } from "@shared/config.js";
import { buildStreamUrl } from "../lib/ids.js";
import type { PlayerState } from "../services/player.js";
import type { SonosRoom, SonosTopology } from "./model.js";
import {
  getSonosPositionInfo,
  getSonosTransportInfo,
  getSonosVolume,
  pauseSonos,
  playSonos,
  type SonosPositionInfo,
  type SonosTrackMetadata,
  type SonosTransportInfo,
  seekSonos,
  setSonosTransportUri,
  setSonosVolume,
  stopSonos,
} from "./transport.js";

export type SonosPlaybackProtocol = {
  readonly setUri: (
    room: SonosRoom,
    uri: string,
    metadata: SonosTrackMetadata,
  ) => Promise<void>;
  readonly play: (room: SonosRoom) => Promise<void>;
  readonly pause: (room: SonosRoom) => Promise<void>;
  readonly stop: (room: SonosRoom) => Promise<void>;
  readonly seek: (room: SonosRoom, seconds: number) => Promise<void>;
  readonly setVolume: (room: SonosRoom, volume: number) => Promise<void>;
  readonly readTransport: (room: SonosRoom) => Promise<SonosTransportInfo>;
  readonly readPosition: (room: SonosRoom) => Promise<SonosPositionInfo>;
  readonly readVolume: (room: SonosRoom) => Promise<number | null>;
};

export type SonosCanonicalPlayer = {
  readonly getState: () => Promise<PlayerState>;
  readonly pause: () => Promise<PlayerState>;
  readonly resume: () => Promise<PlayerState>;
  readonly setDuration: (
    seconds: number,
    trackId: string,
  ) => Promise<PlayerState>;
  readonly reportProgress: (
    seconds: number,
    trackId: string,
  ) => Promise<boolean>;
  readonly setVolume: (volume: number) => Promise<PlayerState>;
  readonly trackEnded: (trackId: string) => Promise<PlayerState>;
  readonly reportInterrupted: (trackId: string) => Promise<PlayerState>;
  readonly subscribe: (listener: () => void) => () => void;
};

export type SonosPlaybackDeps = {
  readonly config: AppConfig["sonos"];
  readonly outputState: () => Promise<ApiPlaybackOutputState>;
  readonly subscribeOutput: (listener: () => void) => () => void;
  readonly topology: (refresh: boolean) => Promise<SonosTopology>;
  readonly player: SonosCanonicalPlayer;
  readonly protocol?: SonosPlaybackProtocol;
  readonly now?: () => number;
  readonly setInterval?: (callback: () => void, intervalMs: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
};

export type SonosPlaybackCoordinator = {
  readonly start: () => void;
  readonly stop: () => void;
  readonly requestRealize: () => Promise<void>;
  readonly pollNow: () => Promise<void>;
};

type ResolvedTarget = {
  readonly output: Extract<ApiPlaybackOutputState, { type: "sonos" }>;
  readonly topology: SonosTopology;
  readonly coordinator: SonosRoom;
};

function makeProtocol(config: AppConfig["sonos"]): SonosPlaybackProtocol {
  const timeout = config.requestTimeoutMs;
  return {
    setUri: (room, uri, metadata) =>
      setSonosTransportUri(room, uri, metadata, timeout),
    play: (room) => playSonos(room, timeout),
    pause: (room) => pauseSonos(room, timeout),
    stop: (room) => stopSonos(room, timeout),
    seek: (room, seconds) => seekSonos(room, seconds, timeout),
    setVolume: (room, volume) => setSonosVolume(room, volume, timeout),
    readTransport: (room) => getSonosTransportInfo(room, timeout),
    readPosition: (room) => getSonosPositionInfo(room, timeout),
    readVolume: (room) => getSonosVolume(room, timeout),
  };
}

export function buildSonosStreamUrl(
  lanStreamBaseUrl: string,
  trackId: string,
  nextTrackId?: string,
): string {
  const base = new URL(lanStreamBaseUrl);
  if (base.protocol !== "http:") {
    throw new Error("Sonos LAN stream base URL must use HTTP");
  }
  return new URL(
    buildStreamUrl(trackId, nextTrackId, { format: "mp3" }),
    base,
  ).toString();
}

function findTarget(
  output: ApiPlaybackOutputState,
  topology: SonosTopology,
): ResolvedTarget | undefined {
  if (output.type !== "sonos") return undefined;
  const group = topology.groups.find((candidate) =>
    candidate.rooms.some((room) => room.uuid === output.roomUuid),
  );
  if (!group) return undefined;
  const coordinator = group.rooms.find(
    (room) => room.uuid === group.coordinatorUuid,
  );
  return coordinator ? { output, topology, coordinator } : undefined;
}

function sameUri(left: string | null, right: string): boolean {
  if (!left) return false;
  try {
    return new URL(left).toString() === new URL(right).toString();
  } catch {
    return left === right;
  }
}

function projectedProgress(state: PlayerState, at: number): number {
  if (state.status !== "playing") return state.progress;
  return state.progress + Math.max(0, at - state.updatedAt) / 1000;
}

export function makeSonosPlaybackCoordinator(
  deps: SonosPlaybackDeps,
): SonosPlaybackCoordinator {
  const protocol = deps.protocol ?? makeProtocol(deps.config);
  const now = deps.now ?? Date.now;
  const interval =
    deps.setInterval ?? ((callback, ms) => setInterval(callback, ms));
  const clear =
    deps.clearInterval ??
    ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
  let timer: unknown;
  let unsubscribePlayer: (() => void) | undefined;
  let unsubscribeOutput: (() => void) | undefined;
  let commandChain = Promise.resolve();
  let epoch = 0;
  let commandInFlight = false;
  let applyingPhysicalState = false;
  let settleUntil = 0;
  let polling = false;
  let lastTopologyRefreshAt = 0;
  let lastCoordinatorUuid: string | undefined;
  let lastCoordinatorRoom: SonosRoom | undefined;
  let lastAnchorUuid: string | undefined;
  let lastLoadedTrackId: string | undefined;
  let lastExpectedUri: string | undefined;
  let lastDesiredState: PlayerState | undefined;
  let playbackGeneration = 0;
  let endedGeneration: number | undefined;
  let lastObservedGeneration: number | undefined;
  let lastObservedTransportState: string | undefined;
  let interruptedUri: string | undefined;

  const resolveTarget = async (
    forceRefresh: boolean,
  ): Promise<ResolvedTarget | undefined> => {
    const output = await deps.outputState();
    if (output.type !== "sonos") return undefined;
    const shouldRefresh =
      forceRefresh ||
      now() - lastTopologyRefreshAt >=
        deps.config.discoveryIntervalSeconds * 1000;
    const topology = await deps.topology(shouldRefresh);
    if (shouldRefresh) lastTopologyRefreshAt = now();
    return findTarget(output, topology);
  };

  const realize = async (requestedEpoch: number): Promise<void> => {
    if (!deps.config.enabled || !deps.config.lanStreamBaseUrl) return;
    const selectedOutput = await deps.outputState().catch(() => undefined);
    if (!selectedOutput || selectedOutput.type !== "sonos") {
      if (lastCoordinatorRoom) {
        await protocol.stop(lastCoordinatorRoom).catch(() => undefined);
      }
      lastCoordinatorUuid = undefined;
      lastCoordinatorRoom = undefined;
      lastAnchorUuid = undefined;
      lastLoadedTrackId = undefined;
      lastExpectedUri = undefined;
      return;
    }
    const target = await resolveTarget(false).catch(() => undefined);
    if (!target || requestedEpoch !== epoch) return;
    const state = await deps.player.getState();
    if (requestedEpoch !== epoch) return;
    commandInFlight = true;
    try {
      const coordinatorChanged =
        lastCoordinatorUuid !== target.coordinator.uuid;
      const outputChanged =
        lastAnchorUuid !== undefined &&
        lastAnchorUuid !== target.output.roomUuid;
      if (outputChanged && lastCoordinatorRoom) {
        await protocol.stop(lastCoordinatorRoom).catch(() => undefined);
      }
      if (!state.currentTrack || state.status === "stopped") {
        await protocol.stop(target.coordinator).catch(() => undefined);
        lastCoordinatorUuid = target.coordinator.uuid;
        lastCoordinatorRoom = target.coordinator;
        lastAnchorUuid = target.output.roomUuid;
        lastLoadedTrackId = undefined;
        lastExpectedUri = undefined;
        lastDesiredState = state;
        return;
      }

      await protocol
        .setVolume(target.coordinator, Math.round(state.volume))
        .catch(() => undefined);
      const uri = buildSonosStreamUrl(
        deps.config.lanStreamBaseUrl,
        state.currentTrack.id,
        state.nextTrack?.id,
      );
      const trackChanged = lastLoadedTrackId !== state.currentTrack.id;
      if (coordinatorChanged || trackChanged || lastExpectedUri !== uri) {
        await protocol.setUri(target.coordinator, uri, {
          title: state.currentTrack.title,
          creator: state.currentTrack.artist,
          album: state.currentTrack.album,
          artworkUrl: state.currentTrack.artworkUrl,
          mimeType: "audio/mpeg",
        });
        lastLoadedTrackId = state.currentTrack.id;
        lastExpectedUri = uri;
        playbackGeneration += 1;
        endedGeneration = undefined;
        lastObservedGeneration = undefined;
        lastObservedTransportState = undefined;
        interruptedUri = undefined;
      }

      const previous = lastDesiredState;
      const expectedPreviousProgress = previous
        ? projectedProgress(previous, now())
        : 0;
      const explicitSeek =
        !trackChanged &&
        previous !== undefined &&
        Math.abs(state.progress - expectedPreviousProgress) > 2;
      if (
        state.progress > 0 &&
        (trackChanged ||
          coordinatorChanged ||
          explicitSeek ||
          state.status === "paused")
      ) {
        await protocol.seek(target.coordinator, state.progress);
      }
      if (state.status === "playing") await protocol.play(target.coordinator);
      else await protocol.pause(target.coordinator);
      lastCoordinatorUuid = target.coordinator.uuid;
      lastCoordinatorRoom = target.coordinator;
      lastAnchorUuid = target.output.roomUuid;
      lastDesiredState = state;
      settleUntil = now() + Math.max(750, deps.config.pollIntervalMs * 2);
    } catch {
      lastTopologyRefreshAt = 0;
    } finally {
      commandInFlight = false;
    }
  };

  const requestRealize = (): Promise<void> => {
    if (applyingPhysicalState) return Promise.resolve();
    const requestedEpoch = ++epoch;
    const operation = commandChain.then(
      () => realize(requestedEpoch),
      () => realize(requestedEpoch),
    );
    commandChain = operation.catch(() => undefined);
    return operation;
  };

  const applyPhysical = async (
    operation: () => Promise<unknown>,
  ): Promise<void> => {
    applyingPhysicalState = true;
    try {
      await operation();
    } finally {
      applyingPhysicalState = false;
    }
  };

  const pollNow = async (): Promise<void> => {
    if (
      polling ||
      commandInFlight ||
      now() < settleUntil ||
      !deps.config.enabled ||
      !deps.config.lanStreamBaseUrl
    )
      return;
    polling = true;
    const pollEpoch = epoch;
    try {
      let target = await resolveTarget(false);
      if (!target) {
        target = await resolveTarget(true).catch(() => undefined);
        if (!target) return;
      }
      if (
        target.coordinator.uuid !== lastCoordinatorUuid ||
        lastLoadedTrackId === undefined
      ) {
        await requestRealize();
        return;
      }
      const [transport, position, volume, canonical] = await Promise.all([
        protocol.readTransport(target.coordinator),
        protocol.readPosition(target.coordinator),
        protocol.readVolume(target.coordinator),
        deps.player.getState(),
      ]);
      if (commandInFlight || pollEpoch !== epoch) return;

      const refreshed = await resolveTarget(false);
      if (!refreshed) return;
      if (refreshed.coordinator.uuid !== target.coordinator.uuid) {
        lastCoordinatorUuid = undefined;
        void requestRealize();
        return;
      }
      if (!canonical.currentTrack || canonical.status === "stopped") return;
      const canonicalTrack = canonical.currentTrack;
      const expectedUri = buildSonosStreamUrl(
        deps.config.lanStreamBaseUrl,
        canonical.currentTrack.id,
        canonical.nextTrack?.id,
      );
      if (!sameUri(position.uri, expectedUri)) {
        const externalUri = position.uri?.trim() ?? "";
        if (externalUri && externalUri !== interruptedUri) {
          interruptedUri = externalUri;
          await applyPhysical(async () => {
            if (canonical.status === "playing") await deps.player.pause();
            await deps.player.reportInterrupted(canonicalTrack.id);
          });
        }
        return;
      }
      interruptedUri = undefined;
      lastExpectedUri = expectedUri;
      lastLoadedTrackId = canonical.currentTrack.id;
      lastCoordinatorUuid = target.coordinator.uuid;

      let realizeAfterPhysical = false;
      await applyPhysical(async () => {
        const trackId = canonicalTrack.id;
        if (
          position.durationSeconds !== null &&
          position.durationSeconds > 0 &&
          Math.abs(position.durationSeconds - canonical.duration) > 0.5
        ) {
          await deps.player.setDuration(position.durationSeconds, trackId);
        }
        if (
          position.positionSeconds !== null &&
          Math.abs(position.positionSeconds - canonical.progress) > 1.5
        ) {
          await deps.player.reportProgress(position.positionSeconds, trackId);
        }
        if (volume !== null && Math.abs(volume - canonical.volume) >= 1) {
          await deps.player.setVolume(volume);
        }

        const sonosState = transport.state.toUpperCase();
        const reportedDuration =
          position.durationSeconds !== null && position.durationSeconds > 0
            ? position.durationSeconds
            : canonical.duration;
        const nearEnd =
          position.positionSeconds !== null &&
          reportedDuration > 0 &&
          position.positionSeconds >= reportedDuration - 1.5;
        const naturallyStopped =
          lastObservedGeneration === playbackGeneration &&
          lastObservedTransportState === "PLAYING" &&
          sonosState === "STOPPED";
        lastObservedGeneration = playbackGeneration;
        lastObservedTransportState = sonosState;
        if (sonosState === "STOPPED" && (nearEnd || naturallyStopped)) {
          if (endedGeneration !== playbackGeneration) {
            endedGeneration = playbackGeneration;
            await deps.player.trackEnded(trackId);
            lastLoadedTrackId = undefined;
            realizeAfterPhysical = true;
          }
        } else if (
          sonosState === "PAUSED_PLAYBACK" &&
          canonical.status === "playing"
        ) {
          await deps.player.pause();
        } else if (sonosState === "PLAYING" && canonical.status === "paused") {
          await deps.player.resume();
        } else if (sonosState === "STOPPED" && canonical.status === "playing") {
          await deps.player.pause();
        }
      });
      if (realizeAfterPhysical) await requestRealize();
    } catch {
      lastTopologyRefreshAt = 0;
    } finally {
      polling = false;
    }
  };

  return {
    start: () => {
      if (timer !== undefined) return;
      unsubscribePlayer = deps.player.subscribe(() => void requestRealize());
      unsubscribeOutput = deps.subscribeOutput(() => void requestRealize());
      timer = interval(() => void pollNow(), deps.config.pollIntervalMs);
      void requestRealize();
    },
    stop: () => {
      if (timer !== undefined) clear(timer);
      timer = undefined;
      unsubscribePlayer?.();
      unsubscribeOutput?.();
      unsubscribePlayer = undefined;
      unsubscribeOutput = undefined;
    },
    requestRealize,
    pollNow,
  };
}
