import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ThemeProvider, loadTheme } from "../../theme/index.js";
import { SeedManagerView } from "./index.js";
import { Effect } from "effect";

/**
 * Tests for SeedManagerView component
 * Uses ink-testing-library for component rendering tests
 */

// Mock auth state for tests
const mockAuthState = {
	syncTime: 1234567890,
	partnerId: "test-partner",
	partnerAuthToken: "test-partner-token",
	userAuthToken: "test-user-token",
	userId: "test-user-id",
};

// Mock station data
const mockStationWithSeeds = {
	stationToken: "test-station-token",
	stationName: "Test Station",
	stationId: "test-station-id",
	music: {
		artists: [
			{ seedId: "a1", artistName: "Pink Floyd", musicToken: "artist-token-1" },
			{ seedId: "a2", artistName: "Radiohead", musicToken: "artist-token-2" },
		],
		songs: [
			{
				seedId: "s1",
				songName: "Comfortably Numb",
				artistName: "Pink Floyd",
				musicToken: "song-token-1",
			},
			{
				seedId: "s2",
				songName: "Paranoid Android",
				artistName: "Radiohead",
				musicToken: "song-token-2",
			},
		],
	},
};

const mockStationEmpty = {
	stationToken: "empty-station-token",
	stationName: "Empty Station",
	stationId: "empty-station-id",
	music: {
		artists: [],
		songs: [],
	},
};

const mockSearchResults = {
	artists: [
		{ artistName: "Led Zeppelin", musicToken: "led-token", score: 100 },
		{ artistName: "The Beatles", musicToken: "beatles-token", score: 95 },
	],
	songs: [
		{
			songName: "Stairway to Heaven",
			artistName: "Led Zeppelin",
			musicToken: "stairway-token",
			score: 90,
		},
	],
};

// Track mock call history
let getStationCalls: Array<{ stationToken: string }> = [];
let addMusicCalls: Array<{ stationToken: string; musicToken: string }> = [];
let searchCalls: Array<{ searchText: string }> = [];
let mockGetStationResponse = mockStationWithSeeds;
let mockShouldFail = false;

// Mock the client module
mock.module("../../../client.js", () => ({
	getStation: (
		_authState: typeof mockAuthState,
		request: { stationToken: string },
	) => {
		getStationCalls.push(request);
		if (mockShouldFail) {
			return Effect.fail({ _tag: "ApiCallError", message: "API Error" });
		}
		return Effect.succeed(mockGetStationResponse);
	},
	addMusic: (
		_authState: typeof mockAuthState,
		request: { stationToken: string; musicToken: string },
	) => {
		addMusicCalls.push(request);
		return Effect.succeed({
			seedId: "new-seed-id",
			artistName: "New Artist",
		});
	},
	deleteMusic: (
		_authState: typeof mockAuthState,
		_request: { seedId: string },
	) => {
		return Effect.succeed({});
	},
}));

// Mock the search API
mock.module("../../../api/music.js", () => ({
	search: (
		_authState: typeof mockAuthState,
		request: { searchText: string },
	) => {
		searchCalls.push(request);
		return Effect.succeed(mockSearchResults);
	},
}));

// Wrapper component for theme context
const ThemedWrapper: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const theme = loadTheme("pyxis");
	return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};

describe("SeedManagerView", () => {
	beforeEach(() => {
		// Reset call tracking
		getStationCalls = [];
		addMusicCalls = [];
		searchCalls = [];
		mockGetStationResponse = mockStationWithSeeds;
		mockShouldFail = false;
	});

	afterEach(() => {
		// Clean up any pending timers
	});

	describe("visibility", () => {
		it("should not render when isVisible is false", () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={false}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			// Should render nothing (empty or whitespace only)
			expect(lastFrame()).toBe("");
		});

		it("should render when isVisible is true", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			// Wait for async operations
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Should render something
			expect(lastFrame()).not.toBe("");
		});
	});

	describe("title rendering", () => {
		it("should render title with station name when visible", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="My Awesome Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(lastFrame()).toContain("Seeds - My Awesome Station");
		});

		it("should render generic title when stationName is null", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName={null}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 50));

			// Should show just "Seeds" without station name
			expect(lastFrame()).toContain("Seeds");
		});
	});

	describe("loading state", () => {
		it("should transition from loading to loaded state", async () => {
			// The component shows loading initially, then loads content
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			// After loading completes, should show seeds content
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(lastFrame()).toContain("Current Seeds");
		});
	});

	describe("empty state", () => {
		it("should show 'No seeds yet' message when station has no seeds", async () => {
			mockGetStationResponse = mockStationEmpty;

			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="empty-station-token"
						stationName="Empty Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(lastFrame()).toContain("No seeds yet");
		});
	});

	describe("seed display", () => {
		it("should display artist seeds correctly", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should show artist section header
			expect(lastFrame()).toContain("Artists");
			// Should show artist names
			expect(lastFrame()).toContain("Pink Floyd");
			expect(lastFrame()).toContain("Radiohead");
		});

		it("should display song seeds correctly with 'by Artist' format", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should show songs section header
			expect(lastFrame()).toContain("Songs");
			// Should show song names with quotes and artist
			expect(lastFrame()).toContain("Comfortably Numb");
			expect(lastFrame()).toContain("Paranoid Android");
			expect(lastFrame()).toContain("by");
		});

		it("should group seeds by type with Artists and Songs sections", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			const frame = lastFrame() || "";

			// Both section headers should appear
			expect(frame).toContain("Artists");
			expect(frame).toContain("Songs");

			// Artists should appear before their songs in the Artists section
			const artistsIndex = frame.indexOf("Artists");
			const songsIndex = frame.indexOf("Songs");
			expect(artistsIndex).toBeLessThan(songsIndex);
		});
	});

	describe("search panel", () => {
		it("should show search panel with placeholder text", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(lastFrame()).toContain("Add Seed");
			expect(lastFrame()).toContain("Search artists or songs");
		});

		it("should show idle message when search query is empty", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(lastFrame()).toContain("Type to search");
		});
	});

	describe("error state", () => {
		it("should show error message on API failure", async () => {
			mockShouldFail = true;

			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(lastFrame()).toContain("Failed to load seeds");
		});

		it("should show error when no station is selected", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken={null}
						stationName={null}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(lastFrame()).toContain("No station selected");
		});
	});

	describe("panel headers", () => {
		it("should show Current Seeds header", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(lastFrame()).toContain("Current Seeds");
		});

		it("should show Add Seed header", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(lastFrame()).toContain("Add Seed");
		});
	});

	describe("selection indicator", () => {
		it("should show selection indicator for first seed by default", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should show the selection indicator
			expect(lastFrame()).toContain(">");
		});
	});

	describe("API interaction", () => {
		it("should call getStation when component becomes visible", async () => {
			render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="my-station-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(getStationCalls.length).toBeGreaterThan(0);
			expect(getStationCalls[0]?.stationToken).toBe("my-station-token");
		});

		it("should not call getStation when component is not visible", async () => {
			render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={false}
						onClose={() => {}}
						stationToken="my-station-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(getStationCalls.length).toBe(0);
		});
	});

	describe("onClose callback", () => {
		it("should have onClose prop available", () => {
			let closeCalled = false;

			render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {
							closeCalled = true;
						}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			// The onClose prop should be available (tested by component accepting it)
			expect(closeCalled).toBe(false); // Should not be called on initial render
		});
	});

	describe("onNotification callback", () => {
		it("should accept onNotification prop", async () => {
			const notifications: Array<{
				message: string;
				variant: "success" | "error" | "info";
			}> = [];

			render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
						onNotification={(message, variant) => {
							notifications.push({ message, variant });
						}}
					/>
				</ThemedWrapper>,
			);

			// Component should accept the callback without errors
			await new Promise((resolve) => setTimeout(resolve, 50));

			// No notifications should be sent on initial render
			expect(notifications.length).toBe(0);
		});
	});

	describe("station with only artists", () => {
		it("should display only Artists section when no songs", async () => {
			mockGetStationResponse = {
				...mockStationWithSeeds,
				music: {
					artists: [
						{
							seedId: "a1",
							artistName: "Pink Floyd",
							musicToken: "artist-token-1",
						},
					],
					songs: [],
				},
			};

			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(lastFrame()).toContain("Artists");
			expect(lastFrame()).toContain("Pink Floyd");
		});
	});

	describe("station with only songs", () => {
		it("should display only Songs section when no artists", async () => {
			mockGetStationResponse = {
				...mockStationWithSeeds,
				music: {
					artists: [],
					songs: [
						{
							seedId: "s1",
							songName: "Comfortably Numb",
							artistName: "Pink Floyd",
							musicToken: "song-token-1",
						},
					],
				},
			};

			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(lastFrame()).toContain("Songs");
			expect(lastFrame()).toContain("Comfortably Numb");
		});
	});

	describe("search input placeholder", () => {
		it("should show search prompt with slash prefix", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 50));

			// Should show the slash prefix for search
			expect(lastFrame()).toContain("/");
		});
	});

	describe("dual panel layout", () => {
		it("should show both seeds panel and search panel", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Both panels should be visible
			expect(lastFrame()).toContain("Current Seeds");
			expect(lastFrame()).toContain("Add Seed");
		});
	});

	describe("missing authState", () => {
		it("should show error when authState is not provided", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should show an error state since authState is required for API calls
			expect(lastFrame()).toContain("No station selected");
		});
	});

	describe("song display format", () => {
		it("should wrap song names in quotes", async () => {
			const { lastFrame } = render(
				<ThemedWrapper>
					<SeedManagerView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Test Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Songs should be displayed with quotes
			expect(lastFrame()).toContain('"');
		});
	});
});

describe("SeedManagerView state reset", () => {
	beforeEach(() => {
		getStationCalls = [];
		mockGetStationResponse = mockStationWithSeeds;
		mockShouldFail = false;
	});

	it("should reset state when becoming visible", async () => {
		const { rerender, lastFrame } = render(
			<ThemedWrapper>
				<SeedManagerView
					isVisible={false}
					onClose={() => {}}
					stationToken="test-token"
					stationName="Test Station"
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		// Initially not visible
		expect(lastFrame()).toBe("");

		// Become visible
		rerender(
			<ThemedWrapper>
				<SeedManagerView
					isVisible={true}
					onClose={() => {}}
					stationToken="test-token"
					stationName="Test Station"
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		await new Promise((resolve) => setTimeout(resolve, 100));

		// Should now be visible with content
		expect(lastFrame()).toContain("Seeds");
	});
});
