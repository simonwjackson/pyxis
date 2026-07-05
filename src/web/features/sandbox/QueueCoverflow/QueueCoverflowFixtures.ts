/**
 * @module QueueCoverflowFixtures
 *
 * Fixture queue data in the real {@link ApiQueueState} wire shape. The Queue
 * cover-flow surface reads its data through the real queue edge, so its lab /
 * story fixtures must be genuine queue snapshots, not a bespoke card shape.
 */

import type { ApiQueueState } from "../../../../api/contracts/queue.js";

export const QUEUE_COVERFLOW_FIXTURE_TRACKS: ApiQueueState["items"] = [
  {
    id: "ytmusic:seaside-drive",
    title: "Seaside Drive",
    artist: "Luna Mars",
    album: "Coastal Signals",
    duration: 212,
    artworkUrl:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=600&fit=crop",
  },
  {
    id: "ytmusic:crimson-room",
    title: "Crimson Room",
    artist: "Nyx Collective",
    album: "After Hours",
    duration: 245,
    artworkUrl:
      "https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&h=600&fit=crop",
  },
  {
    id: "ytmusic:gaze-pt-2",
    title: "GAZE Pt. 2",
    artist: "Marian Voss",
    album: "Long Exposure",
    duration: 198,
    artworkUrl:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=600&fit=crop",
  },
  {
    id: "ytmusic:bubble-reach",
    title: "BUBBLE REACH",
    artist: "Twilight Mirage",
    album: "Reach",
    duration: 231,
    artworkUrl:
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&h=600&fit=crop",
  },
  {
    id: "ytmusic:blush-hour",
    title: "Blush Hour",
    artist: "Winter Bloom",
    album: "Golden Field",
    duration: 176,
    artworkUrl:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=600&fit=crop",
  },
  {
    id: "ytmusic:neon-drift",
    title: "Neon Drift",
    artist: "Echo Valley",
    album: "Nightlines",
    duration: 263,
    artworkUrl:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&h=600&fit=crop",
  },
  {
    id: "ytmusic:amber-waves",
    title: "Amber Waves",
    artist: "Sol Meridian",
    album: "Meridian",
    duration: 209,
    artworkUrl:
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&h=600&fit=crop",
  },
];

export const QUEUE_COVERFLOW_FIXTURE_STATE: ApiQueueState = {
  items: QUEUE_COVERFLOW_FIXTURE_TRACKS,
  currentIndex: 2,
  context: { type: "manual" },
};
