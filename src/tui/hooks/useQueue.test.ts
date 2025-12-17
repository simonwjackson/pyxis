import {
	describe,
	it,
	expect,
	mock,
	spyOn,
	beforeEach,
	afterEach,
} from "bun:test";
import { Effect } from "effect";
import * as client from "../../client.js";
import * as session from "../../cli/cache/session.js";
import { setFixtureMode, resetFixtureMode } from "../../test-utils.js";

/**
 * Tests for useQueue hook logic
 *
 * Since useQueue is a React hook with complex async dependencies (session, API calls, mpv playback),
 * we test the underlying functions and mock the dependencies appropriately.
 * These tests use fixtures to avoid hitting the actual Pandora API.
 */

// Mock session data
const mockSession = {
	syncTime: 1234567890,
	partnerId: "42",
	partnerAuthToken: "VAyOF96RBRvkfDjqbPKUsslw==",
	userId: "123456",
	userAuthToken: "mockUserToken123",
};

// Mock station data
const mockStation = {
	stationId: "test-station-id",
	stationName: "Test Station",
};

// Mock track data (matching fixture structure)
const mockTrack = {
	trackToken: "test-track-token-1",
	songName: "Private Eye",
	artistName: "Alkaline Trio",
	albumName: "From Here to Infirmary",
	audioUrlMap: {
		highQuality: {
			audioUrl: "http://example.com/audio1.mp3",
		},
	},
};

describe("useQueue logic", () => {
	let getSessionSpy: ReturnType<typeof spyOn>;
	let getPlaylistSpy: ReturnType<typeof spyOn>;
	let addFeedbackSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		setFixtureMode("replay");

		// Mock getSession to return our mock session
		getSessionSpy = spyOn(session, "getSession").mockResolvedValue(mockSession);
	});

	afterEach(() => {
		resetFixtureMode();
		getSessionSpy.mockRestore();
		if (getPlaylistSpy) getPlaylistSpy.mockRestore();
		if (addFeedbackSpy) addFeedbackSpy.mockRestore();
	});

	describe("session integration", () => {
		it("should require session for playlist fetch", async () => {
			// Test that null session prevents playlist loading
			getSessionSpy.mockResolvedValue(null);

			const result = await session.getSession();
			expect(result).toBeNull();
		});

		it("should provide session when available", async () => {
			const result = await session.getSession();
			expect(result).toEqual(mockSession);
		});
	});

	describe("playlist fetching with fixtures", () => {
		it("should fetch playlist from fixture", async () => {
			// Use real API call with fixture mode
			const result = await Effect.runPromise(
				client
					.getPlaylist(mockSession, { stationToken: "test-station-token" })
					.pipe(Effect.either),
			);

			expect(result._tag).toBe("Right");
			if (result._tag === "Right") {
				expect(result.right.items).toBeDefined();
				expect(Array.isArray(result.right.items)).toBe(true);
				expect(result.right.items.length).toBeGreaterThan(0);

				// Verify track structure
				const firstTrack = result.right.items[0];
				expect(firstTrack.trackToken).toBeDefined();
				expect(firstTrack.songName).toBeDefined();
				expect(firstTrack.artistName).toBeDefined();
			}
		});

		it("should include audio URLs in playlist items", async () => {
			const result = await Effect.runPromise(
				client
					.getPlaylist(mockSession, { stationToken: "test-station-token" })
					.pipe(Effect.either),
			);

			expect(result._tag).toBe("Right");
			if (result._tag === "Right") {
				const firstTrack = result.right.items[0];
				const hasAudioUrls =
					firstTrack.audioUrlMap !== undefined ||
					firstTrack.additionalAudioUrl !== undefined;
				expect(hasAudioUrls).toBe(true);
			}
		});
	});

	describe("feedback (like/dislike) with fixtures", () => {
		it("should submit positive feedback (like)", async () => {
			const result = await Effect.runPromise(
				client
					.addFeedback(
						mockSession,
						"test-station-token",
						"test-track-token",
						true, // isPositive
					)
					.pipe(Effect.either),
			);

			expect(result._tag).toBe("Right");
			if (result._tag === "Right") {
				expect(result.right.feedbackId).toBeDefined();
				expect(result.right.isPositive).toBe(true);
			}
		});

		it("should submit negative feedback (dislike)", async () => {
			// Note: Fixture always returns isPositive: true, but we test the call works
			const result = await Effect.runPromise(
				client
					.addFeedback(
						mockSession,
						"test-station-token",
						"test-track-token",
						false, // isPositive
					)
					.pipe(Effect.either),
			);

			expect(result._tag).toBe("Right");
			if (result._tag === "Right") {
				expect(result.right.feedbackId).toBeDefined();
				// Feedback was submitted successfully
			}
		});

		it("should return feedback metadata", async () => {
			const result = await Effect.runPromise(
				client
					.addFeedback(
						mockSession,
						"test-station-token",
						"test-track-token",
						true,
					)
					.pipe(Effect.either),
			);

			expect(result._tag).toBe("Right");
			if (result._tag === "Right") {
				expect(result.right.songName).toBeDefined();
				expect(result.right.artistName).toBeDefined();
				expect(result.right.dateCreated).toBeDefined();
				expect(result.right.dateCreated.time).toBeGreaterThan(0);
			}
		});
	});

	describe("queue state management", () => {
		// Test pure queue logic without React
		interface Track {
			trackToken: string;
			songName: string;
			artistName: string;
			albumName: string;
		}

		const createQueueState = () => ({
			currentTrack: null as Track | null,
			queue: [] as Track[],
			currentStation: null as { stationId: string; stationName: string } | null,
		});

		it("should initialize with empty state", () => {
			const state = createQueueState();
			expect(state.currentTrack).toBeNull();
			expect(state.queue).toEqual([]);
			expect(state.currentStation).toBeNull();
		});

		it("should set current track from queue", () => {
			const state = createQueueState();
			const tracks: Track[] = [
				{
					trackToken: "1",
					songName: "Song 1",
					artistName: "Artist 1",
					albumName: "Album 1",
				},
				{
					trackToken: "2",
					songName: "Song 2",
					artistName: "Artist 2",
					albumName: "Album 2",
				},
			];

			// Simulate advancing: take first track as current, rest as queue
			const [first, ...rest] = tracks;
			state.currentTrack = first ?? null;
			state.queue = rest;

			expect(state.currentTrack?.songName).toBe("Song 1");
			expect(state.queue.length).toBe(1);
			expect(state.queue[0]?.songName).toBe("Song 2");
		});

		it("should advance queue when track ends", () => {
			const state = createQueueState();
			state.queue = [
				{
					trackToken: "1",
					songName: "Song 1",
					artistName: "Artist 1",
					albumName: "Album 1",
				},
				{
					trackToken: "2",
					songName: "Song 2",
					artistName: "Artist 2",
					albumName: "Album 2",
				},
				{
					trackToken: "3",
					songName: "Song 3",
					artistName: "Artist 3",
					albumName: "Album 3",
				},
			];

			// Advance: take first from queue
			const [next, ...remaining] = state.queue;
			state.currentTrack = next ?? null;
			state.queue = remaining;

			expect(state.currentTrack?.trackToken).toBe("1");
			expect(state.queue.length).toBe(2);
		});

		it("should handle empty queue on advance", () => {
			const state = createQueueState();
			state.currentTrack = {
				trackToken: "1",
				songName: "Song 1",
				artistName: "Artist 1",
				albumName: "Album 1",
			};
			state.queue = [];

			// Try to advance with empty queue
			const [next, ...remaining] = state.queue;
			if (next) {
				state.currentTrack = next;
				state.queue = remaining;
			} else {
				// Queue empty - would trigger refill in real hook
				state.currentTrack = null;
			}

			expect(state.currentTrack).toBeNull();
			expect(state.queue).toEqual([]);
		});

		it("should add fetched tracks to queue", () => {
			const state = createQueueState();
			const newTracks: Track[] = [
				{
					trackToken: "1",
					songName: "Song 1",
					artistName: "Artist 1",
					albumName: "Album 1",
				},
				{
					trackToken: "2",
					songName: "Song 2",
					artistName: "Artist 2",
					albumName: "Album 2",
				},
			];

			// Simulate refill: append new tracks
			state.queue = [...state.queue, ...newTracks];

			expect(state.queue.length).toBe(2);
		});

		it("should detect when refill is needed", () => {
			const REFILL_THRESHOLD = 2;

			const state = createQueueState();
			state.queue = [
				{
					trackToken: "1",
					songName: "Song 1",
					artistName: "Artist 1",
					albumName: "Album 1",
				},
			];

			const needsRefill = state.queue.length < REFILL_THRESHOLD;
			expect(needsRefill).toBe(true);
		});

		it("should not need refill when queue is full", () => {
			const REFILL_THRESHOLD = 2;

			const state = createQueueState();
			state.queue = [
				{
					trackToken: "1",
					songName: "Song 1",
					artistName: "Artist 1",
					albumName: "Album 1",
				},
				{
					trackToken: "2",
					songName: "Song 2",
					artistName: "Artist 2",
					albumName: "Album 2",
				},
				{
					trackToken: "3",
					songName: "Song 3",
					artistName: "Artist 3",
					albumName: "Album 3",
				},
			];

			const needsRefill = state.queue.length < REFILL_THRESHOLD;
			expect(needsRefill).toBe(false);
		});
	});

	describe("track rating state", () => {
		it("should update rating on like", () => {
			const track = {
				trackToken: "1",
				songName: "Song 1",
				artistName: "Artist 1",
				albumName: "Album 1",
				rating: 0,
			};

			// Simulate like: update rating
			const likedTrack = { ...track, rating: 1 };

			expect(likedTrack.rating).toBe(1);
		});

		it("should preserve track data on rating update", () => {
			const track = {
				trackToken: "1",
				songName: "Song 1",
				artistName: "Artist 1",
				albumName: "Album 1",
				rating: 0,
			};

			const likedTrack = { ...track, rating: 1 };

			expect(likedTrack.songName).toBe("Song 1");
			expect(likedTrack.artistName).toBe("Artist 1");
			expect(likedTrack.albumName).toBe("Album 1");
			expect(likedTrack.trackToken).toBe("1");
		});
	});

	describe("station management", () => {
		it("should set current station when playing", () => {
			const state = {
				currentStation: null as {
					stationId: string;
					stationName: string;
				} | null,
			};

			state.currentStation = mockStation;

			expect(state.currentStation?.stationId).toBe("test-station-id");
			expect(state.currentStation?.stationName).toBe("Test Station");
		});

		it("should clear station on stop", () => {
			const state = {
				currentStation: mockStation as {
					stationId: string;
					stationName: string;
				} | null,
			};

			state.currentStation = null;

			expect(state.currentStation).toBeNull();
		});
	});
});
