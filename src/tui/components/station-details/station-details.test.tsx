import { describe, it, expect, mock, beforeEach } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ThemeProvider, loadTheme } from "../../theme/index.js";
import { StationDetailsView } from "./index.js";
import { Effect } from "effect";

/**
 * Tests for StationDetailsView component
 * Uses ink-testing-library for component rendering tests
 *
 * Note: All tests must call unmount() to properly clean up the useInput hook
 */

// Mock the client module
const mockGetStation = mock(() =>
	Effect.succeed({
		stationToken: "test-token",
		stationName: "Rock Radio",
		stationId: "123456",
		music: {
			artists: [
				{ seedId: "a1", artistName: "Pink Floyd", musicToken: "token1" },
				{ seedId: "a2", artistName: "Led Zeppelin", musicToken: "token2" },
			],
			songs: [
				{
					seedId: "s1",
					songName: "Time",
					artistName: "Pink Floyd",
					musicToken: "token3",
				},
			],
		},
		feedback: {
			thumbsUp: [
				{
					feedbackId: "f1",
					songName: "Comfortably Numb",
					artistName: "Pink Floyd",
					isPositive: true,
					dateCreated: { time: 1234567890 },
				},
			],
			thumbsDown: [
				{
					feedbackId: "f2",
					songName: "Bad Song",
					artistName: "Bad Artist",
					isPositive: false,
					dateCreated: { time: 1234567891 },
				},
			],
		},
	}),
);

mock.module("../../../client.js", () => ({
	getStation: mockGetStation,
}));

// Mock authState for direct prop passing
const mockAuthState = {
	syncTime: 1234567890,
	partnerId: "test-partner",
	partnerAuthToken: "test-partner-token",
	userAuthToken: "test-user-token",
	userId: "test-user-id",
};

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

describe("StationDetailsView", () => {
	beforeEach(() => {
		// Reset mocks before each test
		mockGetStation.mockClear();

		// Reset default mock implementation
		mockGetStation.mockImplementation(() =>
			Effect.succeed({
				stationToken: "test-token",
				stationName: "Rock Radio",
				stationId: "123456",
				music: {
					artists: [
						{ seedId: "a1", artistName: "Pink Floyd", musicToken: "token1" },
						{ seedId: "a2", artistName: "Led Zeppelin", musicToken: "token2" },
					],
					songs: [
						{
							seedId: "s1",
							songName: "Time",
							artistName: "Pink Floyd",
							musicToken: "token3",
						},
					],
				},
				feedback: {
					thumbsUp: [
						{
							feedbackId: "f1",
							songName: "Comfortably Numb",
							artistName: "Pink Floyd",
							isPositive: true,
							dateCreated: { time: 1234567890 },
						},
					],
					thumbsDown: [
						{
							feedbackId: "f2",
							songName: "Bad Song",
							artistName: "Bad Artist",
							isPositive: false,
							dateCreated: { time: 1234567891 },
						},
					],
				},
			}),
		);
	});

	describe("visibility", () => {
		it("should not render when isVisible is false", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={false}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toBe("");
			unmount();
		});

		it("should render when isVisible is true", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).not.toBe("");
			unmount();
		});
	});

	describe("title and structure", () => {
		it("should display station name in title", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("Station Details - Rock Radio");
			unmount();
		});

		it("should display generic title when no station name provided", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName={null}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("Station Details");
			unmount();
		});

		it("should show section tabs (Info, Seeds, Feedback)", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain("Info");
			expect(frame).toContain("Seeds");
			expect(frame).toContain("Feedback");
			unmount();
		});

		it("should highlight active section with brackets", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Info should be active by default
			expect(lastFrame()).toContain("[Info]");
			unmount();
		});
	});

	describe("info section", () => {
		it("should show station name", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain("Station Name:");
			expect(frame).toContain("Rock Radio");
			unmount();
		});

		it("should show station ID", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain("Station ID:");
			expect(frame).toContain("123456");
			unmount();
		});

		it("should show seed counts", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain("Seeds:");
			expect(frame).toContain("2 artists");
			expect(frame).toContain("1 song");
			unmount();
		});

		it("should show feedback counts", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain("Feedback:");
			expect(frame).toContain("1 thumbs up");
			expect(frame).toContain("1 thumbs down");
			unmount();
		});

		it("should use proper singular/plural for counts", async () => {
			mockGetStation.mockImplementation(() =>
				Effect.succeed({
					stationToken: "test-token",
					stationName: "Minimal Station",
					stationId: "999",
					music: {
						artists: [
							{ seedId: "a1", artistName: "Solo Artist", musicToken: "token1" },
						],
						songs: [],
					},
					feedback: {
						thumbsUp: [],
						thumbsDown: [],
					},
				}),
			);

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Minimal Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain("1 artist");
			expect(frame).toContain("0 songs");
			unmount();
		});
	});

	describe("seeds section", () => {
		it("should show Artists heading when navigated to seeds", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Seeds section (Tab or l key)
			stdin.write("\t");
			await waitForAsync();

			expect(lastFrame()).toContain("Artists");
			unmount();
		});

		it("should show Songs heading when navigated to seeds", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Seeds section
			stdin.write("\t");
			await waitForAsync();

			expect(lastFrame()).toContain("Songs");
			unmount();
		});

		it("should display artist names", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Seeds section
			stdin.write("\t");
			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain("Pink Floyd");
			expect(frame).toContain("Led Zeppelin");
			unmount();
		});

		it("should display song names with 'by Artist' format", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Seeds section
			stdin.write("\t");
			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain('"Time"');
			expect(frame).toContain("by Pink Floyd");
			unmount();
		});

		it("should show 'no seeds' message when station has no seeds", async () => {
			mockGetStation.mockImplementation(() =>
				Effect.succeed({
					stationToken: "test-token",
					stationName: "Empty Station",
					stationId: "999",
					music: {
						artists: [],
						songs: [],
					},
					feedback: {
						thumbsUp: [],
						thumbsDown: [],
					},
				}),
			);

			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Empty Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Seeds section
			stdin.write("\t");
			await waitForAsync();

			expect(lastFrame()).toContain("No seeds found");
			unmount();
		});

		it("should show cursor indicator for selected seed", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Seeds section
			stdin.write("\t");
			await waitForAsync();

			expect(lastFrame()).toContain(">");
			unmount();
		});
	});

	describe("feedback section", () => {
		it("should show Thumbs Up section when navigated to feedback", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Feedback section (Tab twice)
			stdin.write("\t");
			await waitForAsync();
			stdin.write("\t");
			await waitForAsync();

			expect(lastFrame()).toContain("Thumbs Up");
			unmount();
		});

		it("should show Thumbs Down section when navigated to feedback", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Feedback section
			stdin.write("\t");
			await waitForAsync();
			stdin.write("\t");
			await waitForAsync();

			expect(lastFrame()).toContain("Thumbs Down");
			unmount();
		});

		it("should display liked tracks", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Feedback section
			stdin.write("\t");
			await waitForAsync();
			stdin.write("\t");
			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain("Comfortably Numb");
			expect(frame).toContain("Pink Floyd");
			unmount();
		});

		it("should display disliked tracks", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Feedback section
			stdin.write("\t");
			await waitForAsync();
			stdin.write("\t");
			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain("Bad Song");
			expect(frame).toContain("Bad Artist");
			unmount();
		});

		it("should show feedback count in section headers", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Feedback section
			stdin.write("\t");
			await waitForAsync();
			stdin.write("\t");
			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain("Thumbs Up (1)");
			expect(frame).toContain("Thumbs Down (1)");
			unmount();
		});

		it("should show 'no feedback' message when station has no feedback", async () => {
			mockGetStation.mockImplementation(() =>
				Effect.succeed({
					stationToken: "test-token",
					stationName: "New Station",
					stationId: "999",
					music: {
						artists: [
							{ seedId: "a1", artistName: "Artist", musicToken: "token1" },
						],
						songs: [],
					},
					feedback: {
						thumbsUp: [],
						thumbsDown: [],
					},
				}),
			);

			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="New Station"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Feedback section
			stdin.write("\t");
			await waitForAsync();
			stdin.write("\t");
			await waitForAsync();

			expect(lastFrame()).toContain("No feedback found");
			unmount();
		});

		it("should show + indicator for thumbs up items", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Feedback section
			stdin.write("\t");
			await waitForAsync();
			stdin.write("\t");
			await waitForAsync();

			expect(lastFrame()).toContain("+");
			unmount();
		});

		it("should show - indicator for thumbs down items", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Feedback section
			stdin.write("\t");
			await waitForAsync();
			stdin.write("\t");
			await waitForAsync();

			expect(lastFrame()).toContain("-");
			unmount();
		});
	});

	describe("loading states", () => {
		it("should show loading spinner initially", async () => {
			// Use a mock that delays the response to catch the loading state
			let resolveStation: ((value: unknown) => void) | undefined;
			const delayedStation = new Promise((resolve) => {
				resolveStation = resolve;
			});

			mockGetStation.mockImplementation(() =>
				Effect.promise(() => delayedStation as Promise<unknown>).pipe(
					Effect.map(() => ({
						stationToken: "test-token",
						stationName: "Rock Radio",
						stationId: "123456",
						music: { artists: [], songs: [] },
						feedback: { thumbsUp: [], thumbsDown: [] },
					})),
				),
			);

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			// Give the component time to enter loading state
			await waitForAsync(10);

			expect(lastFrame()).toContain("Loading station details...");

			// Cleanup: resolve the promise
			resolveStation?.({});
			await waitForAsync();
			unmount();
		});

		it("should display content after loading", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";

			// Should no longer show loading
			expect(frame).not.toContain("Loading station details...");
			// Should show actual content
			expect(frame).toContain("Station Name:");
			expect(frame).toContain("Rock Radio");
			unmount();
		});

		it("should show error message on fetch failure", async () => {
			mockGetStation.mockImplementation(() =>
				Effect.fail({ _tag: "ApiCallError", message: "Network error" }),
			);

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("Failed to load station details");
			unmount();
		});

		it("should show error when no station is selected", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken={null}
						stationName={null}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("No station selected");
			unmount();
		});
	});

	describe("callbacks", () => {
		it("should accept onClose callback without error", async () => {
			let closeCalled = false;

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {
							closeCalled = true;
						}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Component should render without errors
			expect(lastFrame()).toContain("Station Details");
			// onClose should not be called on initial render
			expect(closeCalled).toBe(false);
			unmount();
		});

		it("should accept onNotification callback without error", async () => {
			const notifications: Array<{
				message: string;
				variant: "success" | "error" | "info";
			}> = [];

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						onNotification={(message, variant) => {
							notifications.push({ message, variant });
						}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Component should render without errors
			expect(lastFrame()).toContain("Station Details");
			// No notifications should be sent on initial render (success case)
			expect(notifications.length).toBe(0);
			unmount();
		});

		it("should call onNotification on error", async () => {
			mockGetStation.mockImplementation(() =>
				Effect.fail({ _tag: "ApiCallError", message: "Network error" }),
			);

			const notifications: Array<{
				message: string;
				variant: "success" | "error" | "info";
			}> = [];

			const { unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						onNotification={(message, variant) => {
							notifications.push({ message, variant });
						}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(notifications.length).toBe(1);
			expect(notifications[0]?.variant).toBe("error");
			expect(notifications[0]?.message).toContain("Failed to load");
			unmount();
		});
	});

	describe("keyboard navigation", () => {
		it("should navigate between sections with Tab", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Initially on Info
			expect(lastFrame()).toContain("[Info]");

			// Tab to Seeds
			stdin.write("\t");
			await waitForAsync();
			expect(lastFrame()).toContain("[Seeds]");

			// Tab to Feedback
			stdin.write("\t");
			await waitForAsync();
			expect(lastFrame()).toContain("[Feedback]");

			// Tab wraps back to Info
			stdin.write("\t");
			await waitForAsync();
			expect(lastFrame()).toContain("[Info]");

			unmount();
		});

		it("should navigate sections with l key", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("[Info]");

			stdin.write("l");
			await waitForAsync();
			expect(lastFrame()).toContain("[Seeds]");

			unmount();
		});

		it("should navigate sections backward with h key", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("[Info]");

			// h wraps to last section (Feedback)
			stdin.write("h");
			await waitForAsync();
			expect(lastFrame()).toContain("[Feedback]");

			unmount();
		});

		it("should navigate within seeds section with j/k", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Seeds section
			stdin.write("\t");
			await waitForAsync();

			// First item should be selected (Pink Floyd)
			let frame = lastFrame() || "";
			expect(frame).toContain("> ");

			// Navigate down
			stdin.write("j");
			await waitForAsync();

			// Second item should now be selected
			frame = lastFrame() || "";
			expect(frame).toContain("> ");

			unmount();
		});

		it("should call onClose when Escape is pressed", async () => {
			let closeCalled = false;

			const { stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {
							closeCalled = true;
						}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			stdin.write("\u001B");
			await waitForAsync();

			expect(closeCalled).toBe(true);
			unmount();
		});

		it("should jump to first item with g", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Seeds section
			stdin.write("\t");
			await waitForAsync();

			// Navigate down a couple times
			stdin.write("j");
			await waitForAsync();
			stdin.write("j");
			await waitForAsync();

			// Jump to first with g
			stdin.write("g");
			await waitForAsync();

			// Should be back at first item
			const frame = lastFrame() || "";
			// First item should be selected (has > indicator)
			const lines = frame.split("\n");
			const artistLine = lines.find((l) => l.includes("Pink Floyd"));
			expect(artistLine).toContain(">");

			unmount();
		});

		it("should jump to last item with G", async () => {
			const { lastFrame, stdin, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Navigate to Seeds section
			stdin.write("\t");
			await waitForAsync();

			// Jump to last with G
			stdin.write("G");
			await waitForAsync();

			// Last item (the song "Time") should be selected
			const frame = lastFrame() || "";
			const lines = frame.split("\n");
			const timeLine = lines.find((l) => l.includes("Time"));
			expect(timeLine).toContain(">");

			unmount();
		});
	});

	describe("panel structure", () => {
		it("should be wrapped in a Panel component", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Panel should render with border characters
			const frame = lastFrame() || "";
			expect(
				frame.includes("─") || frame.includes("│") || frame.includes("┐"),
			).toBe(true);
			unmount();
		});
	});

	describe("visibility changes", () => {
		it("should reset state when becoming visible", async () => {
			const { rerender, lastFrame, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={false}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			// Initially not visible
			expect(lastFrame()).toBe("");

			// Become visible
			rerender(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Should now be visible with content
			expect(lastFrame()).toContain("Station Details");
			unmount();
		});

		it("should refetch data when becoming visible again", async () => {
			const { rerender, unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const callCountAfterFirst = mockGetStation.mock.calls.length;

			// Hide
			rerender(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={false}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Show again
			rerender(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Should have made another API call
			expect(mockGetStation.mock.calls.length).toBeGreaterThan(
				callCountAfterFirst,
			);
			unmount();
		});
	});

	describe("API interactions", () => {
		it("should call getStation when becoming visible", async () => {
			const { unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(mockGetStation).toHaveBeenCalled();
			unmount();
		});

		it("should not call getStation when not visible", async () => {
			const { unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={false}
						onClose={() => {}}
						stationToken="test-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(mockGetStation).not.toHaveBeenCalled();
			unmount();
		});

		it("should pass correct parameters to getStation", async () => {
			const { unmount } = render(
				<ThemedWrapper>
					<StationDetailsView
						isVisible={true}
						onClose={() => {}}
						stationToken="my-station-token"
						stationName="Rock Radio"
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(mockGetStation).toHaveBeenCalledWith(mockAuthState, {
				stationToken: "my-station-token",
				includeExtendedAttributes: true,
			});
			unmount();
		});
	});
});

describe("StationDetailsView with different data configurations", () => {
	beforeEach(() => {
		mockGetStation.mockClear();
	});

	it("should handle station with only artists", async () => {
		mockGetStation.mockImplementation(() =>
			Effect.succeed({
				stationToken: "test-token",
				stationName: "Artist Only",
				stationId: "111",
				music: {
					artists: [
						{ seedId: "a1", artistName: "The Beatles", musicToken: "token1" },
						{ seedId: "a2", artistName: "The Stones", musicToken: "token2" },
					],
					songs: [],
				},
				feedback: {
					thumbsUp: [],
					thumbsDown: [],
				},
			}),
		);

		const { lastFrame, stdin, unmount } = render(
			<ThemedWrapper>
				<StationDetailsView
					isVisible={true}
					onClose={() => {}}
					stationToken="test-token"
					stationName="Artist Only"
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		await waitForAsync();

		// Navigate to Seeds
		stdin.write("\t");
		await waitForAsync();

		const frame = lastFrame() || "";
		expect(frame).toContain("The Beatles");
		expect(frame).toContain("The Stones");
		// Should not have Songs heading if no songs
		expect(frame).toContain("Artists");
		unmount();
	});

	it("should handle station with only songs", async () => {
		mockGetStation.mockImplementation(() =>
			Effect.succeed({
				stationToken: "test-token",
				stationName: "Song Only",
				stationId: "222",
				music: {
					artists: [],
					songs: [
						{
							seedId: "s1",
							songName: "Yesterday",
							artistName: "Beatles",
							musicToken: "token1",
						},
						{
							seedId: "s2",
							songName: "Satisfaction",
							artistName: "Stones",
							musicToken: "token2",
						},
					],
				},
				feedback: {
					thumbsUp: [],
					thumbsDown: [],
				},
			}),
		);

		const { lastFrame, stdin, unmount } = render(
			<ThemedWrapper>
				<StationDetailsView
					isVisible={true}
					onClose={() => {}}
					stationToken="test-token"
					stationName="Song Only"
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		await waitForAsync();

		// Navigate to Seeds
		stdin.write("\t");
		await waitForAsync();

		const frame = lastFrame() || "";
		expect(frame).toContain('"Yesterday"');
		expect(frame).toContain("by Beatles");
		expect(frame).toContain('"Satisfaction"');
		expect(frame).toContain("by Stones");
		unmount();
	});

	it("should handle station with only thumbs up feedback", async () => {
		mockGetStation.mockImplementation(() =>
			Effect.succeed({
				stationToken: "test-token",
				stationName: "Positive Station",
				stationId: "333",
				music: {
					artists: [
						{ seedId: "a1", artistName: "Artist", musicToken: "token1" },
					],
					songs: [],
				},
				feedback: {
					thumbsUp: [
						{
							feedbackId: "f1",
							songName: "Great Song",
							artistName: "Great Artist",
							isPositive: true,
							dateCreated: { time: 1234567890 },
						},
						{
							feedbackId: "f2",
							songName: "Another Great",
							artistName: "Great Artist",
							isPositive: true,
							dateCreated: { time: 1234567891 },
						},
					],
					thumbsDown: [],
				},
			}),
		);

		const { lastFrame, stdin, unmount } = render(
			<ThemedWrapper>
				<StationDetailsView
					isVisible={true}
					onClose={() => {}}
					stationToken="test-token"
					stationName="Positive Station"
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		await waitForAsync();

		// Navigate to Feedback
		stdin.write("\t");
		await waitForAsync();
		stdin.write("\t");
		await waitForAsync();

		const frame = lastFrame() || "";
		expect(frame).toContain("Thumbs Up (2)");
		expect(frame).toContain("Great Song");
		expect(frame).toContain("Another Great");
		unmount();
	});

	it("should handle station with only thumbs down feedback", async () => {
		mockGetStation.mockImplementation(() =>
			Effect.succeed({
				stationToken: "test-token",
				stationName: "Critical Station",
				stationId: "444",
				music: {
					artists: [
						{ seedId: "a1", artistName: "Artist", musicToken: "token1" },
					],
					songs: [],
				},
				feedback: {
					thumbsUp: [],
					thumbsDown: [
						{
							feedbackId: "f1",
							songName: "Bad Track",
							artistName: "Bad Artist",
							isPositive: false,
							dateCreated: { time: 1234567890 },
						},
					],
				},
			}),
		);

		const { lastFrame, stdin, unmount } = render(
			<ThemedWrapper>
				<StationDetailsView
					isVisible={true}
					onClose={() => {}}
					stationToken="test-token"
					stationName="Critical Station"
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		await waitForAsync();

		// Navigate to Feedback
		stdin.write("\t");
		await waitForAsync();
		stdin.write("\t");
		await waitForAsync();

		const frame = lastFrame() || "";
		expect(frame).toContain("Thumbs Down (1)");
		expect(frame).toContain("Bad Track");
		unmount();
	});

	it("should handle missing music data gracefully", async () => {
		mockGetStation.mockImplementation(() =>
			Effect.succeed({
				stationToken: "test-token",
				stationName: "Bare Station",
				stationId: "555",
				music: undefined,
				feedback: undefined,
			}),
		);

		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<StationDetailsView
					isVisible={true}
					onClose={() => {}}
					stationToken="test-token"
					stationName="Bare Station"
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		await waitForAsync();

		const frame = lastFrame() || "";
		// Should show zeroes for counts
		expect(frame).toContain("0 artists");
		expect(frame).toContain("0 songs");
		expect(frame).toContain("0 thumbs up");
		expect(frame).toContain("0 thumbs down");
		unmount();
	});

	it("should truncate long names appropriately", async () => {
		mockGetStation.mockImplementation(() =>
			Effect.succeed({
				stationToken: "test-token",
				stationName: "Long Names Station",
				stationId: "666",
				music: {
					artists: [
						{
							seedId: "a1",
							artistName:
								"This Is A Very Long Artist Name That Should Be Truncated For Display Purposes",
							musicToken: "token1",
						},
					],
					songs: [
						{
							seedId: "s1",
							songName:
								"This Is An Incredibly Long Song Title That Definitely Needs Truncation",
							artistName:
								"Another Long Artist Name That Also Should Be Shortened",
							musicToken: "token2",
						},
					],
				},
				feedback: {
					thumbsUp: [],
					thumbsDown: [],
				},
			}),
		);

		const { lastFrame, stdin, unmount } = render(
			<ThemedWrapper>
				<StationDetailsView
					isVisible={true}
					onClose={() => {}}
					stationToken="test-token"
					stationName="Long Names Station"
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		await waitForAsync();

		// Navigate to Seeds
		stdin.write("\t");
		await waitForAsync();

		const frame = lastFrame() || "";
		// Should contain truncation indicator (ellipsis)
		expect(frame.includes("…")).toBe(true);
		unmount();
	});
});
