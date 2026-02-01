/**
 * Token bucket rate limiter with exponential backoff support.
 * Shared across all metadata providers.
 */

export type RateLimiterConfig = {
	readonly requestsPerSecond: number;
	readonly burstSize: number;
	readonly maxRetries: number;
	readonly baseBackoffMs: number;
};

export type RateLimiterStats = {
	readonly tokens: number;
	readonly totalRequests: number;
	readonly totalRetries: number;
};

export type RateLimiter = {
	readonly acquire: () => Promise<void>;
	readonly onRateLimited: () => void;
	readonly getStats: () => RateLimiterStats;
};

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
