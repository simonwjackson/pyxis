/**
 * @module commands tests
 * Tests for command palette utilities.
 */

import { describe, it, expect } from "bun:test";
import { commands, filterCommands, groupCommands } from "./commands";

describe("commands", () => {
	it("has playback commands", () => {
		const playbackCmds = commands.filter((c) => c.category === "playback");
		expect(playbackCmds.length).toBeGreaterThan(0);

		const labels = playbackCmds.map((c) => c.label);
		expect(labels).toContain("Play / Pause");
		expect(labels).toContain("Skip Track");
	});

	it("has navigation commands", () => {
		const navCmds = commands.filter((c) => c.category === "navigation");
		expect(navCmds.length).toBeGreaterThan(0);

		const labels = navCmds.map((c) => c.label);
		expect(labels).toContain("Go to Stations");
		expect(labels).toContain("Go to Search");
	});

	it("has appearance commands", () => {
		const appearanceCmds = commands.filter(
			(c) => c.category === "appearance",
		);
		expect(appearanceCmds.length).toBeGreaterThan(0);
	});

	it("each command has required fields", () => {
		for (const cmd of commands) {
			expect(cmd.id).toBeDefined();
			expect(cmd.label).toBeDefined();
			expect(cmd.category).toBeDefined();
			expect(cmd.action).toBeDefined();
		}
	});
});

describe("filterCommands", () => {
	it("returns all commands for empty query", () => {
		const result = filterCommands("");
		expect(result.length).toBe(commands.length);
	});

	it("returns all commands for whitespace query", () => {
		const result = filterCommands("   ");
		expect(result.length).toBe(commands.length);
	});

	it("filters by label (case-insensitive)", () => {
		const result = filterCommands("play");
		expect(result.some((c) => c.label.toLowerCase().includes("play"))).toBe(
			true,
		);
	});

	it("filters by category", () => {
		const result = filterCommands("navigation");
		expect(result.every((c) => c.category === "navigation")).toBe(true);
	});

	it("returns empty array for non-matching query", () => {
		const result = filterCommands("xyznonexistent");
		expect(result.length).toBe(0);
	});

	it("is case-insensitive", () => {
		const lower = filterCommands("stations");
		const upper = filterCommands("STATIONS");
		const mixed = filterCommands("StAtIoNs");

		expect(lower.length).toBe(upper.length);
		expect(lower.length).toBe(mixed.length);
	});
});

describe("groupCommands", () => {
	it("groups commands by category", () => {
		const groups = groupCommands(commands);

		for (const group of groups) {
			expect(
				group.commands.every((c) => c.category === group.category),
			).toBe(true);
		}
	});

	it("preserves category order", () => {
		const groups = groupCommands(commands);
		const categories = groups.map((g) => g.category);

		// playback should come before navigation
		const playbackIdx = categories.indexOf("playback");
		const navIdx = categories.indexOf("navigation");

		if (playbackIdx >= 0 && navIdx >= 0) {
			expect(playbackIdx).toBeLessThan(navIdx);
		}
	});

	it("returns empty array for empty input", () => {
		const groups = groupCommands([]);
		expect(groups.length).toBe(0);
	});

	it("includes all commands", () => {
		const groups = groupCommands(commands);
		const totalCommands = groups.reduce(
			(sum, g) => sum + g.commands.length,
			0,
		);
		expect(totalCommands).toBe(commands.length);
	});

	it("returns groups in consistent order", () => {
		const groups1 = groupCommands(commands);
		const groups2 = groupCommands(commands);

		expect(groups1.map((g) => g.category)).toEqual(
			groups2.map((g) => g.category),
		);
	});
});
