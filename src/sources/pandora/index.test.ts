import { describe, expect, it } from "bun:test";
import type { PandoraSession } from "./client.js";
import { createPandoraSource } from "./index.js";
import type { PlaylistItem } from "./types/api.js";

const session: PandoraSession = {
  syncTime: 0,
  partnerId: "partner",
  partnerAuthToken: "partner-token",
  userId: "user",
  userAuthToken: "user-token",
};

describe("Pandora restored stream recovery", () => {
  it("skips non-track radio items and aliases a fresh match to the persisted queue identity", async () => {
    let stationId = "";
    const source = createPandoraSource(session, {
      getPlaylistWithQuality: async (id) => {
        stationId = id;
        return {
          items: [
            {
              trackToken: "ad-token",
              songName: undefined,
              artistName: undefined,
              albumName: undefined,
            } as unknown as PlaylistItem,
            {
              trackToken: "fresh-token",
              songName: "Persisted Song",
              artistName: "Persisted Artist",
              albumName: "Persisted Album",
              additionalAudioUrl: "https://audio.example/fresh.mp3",
            },
          ],
        };
      },
    });

    await expect(source.getStreamUrl("persisted-token")).rejects.toThrow(
      "No stream URL available",
    );
    const url = await source.rehydrateStreamUrl("persisted-token", {
      trackId: "pandora:persisted-token",
      title: "Persisted Song",
      artist: "Persisted Artist",
      album: "Persisted Album",
      origin: { type: "playlist", id: "89722349997272453" },
    });

    expect(stationId).toBe("89722349997272453");
    expect(url).toBe("https://audio.example/fresh.mp3");
    expect(await source.getStreamUrl("persisted-token")).toBe(url);
  });

  it("fails clearly when refreshed station contents cannot identify the track", async () => {
    const source = createPandoraSource(session, {
      getPlaylistWithQuality: async () => ({
        items: [
          {
            trackToken: "other-token",
            songName: "Different Song",
            artistName: "Different Artist",
            albumName: "Different Album",
            additionalAudioUrl: "https://audio.example/other.mp3",
          },
        ],
      }),
    });

    await expect(
      source.rehydrateStreamUrl("persisted-token", {
        trackId: "pandora:persisted-token",
        title: "Persisted Song",
        artist: "Persisted Artist",
        album: "Persisted Album",
        origin: { type: "playlist", id: "station-token" },
      }),
    ).rejects.toThrow(
      'Pandora refreshed station "station-token" but did not return "Persisted Song" by "Persisted Artist"',
    );
  });
});
