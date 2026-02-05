/**
 * @module RateLimiter tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createRateLimiter } from "./rate-limiter.js";

describe("createRateLimiter", () => {
	const defaultConfig = {
		requestsPerSecond: 10,
		burstSize: 3,
		maxRetries: 3,
		baseBackoffMs: 1000,
	};

	describe("getStats", () => {
		it("returns initial stats with full tokens", () => {
			const limiter = createRateLimiter(defaultConfig);
			const stats = limiter.getStats();

			expect(stats.totalRequests).toBe(0);
			expect(stats.totalRetries).toBe(0);
			expect(stats.tokens).toBe(3);
		});
	});

	describe("acquire", () => {
		it("decrements tokens on acquire", async () => {
			const limiter = createRateLimiter(defaultConfig);

			await limiter.acquire();

			const stats = limiter.getStats();
			expect(stats.totalRequests).toBe(1);
			expect(stats.tokens).toBeLessThan(3);
		});

		it("allows burst of requests up to burstSize", async () => {
			const limiter = createRateLimiter(defaultConfig);

			// Should allow 3 quick requests (burstSize)
			await limiter.acquire();
			await limiter.acquire();
			await limiter.acquire();

			const stats = limiter.getStats();
			expect(stats.totalRequests).toBe(3);
		});

		it("waits when tokens exhausted", async () => {
			const limiter = createRateLimiter({
				...defaultConfig,
				requestsPerSecond: 100, // Fast refill for testing
				burstSize: 1,
			});

			const start = Date.now();

			// Exhaust the single token
			await limiter.acquire();
			// Should wait for refill
			await limiter.acquire();

			const elapsed = Date.now() - start;
			// Should have waited some time (at least a few ms)
			expect(elapsed).toBeGreaterThanOrEqual(5);

			const stats = limiter.getStats();
			expect(stats.totalRequests).toBe(2);
		});
	});

	describe("onRateLimited", () => {
		it("resets tokens to zero", async () => {
			const limiter = createRateLimiter(defaultConfig);

			// Use one token
			await limiter.acquire();

			// Signal rate limited
			limiter.onRateLimited();

			const stats = limiter.getStats();
			expect(stats.tokens).toBe(0);
			expect(stats.totalRetries).toBe(1);
		});

		it("increments retry count", () => {
			const limiter = createRateLimiter(defaultConfig);

			limiter.onRateLimited();
			limiter.onRateLimited();
			limiter.onRateLimited();

			const stats = limiter.getStats();
			expect(stats.totalRetries).toBe(3);
		});
	});

	describe("token refill", () => {
		it("refills tokens over time", async () => {
			const limiter = createRateLimiter({
				...defaultConfig,
				requestsPerSecond: 1000, // Very fast refill
				burstSize: 5,
			});

			// Exhaust all tokens
			await limiter.acquire();
			await limiter.acquire();
			await limiter.acquire();
			await limiter.acquire();
			await limiter.acquire();

			// Wait for some refill
			await new Promise((r) => setTimeout(r, 10));

			// Acquire again - should have refilled some
			await limiter.acquire();

			const stats = limiter.getStats();
			expect(stats.totalRequests).toBe(6);
		});

		it("caps tokens at burstSize", async () => {
			const limiter = createRateLimiter({
				...defaultConfig,
				requestsPerSecond: 10000, // Very fast refill
				burstSize: 3,
			});

			// Use one token
			await limiter.acquire();

			// Wait longer than needed to refill
			await new Promise((r) => setTimeout(r, 50));

			// Should still be capped at burstSize
			const stats = limiter.getStats();
			expect(stats.tokens).toBeLessThanOrEqual(3);
		});
	});
});
