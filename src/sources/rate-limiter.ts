/**
 * @module RateLimiter
 * Token bucket rate limiter with exponential backoff support.
 * Shared across all metadata providers (MusicBrainz, Discogs, etc.).
 */

/**
 * Configuration for the rate limiter.
 */
export type RateLimiterConfig = {
	/** Target requests per second */
	readonly requestsPerSecond: number;
	/** Maximum tokens in bucket (allows bursting) */
	readonly burstSize: number;
	/** Maximum retry attempts on rate limit */
	readonly maxRetries: number;
	/** Base delay in ms for exponential backoff */
	readonly baseBackoffMs: number;
};

/**
 * Current rate limiter statistics.
 */
export type RateLimiterStats = {
	/** Current token count (fractional) */
	readonly tokens: number;
	/** Total requests processed */
	readonly totalRequests: number;
	/** Total retries due to rate limiting */
	readonly totalRetries: number;
};

/**
 * Rate limiter interface using token bucket algorithm.
 */
export type RateLimiter = {
	/** Wait for a token before making a request */
	readonly acquire: () => Promise<void>;
	/** Signal that a request was rate-limited (resets tokens) */
	readonly onRateLimited: () => void;
	/** Get current statistics */
	readonly getStats: () => RateLimiterStats;
};

/**
 * Creates a token bucket rate limiter.
 * Tokens refill at requestsPerSecond rate, up to burstSize maximum.
 *
 * @param config - Rate limiter configuration
 * @returns A RateLimiter instance
 *
 * @example
 * ```ts
 * const limiter = createRateLimiter({
 *   requestsPerSecond: 1,
 *   burstSize: 3,
 *   maxRetries: 3,
 *   baseBackoffMs: 1000
 * });
 *
 * await limiter.acquire(); // Wait for token
 * const result = await fetch(url);
 * if (result.status === 429) limiter.onRateLimited();
 * ```
 */
export const createRateLimiter = (config: RateLimiterConfig): RateLimiter => {
	const { requestsPerSecond, burstSize } = config;
	const refillIntervalMs = 1000 / requestsPerSecond;

	let tokens = burstSize;
	let lastRefill = Date.now();
	let totalRequests = 0;
	let totalRetries = 0;

	const refillTokens = (): void => {
		const now = Date.now();
		const elapsed = now - lastRefill;
		const tokensToAdd = elapsed / refillIntervalMs;
		tokens = Math.min(burstSize, tokens + tokensToAdd);
		lastRefill = now;
	};

	const acquire = async (): Promise<void> => {
		refillTokens();

		if (tokens < 1) {
			const waitMs = (1 - tokens) * refillIntervalMs;
			await new Promise((r) => setTimeout(r, waitMs));
			refillTokens();
		}

		tokens -= 1;
		totalRequests += 1;
	};

	const onRateLimited = (): void => {
		tokens = 0;
		totalRetries += 1;
	};

	const getStats = (): RateLimiterStats => ({
		tokens: Math.floor(tokens * 100) / 100,
		totalRequests,
		totalRetries,
	});

	return { acquire, onRateLimited, getStats };
};
