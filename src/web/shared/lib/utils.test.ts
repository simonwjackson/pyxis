/**
 * @module utils tests
 * Tests for CSS class name utilities.
 */

import { describe, it, expect } from "bun:test";
import { cn } from "./utils";

describe("cn", () => {
	it("merges simple class names", () => {
		const result = cn("class1", "class2");
		expect(result).toBe("class1 class2");
	});

	it("handles conditional classes", () => {
		const isActive = true;
		const result = cn("base", isActive && "active");
		expect(result).toBe("base active");
	});

	it("handles false conditional classes", () => {
		const isActive = false;
		const result = cn("base", isActive && "active");
		expect(result).toBe("base");
	});

	it("handles undefined values", () => {
		const result = cn("base", undefined, "other");
		expect(result).toBe("base other");
	});

	it("handles null values", () => {
		const result = cn("base", null, "other");
		expect(result).toBe("base other");
	});

	it("handles object syntax", () => {
		const result = cn({
			base: true,
			active: true,
			disabled: false,
		});
		expect(result).toBe("base active");
	});

	it("handles arrays", () => {
		const result = cn(["class1", "class2"]);
		expect(result).toBe("class1 class2");
	});

	it("merges Tailwind conflicts correctly", () => {
		// tailwind-merge deduplicates conflicting utilities
		const result = cn("px-4", "px-6");
		expect(result).toBe("px-6");
	});

	it("merges Tailwind padding conflicts", () => {
		const result = cn("py-2", "py-4");
		expect(result).toBe("py-4");
	});

	it("preserves non-conflicting Tailwind classes", () => {
		const result = cn("px-4", "py-2");
		expect(result).toBe("px-4 py-2");
	});

	it("handles empty input", () => {
		const result = cn();
		expect(result).toBe("");
	});

	it("handles complex mixed input", () => {
		const isActive = true;
		const isDisabled = false;
		const result = cn(
			"base",
			isActive && "active",
			isDisabled && "disabled",
			{ hover: true },
			["extra1", "extra2"],
		);
		expect(result).toContain("base");
		expect(result).toContain("active");
		expect(result).not.toContain("disabled");
		expect(result).toContain("hover");
		expect(result).toContain("extra1");
		expect(result).toContain("extra2");
	});
});
