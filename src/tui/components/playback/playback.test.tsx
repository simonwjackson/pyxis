import { describe, it, expect, mock } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ThemeProvider, loadTheme } from "../../theme/index.js";
import { NowPlayingView } from "./index.js";

/**
 * Tests for NowPlayingView component
 * Uses ink-testing-library for component rendering tests
 *
 * Note: All tests must call unmount() to properly clean up the useInput hook
 */

// Mock track data
const mockTrack = {
	trackToken: "track-123",
	songName: "Comfortably Numb",
	artistName: "Pink Floyd",
	albumName: "The Wall",
	albumYear: 1979,
	duration: 382,
};

// Mock station data
const mockStation = {
	stationId: "station-123",
	stationName: "Rock Radio",
};

// Mock queue data
const mockQueue = [
	{
		trackToken: "track-456",
		songName: "Time",
		artistName: "Pink Floyd",
		albumName: "The Dark Side of the Moon",
		duration: 413,
	},
	{
		trackToken: "track-789",
		songName: "Money",
		artistName: "Pink Floyd",
		albumName: "The Dark Side of the Moon",
		duration: 382,
	},
	{
		trackToken: "track-101",
		songName: "Wish You Were Here",
		artistName: "Pink Floyd",
		albumName: "Wish You Were Here",
		duration: 334,
	},
];

// Wrapper component for theme context
const ThemedWrapper: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const theme = loadTheme("pyxis");
	return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};

// Helper to wait for async operations
const waitForAsync = (ms = 50) =>
	new Promise((resolve) => setTimeout(resolve, ms));

describe("NowPlayingView", () => {
	describe("visibility and rendering", () => {
		it("should render when track is provided", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).not.toBe("");
			unmount();
		});

		it("should show 'No track playing' when track is null", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={null}
						station={mockStation}
						queue={[]}
						position={0}
						isPlaying={false}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("No track playing");
			unmount();
		});

		it("should display NOW PLAYING header", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("NOW PLAYING");
			unmount();
		});

		it("should display track name", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("Comfortably Numb");
			unmount();
		});

		it("should display artist name", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("Pink Floyd");
			unmount();
		});

		it("should display album name", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("The Wall");
			unmount();
		});

		it("should display album year", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("1979");
			unmount();
		});

		it("should display station name", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("Rock Radio");
			unmount();
		});
	});

	describe("button display", () => {
		it("should show Like button with (+) hint", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";
			expect(frame).toContain("Like");
			expect(frame).toContain("(+)");
			unmount();
		});

		it("should show Dislike button with (-) hint", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";
			expect(frame).toContain("Dislike");
			expect(frame).toContain("(-)");
			unmount();
		});

		it("should show Sleep button with (z) hint", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";
			expect(frame).toContain("Sleep");
			expect(frame).toContain("(z)");
			unmount();
		});

		it("should show Next button with (n) hint", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";
			expect(frame).toContain("(n)");
			unmount();
		});

		it("should show Play/Pause button with (space) hint", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("(space)");
			unmount();
		});

		it("should show play icon when paused", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={false}
					/>
				</ThemedWrapper>,
			);

			// Play icon is ▶
			expect(lastFrame()).toContain("▶");
			unmount();
		});

		it("should show pause icon when playing", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			// Pause icon is ⏸
			expect(lastFrame()).toContain("⏸");
			unmount();
		});

		it("should show like icon (heart)", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			// Like icon is ♥
			expect(lastFrame()).toContain("♥");
			unmount();
		});

		it("should show dislike icon", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			// Dislike icon is ✗
			expect(lastFrame()).toContain("✗");
			unmount();
		});
	});

	describe("queue display", () => {
		it("should show 'Up Next' section", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("Up Next");
			unmount();
		});

		it("should display queue tracks", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";
			expect(frame).toContain("Time");
			expect(frame).toContain("Money");
			expect(frame).toContain("Wish You Were Here");
			unmount();
		});

		it("should display queue track numbers", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";
			expect(frame).toContain("1.");
			expect(frame).toContain("2.");
			expect(frame).toContain("3.");
			unmount();
		});

		it("should not show Up Next section when queue is empty", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={[]}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).not.toContain("Up Next");
			unmount();
		});

		it("should limit visible queue to 4 tracks", () => {
			const longQueue = [
				...mockQueue,
				{
					trackToken: "track-102",
					songName: "Brain Damage",
					artistName: "Pink Floyd",
					albumName: "The Dark Side of the Moon",
					duration: 228,
				},
				{
					trackToken: "track-103",
					songName: "Eclipse",
					artistName: "Pink Floyd",
					albumName: "The Dark Side of the Moon",
					duration: 130,
				},
			];

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={longQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";
			// Should show first 4 tracks
			expect(frame).toContain("Time");
			expect(frame).toContain("Money");
			expect(frame).toContain("Wish You Were Here");
			expect(frame).toContain("Brain Damage");
			// Should not show 5th track
			expect(frame).not.toContain("Eclipse");
			unmount();
		});
	});

	describe("callbacks", () => {
		it("should accept onLike callback", () => {
			const onLike = mock(() => {});

			const { unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
						onLike={onLike}
					/>
				</ThemedWrapper>,
			);

			// Callback should not be called on render
			expect(onLike).not.toHaveBeenCalled();
			unmount();
		});

		it("should accept onDislike callback", () => {
			const onDislike = mock(() => {});

			const { unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
						onDislike={onDislike}
					/>
				</ThemedWrapper>,
			);

			expect(onDislike).not.toHaveBeenCalled();
			unmount();
		});

		it("should accept onSleep callback", () => {
			const onSleep = mock(() => {});

			const { unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
						onSleep={onSleep}
					/>
				</ThemedWrapper>,
			);

			expect(onSleep).not.toHaveBeenCalled();
			unmount();
		});

		it("should accept onNext callback", () => {
			const onNext = mock(() => {});

			const { unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
						onNext={onNext}
					/>
				</ThemedWrapper>,
			);

			expect(onNext).not.toHaveBeenCalled();
			unmount();
		});

		it("should accept onTogglePlay callback", () => {
			const onTogglePlay = mock(() => {});

			const { unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
						onTogglePlay={onTogglePlay}
					/>
				</ThemedWrapper>,
			);

			expect(onTogglePlay).not.toHaveBeenCalled();
			unmount();
		});

		it("should accept onPrev callback", () => {
			const onPrev = mock(() => {});

			const { unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
						onPrev={onPrev}
					/>
				</ThemedWrapper>,
			);

			expect(onPrev).not.toHaveBeenCalled();
			unmount();
		});
	});

	describe("progress display", () => {
		it("should show progress bar", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";
			// Progress bar uses ━ for filled and ─ for empty
			expect(frame.includes("━") || frame.includes("─")).toBe(true);
			unmount();
		});

		it("should display progress knob", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			// Progress knob is ○
			expect(lastFrame()).toContain("○");
			unmount();
		});

		it("should display current position", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			// 120 seconds = 2:00
			expect(lastFrame()).toContain("2:00");
			unmount();
		});

		it("should display track duration", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			// 382 seconds = 6:22
			expect(lastFrame()).toContain("6:22");
			unmount();
		});

		it("should show time format as current / total", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("/");
			unmount();
		});

		it("should handle position 0", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={0}
						isPlaying={false}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("0:00");
			unmount();
		});

		it("should handle track without duration", () => {
			const trackWithoutDuration = {
				...mockTrack,
				duration: undefined,
			};

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={trackWithoutDuration}
						station={mockStation}
						queue={mockQueue}
						position={0}
						isPlaying={false}
					/>
				</ThemedWrapper>,
			);

			// Should still render without crashing
			expect(lastFrame()).toContain("0:00 / 0:00");
			unmount();
		});
	});

	describe("station info", () => {
		it("should display station panel", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("Rock Radio");
			unmount();
		});

		it("should show 'Personalized radio station' when no seeds", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("Personalized radio station");
			unmount();
		});

		it("should display seeds when provided", () => {
			const stationWithSeeds = {
				...mockStation,
				seeds: ["Pink Floyd (artist)", "Psychedelic Rock (genre)"],
			};

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={stationWithSeeds}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";
			expect(frame).toContain("Based on:");
			expect(frame).toContain("Pink Floyd (artist)");
			expect(frame).toContain("Psychedelic Rock (genre)");
			unmount();
		});

		it("should not display station panel when station is null", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={null}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).not.toContain("Personalized radio station");
			unmount();
		});
	});

	describe("keyboard input handling", () => {
		it("should call onLike when + is pressed", async () => {
			const onLike = mock(() => {});

			const { stdin, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
						onLike={onLike}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();
			stdin.write("+");
			await waitForAsync();

			expect(onLike).toHaveBeenCalledTimes(1);
			unmount();
		});

		it("should call onDislike when - is pressed", async () => {
			const onDislike = mock(() => {});

			const { stdin, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
						onDislike={onDislike}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();
			stdin.write("-");
			await waitForAsync();

			expect(onDislike).toHaveBeenCalledTimes(1);
			unmount();
		});

		it("should call onSleep when z is pressed", async () => {
			const onSleep = mock(() => {});

			const { stdin, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
						onSleep={onSleep}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();
			stdin.write("z");
			await waitForAsync();

			expect(onSleep).toHaveBeenCalledTimes(1);
			unmount();
		});

		it("should call onNext when n is pressed", async () => {
			const onNext = mock(() => {});

			const { stdin, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
						onNext={onNext}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();
			stdin.write("n");
			await waitForAsync();

			expect(onNext).toHaveBeenCalledTimes(1);
			unmount();
		});

		it("should call onTogglePlay when space is pressed", async () => {
			const onTogglePlay = mock(() => {});

			const { stdin, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
						onTogglePlay={onTogglePlay}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();
			stdin.write(" ");
			await waitForAsync();

			expect(onTogglePlay).toHaveBeenCalledTimes(1);
			unmount();
		});

		it("should not crash when callbacks are not provided", async () => {
			const { stdin, lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Press all keys without callbacks
			stdin.write("+");
			await waitForAsync();
			stdin.write("-");
			await waitForAsync();
			stdin.write("z");
			await waitForAsync();
			stdin.write("n");
			await waitForAsync();
			stdin.write(" ");
			await waitForAsync();

			// Should still render without crashing
			expect(lastFrame()).toContain("NOW PLAYING");
			unmount();
		});
	});

	describe("album info formatting", () => {
		it("should display album info with dot separators", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			// Album info uses · as separator
			expect(lastFrame()).toContain("·");
			unmount();
		});

		it("should handle track without album year", () => {
			const trackWithoutYear = {
				...mockTrack,
				albumYear: undefined,
			};

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={trackWithoutYear}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";
			expect(frame).toContain("Pink Floyd");
			expect(frame).toContain("The Wall");
			// Should not contain year
			expect(frame).not.toContain("1979");
			unmount();
		});
	});

	describe("panel structure", () => {
		it("should be wrapped in a panel structure", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			// Panel uses box drawing characters
			const frame = lastFrame() || "";
			expect(
				frame.includes("─") || frame.includes("│") || frame.includes("┐"),
			).toBe(true);
			unmount();
		});
	});

	describe("playback control icons", () => {
		it("should display previous track icon", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			// Previous icon is ⏮
			expect(lastFrame()).toContain("⏮");
			unmount();
		});

		it("should display next track icon", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<NowPlayingView
						track={mockTrack}
						station={mockStation}
						queue={mockQueue}
						position={120}
						isPlaying={true}
					/>
				</ThemedWrapper>,
			);

			// Next icon is ⏭
			expect(lastFrame()).toContain("⏭");
			unmount();
		});
	});
});

describe("NowPlayingView with different data configurations", () => {
	it("should handle track with long names", () => {
		const longNameTrack = {
			trackToken: "track-long",
			songName:
				"This Is A Very Long Song Name That Should Be Truncated For Display Purposes",
			artistName: "This Is Also A Very Long Artist Name That Needs Truncation",
			albumName: "Super Long Album Name That Goes On Forever And Ever",
			albumYear: 2023,
			duration: 300,
		};

		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<NowPlayingView
					track={longNameTrack}
					station={mockStation}
					queue={[]}
					position={0}
					isPlaying={false}
				/>
			</ThemedWrapper>,
		);

		// Should contain truncation indicator (ellipsis)
		expect(lastFrame()?.includes("…")).toBe(true);
		unmount();
	});

	it("should handle minimum data", () => {
		const minTrack = {
			trackToken: "track-min",
			songName: "Song",
			artistName: "Artist",
			albumName: "Album",
		};

		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<NowPlayingView
					track={minTrack}
					station={null}
					queue={[]}
					position={0}
					isPlaying={false}
				/>
			</ThemedWrapper>,
		);

		const frame = lastFrame() || "";
		expect(frame).toContain("Song");
		expect(frame).toContain("Artist");
		expect(frame).toContain("Album");
		unmount();
	});

	it("should handle single track in queue", () => {
		const singleQueue = [
			{
				trackToken: "track-single",
				songName: "Only Track",
				artistName: "Solo Artist",
				albumName: "Single Album",
				duration: 200,
			},
		];

		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<NowPlayingView
					track={mockTrack}
					station={mockStation}
					queue={singleQueue}
					position={0}
					isPlaying={false}
				/>
			</ThemedWrapper>,
		);

		const frame = lastFrame() || "";
		expect(frame).toContain("Up Next");
		expect(frame).toContain("Only Track");
		expect(frame).toContain("1.");
		// Should not have "2."
		expect(frame).not.toContain("2.");
		unmount();
	});

	it("should handle progress at end of track", () => {
		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<NowPlayingView
					track={mockTrack}
					station={mockStation}
					queue={mockQueue}
					position={382}
					isPlaying={true}
				/>
			</ThemedWrapper>,
		);

		// 382 seconds = 6:22 (same as duration)
		const frame = lastFrame() || "";
		// Both current and duration should be 6:22
		expect(frame).toContain("6:22 / 6:22");
		unmount();
	});

	it("should handle progress exceeding duration", () => {
		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<NowPlayingView
					track={mockTrack}
					station={mockStation}
					queue={mockQueue}
					position={500}
					isPlaying={true}
				/>
			</ThemedWrapper>,
		);

		// Should not crash
		expect(lastFrame()).toContain("NOW PLAYING");
		unmount();
	});

	it("should handle station with empty seeds array", () => {
		const stationEmptySeeds = {
			...mockStation,
			seeds: [],
		};

		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<NowPlayingView
					track={mockTrack}
					station={stationEmptySeeds}
					queue={mockQueue}
					position={120}
					isPlaying={true}
				/>
			</ThemedWrapper>,
		);

		// Should show default message, not "Based on:"
		expect(lastFrame()).toContain("Personalized radio station");
		expect(lastFrame()).not.toContain("Based on:");
		unmount();
	});

	it("should handle station with single seed", () => {
		const stationSingleSeed = {
			...mockStation,
			seeds: ["Pink Floyd (artist)"],
		};

		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<NowPlayingView
					track={mockTrack}
					station={stationSingleSeed}
					queue={mockQueue}
					position={120}
					isPlaying={true}
				/>
			</ThemedWrapper>,
		);

		const frame = lastFrame() || "";
		expect(frame).toContain("Based on:");
		expect(frame).toContain("Pink Floyd (artist)");
		unmount();
	});
});

describe("NowPlayingView playing state variations", () => {
	it("should render correctly when playing", () => {
		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<NowPlayingView
					track={mockTrack}
					station={mockStation}
					queue={mockQueue}
					position={120}
					isPlaying={true}
				/>
			</ThemedWrapper>,
		);

		expect(lastFrame()).toContain("⏸");
		unmount();
	});

	it("should render correctly when paused", () => {
		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<NowPlayingView
					track={mockTrack}
					station={mockStation}
					queue={mockQueue}
					position={120}
					isPlaying={false}
				/>
			</ThemedWrapper>,
		);

		expect(lastFrame()).toContain("▶");
		unmount();
	});

	it("should toggle icon between play states", () => {
		const { lastFrame, rerender, unmount } = render(
			<ThemedWrapper>
				<NowPlayingView
					track={mockTrack}
					station={mockStation}
					queue={mockQueue}
					position={120}
					isPlaying={true}
				/>
			</ThemedWrapper>,
		);

		expect(lastFrame()).toContain("⏸");

		rerender(
			<ThemedWrapper>
				<NowPlayingView
					track={mockTrack}
					station={mockStation}
					queue={mockQueue}
					position={120}
					isPlaying={false}
				/>
			</ThemedWrapper>,
		);

		expect(lastFrame()).toContain("▶");
		unmount();
	});
});
