/**
 * @module Matcher
 * Real-time metadata matcher for joining results from multiple sources.
 *
 * Matches releases from MusicBrainz, Discogs, and other sources using:
 * 1. Exact fingerprint matching (fast path via artist::title::year hash)
 * 2. Fuzzy string similarity via Jaro-Winkler algorithm (fallback)
 *
 * Merges matching releases to combine source IDs, genres, and artwork.
 */

import type { NormalizedRelease, SourceId, SourceType } from "./types.js";

// --- String Normalization ---

const normalize = (s: string): string =>
	s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "") // Remove diacritics
		.replace(/[^a-z0-9\s]/g, "") // Remove punctuation
		.replace(/\s+/g, " ") // Collapse whitespace
		.trim();

const normalizeArtist = (s: string): string =>
	normalize(s)
		.replace(/^the\s+/, "") // "The Beatles" -> "beatles"
		.replace(/\s+and\s+/g, " ") // "Simon and Garfunkel" -> "simon garfunkel"
		.replace(/\s*&\s*/g, " ");

// --- Fingerprint Generation ---

/**
 * Generates a normalized fingerprint for exact matching.
 * Format: "normalizedartist::normalizedtitle::year" (year is "x" if unknown)
 *
 * @param artist - Artist name (will be normalized)
 * @param title - Album/release title (will be normalized)
 * @param year - Release year (optional)
 * @returns Fingerprint string for hash-based matching
 */
export const generateFingerprint = (
	artist: string,
	title: string,
	year?: number,
): string => {
	const a = normalizeArtist(artist);
	const t = normalize(title);
	const y = year ?? "x";
	return `${a}::${t}::${y}`;
};

// --- Jaro-Winkler Similarity ---

const jaroSimilarity = (s1: string, s2: string): number => {
	if (s1 === s2) return 1;
	if (s1.length === 0 || s2.length === 0) return 0;

	const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
	const s1Matches = new Array<boolean>(s1.length).fill(false);
	const s2Matches = new Array<boolean>(s2.length).fill(false);

	let matches = 0;
	let transpositions = 0;

	for (let i = 0; i < s1.length; i++) {
		const start = Math.max(0, i - matchDistance);
		const end = Math.min(i + matchDistance + 1, s2.length);

		for (let j = start; j < end; j++) {
			if (s2Matches[j] || s1[i] !== s2[j]) continue;
			s1Matches[i] = true;
			s2Matches[j] = true;
			matches++;
			break;
		}
	}

	if (matches === 0) return 0;

	let k = 0;
	for (let i = 0; i < s1.length; i++) {
		if (!s1Matches[i]) continue;
		while (!s2Matches[k]) k++;
		if (s1[i] !== s2[k]) transpositions++;
		k++;
	}

	return (
		(matches / s1.length +
			matches / s2.length +
			(matches - transpositions / 2) / matches) /
		3
	);
};

const jaroWinkler = (s1: string, s2: string, prefixScale = 0.1): number => {
	const jaro = jaroSimilarity(s1, s2);

	// Common prefix up to 4 chars
	let prefix = 0;
	for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
		if (s1[i] === s2[i]) prefix++;
		else break;
	}

	return jaro + prefix * prefixScale * (1 - jaro);
};

// --- Similarity Scoring ---

/**
 * Similarity score breakdown for fuzzy matching.
 * All scores are 0-1 where 1 is a perfect match.
 */
export type SimilarityScore = {
	/** Weighted combination of artist and title similarity */
	readonly overall: number;
	/** Artist name similarity (Jaro-Winkler) */
	readonly artist: number;
	/** Title similarity (Jaro-Winkler) */
	readonly title: number;
	/** Whether release years match exactly */
	readonly yearMatch: boolean;
};

/**
 * Computes similarity between two releases using Jaro-Winkler algorithm.
 * Weights title slightly higher than artist (55/45) with a year match bonus.
 *
 * @param a - First release to compare
 * @param b - Second release to compare
 * @returns Similarity score breakdown
 */
export const computeSimilarity = (
	a: NormalizedRelease,
	b: NormalizedRelease,
): SimilarityScore => {
	const artistA = normalizeArtist(a.artists[0]?.name ?? "");
	const artistB = normalizeArtist(b.artists[0]?.name ?? "");
	const titleA = normalize(a.title);
	const titleB = normalize(b.title);

	const artistSim = jaroWinkler(artistA, artistB);
	const titleSim = jaroWinkler(titleA, titleB);
	const yearMatch = a.year !== undefined && a.year === b.year;

	// Weighted: title slightly more important than artist
	const base = artistSim * 0.45 + titleSim * 0.55;

	// Year match bonus
	const overall = yearMatch ? Math.min(1, base + 0.05) : base;

	return {
		overall,
		artist: artistSim,
		title: titleSim,
		yearMatch,
	};
};

// --- Matcher ---

/**
 * Configuration for the release matcher.
 */
export type MatcherConfig = {
	/** Minimum similarity score (0-1) for fuzzy matches. Default: 0.85 */
	readonly similarityThreshold: number;
};

/**
 * Result of matching a release against the existing collection.
 */
export type MatchResult =
	| { readonly type: "exact"; readonly existing: NormalizedRelease }
	| {
			readonly type: "fuzzy";
			readonly existing: NormalizedRelease;
			readonly similarity: SimilarityScore;
	  }
	| { readonly type: "new" };

/**
 * Interface for the release matcher.
 * Manages a collection of releases and handles matching/merging.
 */
export type Matcher = {
	/** Check if a release matches an existing entry */
	readonly match: (release: NormalizedRelease) => MatchResult;
	/** Add a release as a new entry (no matching check) */
	readonly add: (release: NormalizedRelease) => NormalizedRelease;
	/** Match and merge if found, otherwise add as new */
	readonly addOrMerge: (release: NormalizedRelease) => NormalizedRelease;
	/** Get all releases in the collection */
	readonly getAll: () => readonly NormalizedRelease[];
	/** Get matching statistics */
	readonly getStats: () => MatcherStats;
};

/**
 * Statistics about matcher operations.
 */
export type MatcherStats = {
	readonly total: number;
	readonly exactMatches: number;
	readonly fuzzyMatches: number;
	readonly newEntries: number;
};

/**
 * Creates a new release matcher for deduplicating and merging releases.
 *
 * @param config - Optional configuration (similarityThreshold defaults to 0.85)
 * @returns A Matcher instance
 *
 * @example
 * ```ts
 * const matcher = createMatcher({ similarityThreshold: 0.90 });
 * for (const release of releases) {
 *   matcher.addOrMerge(release);
 * }
 * const deduplicated = matcher.getAll();
 * ```
 */
export const createMatcher = (
	config: Partial<MatcherConfig> = {},
): Matcher => {
	const { similarityThreshold = 0.85 } = config;

	const fingerprintToIndex = new Map<string, number>();
	const all: NormalizedRelease[] = [];

	let exactMatches = 0;
	let fuzzyMatches = 0;
	let newEntries = 0;

	const getFingerprint = (r: NormalizedRelease): string =>
		generateFingerprint(r.artists[0]?.name ?? "", r.title, r.year);

	const match = (release: NormalizedRelease): MatchResult => {
		const fp = getFingerprint(release);

		// Fast path: exact fingerprint match
		const idx = fingerprintToIndex.get(fp);
		if (idx !== undefined) {
			const existing = all[idx];
			if (existing) {
				return { type: "exact", existing };
			}
		}

		// Slow path: fuzzy match against all entries
		let bestMatch: NormalizedRelease | undefined;
		let bestSimilarity: SimilarityScore | undefined;

		for (const candidate of all) {
			const sim = computeSimilarity(release, candidate);
			if (sim.overall >= similarityThreshold) {
				if (!bestSimilarity || sim.overall > bestSimilarity.overall) {
					bestMatch = candidate;
					bestSimilarity = sim;
				}
			}
		}

		if (bestMatch && bestSimilarity) {
			return { type: "fuzzy", existing: bestMatch, similarity: bestSimilarity };
		}

		return { type: "new" };
	};

	const mergeReleases = (
		existing: NormalizedRelease,
		incoming: NormalizedRelease,
	): NormalizedRelease => {
		// Merge source IDs
		const existingIds = new Set(
			existing.ids.map((id) => `${id.source}:${id.id}`),
		);
		const newIds: SourceId[] = [...existing.ids];
		for (const id of incoming.ids) {
			if (!existingIds.has(`${id.source}:${id.id}`)) {
				newIds.push(id);
			}
		}

		// Merge genres
		const genreSet = new Set([...existing.genres, ...incoming.genres]);

		// Merge source scores
		const sourceScores: Partial<Record<SourceType, number>> = {
			...existing.sourceScores,
			...incoming.sourceScores,
		};

		// Pick best confidence
		const confidence = Math.max(existing.confidence, incoming.confidence);

		// Prefer year if missing
		const year = existing.year ?? incoming.year;

		// Prefer artwork from Discogs (has cover images), then existing
		const artworkUrl =
			incoming.ids.some((id) => id.source === "discogs") && incoming.artworkUrl
				? incoming.artworkUrl
				: existing.artworkUrl ?? incoming.artworkUrl;

		return {
			...existing,
			ids: newIds,
			genres: [...genreSet],
			sourceScores,
			confidence,
			...(year != null ? { year } : {}),
			...(artworkUrl != null ? { artworkUrl } : {}),
		};
	};

	const add = (release: NormalizedRelease): NormalizedRelease => {
		const fp = getFingerprint(release);
		const idx = all.length;
		all.push(release);
		fingerprintToIndex.set(fp, idx);
		newEntries++;
		return release;
	};

	const mergeAtIndex = (
		idx: number,
		existing: NormalizedRelease,
		incoming: NormalizedRelease,
	): NormalizedRelease => {
		const merged = mergeReleases(existing, incoming);
		all[idx] = merged;
		// Index all fingerprints to this index
		const fpExisting = getFingerprint(existing);
		const fpIncoming = getFingerprint(incoming);
		const fpMerged = getFingerprint(merged);
		fingerprintToIndex.set(fpExisting, idx);
		fingerprintToIndex.set(fpIncoming, idx);
		fingerprintToIndex.set(fpMerged, idx);
		return merged;
	};

	const addOrMerge = (release: NormalizedRelease): NormalizedRelease => {
		const result = match(release);

		switch (result.type) {
			case "exact": {
				exactMatches++;
				const idx = all.indexOf(result.existing);
				if (idx !== -1) {
					return mergeAtIndex(idx, result.existing, release);
				}
				return result.existing;
			}
			case "fuzzy": {
				fuzzyMatches++;
				const idx = all.indexOf(result.existing);
				if (idx !== -1) {
					return mergeAtIndex(idx, result.existing, release);
				}
				return result.existing;
			}
			case "new": {
				return add(release);
			}
		}
	};

	return {
		match,
		add,
		addOrMerge,
		getAll: () => all,
		getStats: () => ({
			total: all.length,
			exactMatches,
			fuzzyMatches,
			newEntries,
		}),
	};
};
