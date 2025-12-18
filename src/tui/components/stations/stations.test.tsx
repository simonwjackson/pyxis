import { describe, it, expect } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { StationList } from "./StationList.js";
import { StationItem } from "./StationItem.js";
import { ThemeProvider, loadTheme } from "../../theme/index.js";

/**
 * Tests for Station components
 * Uses ink-testing-library for component rendering tests
 */

// Wrapper component for theme context
const ThemedWrapper: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const theme = loadTheme("pyxis");
	return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};

describe("StationItem", () => {
	it("should render station name", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationItem
					name="Pink Floyd Radio"
					isSelected={false}
					isPlaying={false}
				/>
			</ThemedWrapper>,
		);
		expect(lastFrame()).toContain("Pink Floyd Radio");
	});

	it("should show selection arrow when selected", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationItem name="Test Station" isSelected={true} isPlaying={false} />
			</ThemedWrapper>,
		);
		// Selected items have bold text and arrow prefix
		expect(lastFrame()).toContain("Test Station");
	});

	it("should show playing badge when playing", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationItem name="Test Station" isSelected={false} isPlaying={true} />
			</ThemedWrapper>,
		);
		expect(lastFrame()).toContain("playing");
	});

	it("should show QuickMix indicator for shuffle stations", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationItem
					name="Shuffle"
					isSelected={false}
					isPlaying={false}
					isQuickMix={true}
				/>
			</ThemedWrapper>,
		);
		expect(lastFrame()).toContain("[Q]");
	});

	it("should show both selected and playing state", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationItem name="Active Station" isSelected={true} isPlaying={true} />
			</ThemedWrapper>,
		);
		expect(lastFrame()).toContain("Active Station");
		expect(lastFrame()).toContain("playing");
	});
});

describe("StationList", () => {
	const mockStations = [
		{ stationId: "1", stationName: "Station 1" },
		{ stationId: "2", stationName: "Station 2" },
		{ stationId: "3", stationName: "Station 3" },
		{ stationId: "4", stationName: "Station 4" },
		{ stationId: "5", stationName: "Station 5" },
	];

	it("should render all stations when count is below maxVisible", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList
					stations={mockStations.slice(0, 3)}
					selectedIndex={0}
					maxVisible={10}
				/>
			</ThemedWrapper>,
		);
		expect(lastFrame()).toContain("Station 1");
		expect(lastFrame()).toContain("Station 2");
		expect(lastFrame()).toContain("Station 3");
	});

	it("should show station count in footer", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList stations={mockStations} selectedIndex={0} />
			</ThemedWrapper>,
		);
		expect(lastFrame()).toContain("5 stations");
	});

	it("should show singular 'station' for count of 1", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList
					stations={[{ stationId: "1", stationName: "Only Station" }]}
					selectedIndex={0}
				/>
			</ThemedWrapper>,
		);
		expect(lastFrame()).toContain("1 station");
		expect(lastFrame()).not.toContain("1 stations");
	});

	it("should indicate playing station", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList
					stations={mockStations}
					selectedIndex={0}
					playingStationId="2"
				/>
			</ThemedWrapper>,
		);
		expect(lastFrame()).toContain("Station 2");
		expect(lastFrame()).toContain("playing");
	});

	it("should show scroll indicator when more items below", () => {
		const manyStations = Array.from({ length: 20 }, (_, i) => ({
			stationId: String(i),
			stationName: `Station ${i}`,
		}));

		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList stations={manyStations} selectedIndex={0} maxVisible={5} />
			</ThemedWrapper>,
		);
		expect(lastFrame()).toContain("more");
	});

	it("should handle empty stations list", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList stations={[]} selectedIndex={0} />
			</ThemedWrapper>,
		);
		expect(lastFrame()).toContain("0 stations");
	});

	it("should mark QuickMix stations", () => {
		const stationsWithQuickMix = [
			{ stationId: "1", stationName: "Station 1" },
			{ stationId: "2", stationName: "Shuffle", isQuickMix: true },
		];

		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList stations={stationsWithQuickMix} selectedIndex={0} />
			</ThemedWrapper>,
		);
		expect(lastFrame()).toContain("[Q]");
		expect(lastFrame()).toContain("Shuffle");
	});
});

describe("StationList virtual scrolling", () => {
	it("should calculate scroll offset correctly", () => {
		const stations = Array.from({ length: 30 }, (_, i) => ({
			stationId: String(i),
			stationName: `Station ${i}`,
		}));

		// When selectedIndex is 15 with maxVisible 10, should scroll
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList stations={stations} selectedIndex={15} maxVisible={10} />
			</ThemedWrapper>,
		);

		// Station 15 should be visible
		expect(lastFrame()).toContain("Station 15");
	});

	it("should show scroll up indicator when scrolled", () => {
		const stations = Array.from({ length: 30 }, (_, i) => ({
			stationId: String(i),
			stationName: `Station ${i}`,
		}));

		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList stations={stations} selectedIndex={20} maxVisible={10} />
			</ThemedWrapper>,
		);

		// Should show "more" indicators
		expect(lastFrame()).toContain("more");
	});

	it("should not show scroll indicators when all fit", () => {
		const stations = [
			{ stationId: "1", stationName: "Station 1" },
			{ stationId: "2", stationName: "Station 2" },
		];

		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList stations={stations} selectedIndex={0} maxVisible={10} />
			</ThemedWrapper>,
		);

		// "more" should not appear
		expect(lastFrame()).not.toContain("▲ more");
		expect(lastFrame()).not.toContain("▼ more");
	});
});

describe("StationList filtering", () => {
	const mockStations = [
		{ stationId: "1", stationName: "Pink Floyd Radio" },
		{ stationId: "2", stationName: "Led Zeppelin Radio" },
		{ stationId: "3", stationName: "Pink Martini Radio" },
		{ stationId: "4", stationName: "Queen Radio" },
		{ stationId: "5", stationName: "The Beatles Radio" },
	];

	it("should filter stations by name (case-insensitive)", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList stations={mockStations} selectedIndex={0} filter="pink" />
			</ThemedWrapper>,
		);

		// Should show stations containing "pink"
		expect(lastFrame()).toContain("Pink Floyd Radio");
		expect(lastFrame()).toContain("Pink Martini Radio");
		// Should not show other stations
		expect(lastFrame()).not.toContain("Led Zeppelin Radio");
		expect(lastFrame()).not.toContain("Queen Radio");
		expect(lastFrame()).not.toContain("The Beatles Radio");
	});

	it("should show filtered count in footer", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList stations={mockStations} selectedIndex={0} filter="pink" />
			</ThemedWrapper>,
		);

		// Should show "2 of 5 stations · filtered"
		expect(lastFrame()).toContain("2 of 5");
		expect(lastFrame()).toContain("filtered");
	});

	it("should show no results message when filter matches nothing", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList
					stations={mockStations}
					selectedIndex={0}
					filter="xyz123"
				/>
			</ThemedWrapper>,
		);

		expect(lastFrame()).toContain('No stations match "xyz123"');
	});

	it("should show filter indicator when filter is active but input is not focused", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList
					stations={mockStations}
					selectedIndex={0}
					filter="rock"
					isFilterActive={false}
				/>
			</ThemedWrapper>,
		);

		expect(lastFrame()).toContain("Filter:");
		expect(lastFrame()).toContain("rock");
	});

	it("should show all stations when filter is empty", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList stations={mockStations} selectedIndex={0} filter="" />
			</ThemedWrapper>,
		);

		// All stations should be visible
		expect(lastFrame()).toContain("Pink Floyd Radio");
		expect(lastFrame()).toContain("Led Zeppelin Radio");
		expect(lastFrame()).toContain("Pink Martini Radio");
		expect(lastFrame()).toContain("Queen Radio");
		expect(lastFrame()).toContain("The Beatles Radio");
		// Should show normal footer (not "filtered")
		expect(lastFrame()).toContain("5 stations");
		expect(lastFrame()).not.toContain("filtered");
	});

	it("should handle whitespace-only filter as empty", () => {
		const { lastFrame } = render(
			<ThemedWrapper>
				<StationList stations={mockStations} selectedIndex={0} filter="   " />
			</ThemedWrapper>,
		);

		// All stations should be visible
		expect(lastFrame()).toContain("5 stations");
		expect(lastFrame()).not.toContain("filtered");
	});
});
