import { describe, it, expect } from "bun:test";
import { truncate, formatDuration, padEnd, center } from "./format.js";

describe("format utilities", () => {
	describe("truncate", () => {
		it("should return text unchanged if shorter than maxLength", () => {
			expect(truncate("hello", 10)).toBe("hello");
		});

		it("should return text unchanged if equal to maxLength", () => {
			expect(truncate("hello", 5)).toBe("hello");
		});

		it("should truncate with ellipsis if longer than maxLength", () => {
			expect(truncate("hello world", 6)).toBe("hello\u2026");
		});

		it("should handle maxLength of 1", () => {
			expect(truncate("hello", 1)).toBe("\u2026");
		});

		it("should handle empty string", () => {
			expect(truncate("", 10)).toBe("");
		});

		it("should handle unicode characters", () => {
			expect(truncate("hello\u{1F600}", 6)).toBe("hello\u2026");
		});
	});

	describe("formatDuration", () => {
		it("should format 0 seconds as 0:00", () => {
			expect(formatDuration(0)).toBe("0:00");
		});

		it("should format seconds less than 60", () => {
			expect(formatDuration(45)).toBe("0:45");
		});

		it("should format exactly 60 seconds as 1:00", () => {
			expect(formatDuration(60)).toBe("1:00");
		});

		it("should format minutes and seconds", () => {
			expect(formatDuration(125)).toBe("2:05");
		});

		it("should pad single-digit seconds with zero", () => {
			expect(formatDuration(61)).toBe("1:01");
			expect(formatDuration(69)).toBe("1:09");
		});

		it("should handle large durations", () => {
			expect(formatDuration(3661)).toBe("61:01"); // 1 hour, 1 minute, 1 second
		});

		it("should floor fractional seconds", () => {
			expect(formatDuration(65.9)).toBe("1:05");
		});
	});

	describe("padEnd", () => {
		it("should pad shorter text with spaces", () => {
			expect(padEnd("hi", 5)).toBe("hi   ");
		});

		it("should return text unchanged if equal to width", () => {
			expect(padEnd("hello", 5)).toBe("hello");
		});

		it("should truncate text if longer than width", () => {
			expect(padEnd("hello world", 5)).toBe("hello");
		});

		it("should handle empty string", () => {
			expect(padEnd("", 3)).toBe("   ");
		});

		it("should handle width of 0", () => {
			expect(padEnd("hello", 0)).toBe("");
		});
	});

	describe("center", () => {
		it("should center text with equal padding", () => {
			expect(center("hi", 6)).toBe("  hi  ");
		});

		it("should handle odd remaining space (extra space on right)", () => {
			expect(center("hi", 5)).toBe(" hi  ");
		});

		it("should return text unchanged if equal to width", () => {
			expect(center("hello", 5)).toBe("hello");
		});

		it("should return text unchanged if longer than width", () => {
			expect(center("hello world", 5)).toBe("hello world");
		});

		it("should handle empty string", () => {
			expect(center("", 4)).toBe("    ");
		});

		it("should handle width of 1 with empty string", () => {
			expect(center("", 1)).toBe(" ");
		});
	});
});
