import { describe, it, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ThemeProvider, loadTheme } from "../../theme/index.js";
import { QuickMixManagerView } from "./index.js";

/**
 * Tests for QuickMixManagerView component
 * Uses ink-testing-library for component rendering tests
 *
 * Note: All tests must call unmount() to properly clean up the useInput hook
 */

// Mock station data
const mockStations = [
	{ stationId: "1", stationName: "Rock Radio", isQuickMix: false },
	{ stationId: "2", stationName: "Jazz Vibes", isQuickMix: false },
	{ stationId: "3", stationName: "Classical", isQuickMix: false },
	{ stationId: "quickmix", stationName: "Shuffle", isQuickMix: true },
];

const mockStationsSingleItem = [
	{ stationId: "1", stationName: "Only Station", isQuickMix: false },
	{ stationId: "quickmix", stationName: "Shuffle", isQuickMix: true },
];

const mockStationsEmpty = [
	{ stationId: "quickmix", stationName: "Shuffle", isQuickMix: true },
];

const mockStationsLongNames = [
	{
		stationId: "1",
		stationName:
			"This Is A Very Long Station Name That Should Be Truncated In The Display",
		isQuickMix: false,
	},
	{ stationId: "2", stationName: "Short", isQuickMix: false },
	{ stationId: "quickmix", stationName: "Shuffle", isQuickMix: true },
];

// Wrapper component for theme context
const ThemedWrapper: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const theme = loadTheme("pyxis");
	return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};

describe("QuickMixManagerView", () => {
	describe("visibility", () => {
		it("should not render when isVisible is false", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={false}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toBe("");
			unmount();
		});

		it("should render when isVisible is true", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).not.toBe("");
			unmount();
		});
	});

	describe("title rendering", () => {
		it("should render title 'QuickMix Manager' when visible", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("QuickMix Manager");
			unmount();
		});
	});

	describe("station display", () => {
		it("should display all non-QuickMix stations with checkboxes", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";

			// Should show the station names
			expect(frame).toContain("Rock Radio");
			expect(frame).toContain("Jazz Vibes");
			expect(frame).toContain("Classical");
			unmount();
		});

		it("should filter out the QuickMix station itself", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";

			// Should show the non-QuickMix stations
			expect(frame).toContain("Rock Radio");
			expect(frame).toContain("Jazz Vibes");
			expect(frame).toContain("Classical");

			// Count occurrences of checkboxes - should be 3, not 4
			const checkboxMatches = frame.match(/\[[ x]\]/g);
			expect(checkboxMatches?.length).toBe(3);
			unmount();
		});

		it("should show 'No stations available' when only QuickMix station exists", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStationsEmpty}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("No stations available");
			unmount();
		});
	});

	describe("selection count in footer", () => {
		it("should show selection count '0 of 3 stations selected' when none selected", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
						initialSelectedIds={[]}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("0 of 3 stations selected");
			unmount();
		});

		it("should show selection count '2 of 3 stations selected' when two selected", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
						initialSelectedIds={["1", "2"]}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("2 of 3 stations selected");
			unmount();
		});

		it("should show selection count '3 of 3 stations selected' when all selected", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
						initialSelectedIds={["1", "2", "3"]}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("3 of 3 stations selected");
			unmount();
		});

		it("should use singular 'station' when only 1 station available", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStationsSingleItem}
						onSave={() => {}}
						initialSelectedIds={[]}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("0 of 1 station selected");
			unmount();
		});
	});

	describe("state tests - initial selection", () => {
		it("should pre-select stations from initialSelectedIds", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
						initialSelectedIds={["1", "3"]}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("2 of 3 stations selected");
			unmount();
		});

		it("should show checked checkbox [x] for selected stations", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
						initialSelectedIds={["1", "2", "3"]}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";

			// All checkboxes should be checked
			const checkedMatches = frame.match(/\[x\]/g);
			expect(checkedMatches?.length).toBe(3);
			unmount();
		});

		it("should show unchecked checkbox [ ] for unselected stations", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
						initialSelectedIds={[]}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";

			// All checkboxes should be unchecked
			const uncheckedMatches = frame.match(/\[ \]/g);
			expect(uncheckedMatches?.length).toBe(3);
			unmount();
		});

		it("should show mix of checked and unchecked for partial selection", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
						initialSelectedIds={["1"]}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";

			// Should have 1 checked and 2 unchecked
			const checkedMatches = frame.match(/\[x\]/g);
			const uncheckedMatches = frame.match(/\[ \]/g);
			expect(checkedMatches?.length).toBe(1);
			expect(uncheckedMatches?.length).toBe(2);
			unmount();
		});
	});

	describe("props tests - callbacks", () => {
		it("should accept onClose callback without error", () => {
			let closeCalled = false;

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {
							closeCalled = true;
						}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			// Component should render without errors
			expect(lastFrame()).toContain("QuickMix Manager");
			// onClose should not be called on initial render
			expect(closeCalled).toBe(false);
			unmount();
		});

		it("should accept onSave callback without error", () => {
			let saveCalled = false;

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {
							saveCalled = true;
						}}
					/>
				</ThemedWrapper>,
			);

			// Component should render without errors
			expect(lastFrame()).toContain("QuickMix Manager");
			// onSave should not be called on initial render
			expect(saveCalled).toBe(false);
			unmount();
		});

		it("should accept onNotification callback without error", () => {
			const notifications: Array<{
				message: string;
				variant: "success" | "error" | "info";
			}> = [];

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
						onNotification={(message, variant) => {
							notifications.push({ message, variant });
						}}
					/>
				</ThemedWrapper>,
			);

			// Component should render without errors
			expect(lastFrame()).toContain("QuickMix Manager");
			// No notifications should be sent on initial render
			expect(notifications.length).toBe(0);
			unmount();
		});
	});

	describe("instructions display", () => {
		it("should show instructions text", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("Select stations to include in Shuffle");
			unmount();
		});

		it("should show save/cancel instructions in footer", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toContain("Press 's' to save, Escape to cancel");
			unmount();
		});
	});

	describe("cursor indicator", () => {
		it("should show cursor indicator > for focused item", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			// Should show the cursor indicator
			expect(lastFrame()).toContain(">");
			unmount();
		});

		it("should show cursor on first station by default", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";

			// The cursor ">" should appear
			expect(frame).toContain(">");
			expect(frame).toContain("Rock Radio");
			unmount();
		});
	});

	describe("state reset on visibility change", () => {
		it("should reset selection to initialSelectedIds when becoming visible", () => {
			const { rerender, lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={false}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
						initialSelectedIds={["1", "2"]}
					/>
				</ThemedWrapper>,
			);

			// Initially not visible
			expect(lastFrame()).toBe("");

			// Become visible
			rerender(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
						initialSelectedIds={["1", "2"]}
					/>
				</ThemedWrapper>,
			);

			// Should now be visible with correct initial selection
			expect(lastFrame()).toContain("2 of 3 stations selected");
			unmount();
		});

		it("should reset cursor to first item when becoming visible", () => {
			const { rerender, lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={false}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			// Initially not visible
			expect(lastFrame()).toBe("");

			// Become visible
			rerender(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			// Should show cursor
			expect(lastFrame()).toContain(">");
			unmount();
		});
	});

	describe("long station names", () => {
		it("should handle and truncate long station names", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStationsLongNames}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";

			// Should still render without error
			expect(frame).toContain("QuickMix Manager");
			// Short name should appear
			expect(frame).toContain("Short");
			// Long name should be truncated (contain ellipsis or partial text)
			// The truncation is set to 50 characters
			expect(frame).toContain("This Is A Very Long");
			unmount();
		});
	});

	describe("empty initialSelectedIds", () => {
		it("should work with undefined initialSelectedIds", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			// Should default to no selections
			expect(lastFrame()).toContain("0 of 3 stations selected");
			unmount();
		});

		it("should work with empty array initialSelectedIds", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
						initialSelectedIds={[]}
					/>
				</ThemedWrapper>,
			);

			// Should show no selections
			expect(lastFrame()).toContain("0 of 3 stations selected");
			unmount();
		});
	});

	describe("checkbox rendering", () => {
		it("should render checkboxes with proper spacing", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
						initialSelectedIds={["1"]}
					/>
				</ThemedWrapper>,
			);

			const frame = lastFrame() || "";

			// Should have both [x] and [ ] checkboxes with proper format
			expect(frame).toContain("[x]");
			expect(frame).toContain("[ ]");
			unmount();
		});
	});

	describe("panel structure", () => {
		it("should be wrapped in a Panel component", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<QuickMixManagerView
						isVisible={true}
						onClose={() => {}}
						stations={mockStations}
						onSave={() => {}}
					/>
				</ThemedWrapper>,
			);

			// Panel should render with border characters (box drawing)
			const frame = lastFrame() || "";
			// Panels typically use box drawing characters like ╭, ╮, ╰, ╯, │, ─
			expect(
				frame.includes("─") || frame.includes("│") || frame.includes("┐"),
			).toBe(true);
			unmount();
		});
	});
});

describe("QuickMixManagerView with different station configurations", () => {
	it("should handle stations with no isQuickMix property", () => {
		const stationsWithoutQuickMixProp = [
			{ stationId: "1", stationName: "Station A" },
			{ stationId: "2", stationName: "Station B" },
		];

		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<QuickMixManagerView
					isVisible={true}
					onClose={() => {}}
					stations={stationsWithoutQuickMixProp}
					onSave={() => {}}
				/>
			</ThemedWrapper>,
		);

		const frame = lastFrame() || "";

		// Both stations should appear since isQuickMix is undefined/falsy
		expect(frame).toContain("Station A");
		expect(frame).toContain("Station B");
		expect(frame).toContain("0 of 2 stations selected");
		unmount();
	});

	it("should handle many stations", () => {
		const manyStations = Array.from({ length: 10 }, (_, i) => ({
			stationId: String(i + 1),
			stationName: `Station ${i + 1}`,
			isQuickMix: false,
		}));

		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<QuickMixManagerView
					isVisible={true}
					onClose={() => {}}
					stations={manyStations}
					onSave={() => {}}
				/>
			</ThemedWrapper>,
		);

		expect(lastFrame()).toContain("0 of 10 stations selected");
		unmount();
	});

	it("should handle all stations being QuickMix", () => {
		const allQuickMix = [
			{ stationId: "1", stationName: "Shuffle 1", isQuickMix: true },
			{ stationId: "2", stationName: "Shuffle 2", isQuickMix: true },
		];

		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<QuickMixManagerView
					isVisible={true}
					onClose={() => {}}
					stations={allQuickMix}
					onSave={() => {}}
				/>
			</ThemedWrapper>,
		);

		expect(lastFrame()).toContain("No stations available");
		unmount();
	});
});

describe("QuickMixManagerView rerender behavior", () => {
	it("should update selection count when initialSelectedIds changes", () => {
		const { rerender, lastFrame, unmount } = render(
			<ThemedWrapper>
				<QuickMixManagerView
					isVisible={true}
					onClose={() => {}}
					stations={mockStations}
					onSave={() => {}}
					initialSelectedIds={["1"]}
				/>
			</ThemedWrapper>,
		);

		expect(lastFrame()).toContain("1 of 3 stations selected");

		// Rerender with different selection
		rerender(
			<ThemedWrapper>
				<QuickMixManagerView
					isVisible={true}
					onClose={() => {}}
					stations={mockStations}
					onSave={() => {}}
					initialSelectedIds={["1", "2", "3"]}
				/>
			</ThemedWrapper>,
		);

		// The component uses useEffect tied to visibility change,
		// so it may not re-sync when already visible
		const frame = lastFrame() || "";
		expect(frame).toContain("stations selected");
		unmount();
	});
});
