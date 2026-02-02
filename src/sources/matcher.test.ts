import { describe, test, expect } from "bun:test";
import {
	createMatcher,
	generateFingerprint,
	computeSimilarity,
} from "./matcher.js";
import type { NormalizedRelease } from "./types.js";

function makeRelease(
	overrides: Partial<NormalizedRelease> & { title: string },
): NormalizedRelease {
	return {
		fingerprint: "",
		title: overrides.title,
		artists: overrides.artists ?? [
			{ name: "Test Artist", ids: [{ source: "pandora", id: "a1" }] },
		],
		releaseType: overrides.releaseType ?? "album",
		ids: overrides.ids ?? [{ source: "pandora", id: "r1" }],
		confidence: overrides.confidence ?? 1,
		genres: overrides.genres ?? [],
		...(overrides.year != null ? { year: overrides.year } : {}),
		...(overrides.artworkUrl != null
			? { artworkUrl: overrides.artworkUrl }
			: {}),
		...(overrides.sourceScores != null
			? { sourceScores: overrides.sourceScores }
			: {}),
	};
}

describe("generateFingerprint", () => {
	test("normalizes artist and title", () => {
		const fp = generateFingerprint("The Beatles", "Abbey Road", 1969);
		expect(fp).toBe("beatles::abbey road::1969");
	});

	test("uses 'x' when year is undefined", () => {
		const fp = generateFingerprint("Radiohead", "OK Computer");
		expect(fp).toBe("radiohead::ok computer::x");
	});

	test("removes diacritics", () => {
		const fp = generateFingerprint("Björk", "Début", 1993);
		expect(fp).toBe("bjork::debut::1993");
	});

	test("normalizes 'and' and '&'", () => {
		const fp1 = generateFingerprint(
			"Simon and Garfunkel",
			"Bridge Over Troubled Water",
		);
		const fp2 = generateFingerprint(
			"Simon & Garfunkel",
			"Bridge Over Troubled Water",
		);
		expect(fp1).toBe(fp2);
	});
});

describe("computeSimilarity", () => {
	test("identical releases have similarity 1", () => {
		const a = makeRelease({
			title: "Abbey Road",
			artists: [
				{ name: "The Beatles", ids: [{ source: "pandora", id: "1" }] },
			],
			year: 1969,
		});
		const b = makeRelease({
			title: "Abbey Road",
			artists: [
				{
					name: "The Beatles",
					ids: [{ source: "musicbrainz", id: "2" }],
				},
			],
			year: 1969,
		});
		const sim = computeSimilarity(a, b);
		expect(sim.overall).toBe(1);
		expect(sim.yearMatch).toBe(true);
	});

	test("completely different releases have low similarity", () => {
		const a = makeRelease({
			title: "Abbey Road",
			artists: [
				{ name: "The Beatles", ids: [{ source: "pandora", id: "1" }] },
			],
		});
		const b = makeRelease({
			title: "Nevermind",
			artists: [
				{ name: "Nirvana", ids: [{ source: "pandora", id: "2" }] },
			],
		});
		const sim = computeSimilarity(a, b);
		expect(sim.overall).toBeLessThan(0.5);
	});

	test("year match adds bonus", () => {
		// Use slightly different artist/title so base similarity is high but < 1.0
		const a = makeRelease({
			title: "Dark Side of the Moon",
			artists: [
				{ name: "Pink Floyd Band", ids: [{ source: "pandora", id: "1" }] },
			],
			year: 1973,
		});
		const b = makeRelease({
			title: "The Dark Side of Moon",
			artists: [
				{ name: "Pink Floyd", ids: [{ source: "pandora", id: "2" }] },
			],
			year: 1973,
		});
		const withYear = computeSimilarity(a, b);

		const c = makeRelease({
			title: "Dark Side of the Moon",
			artists: [
				{ name: "Pink Floyd Band", ids: [{ source: "pandora", id: "3" }] },
			],
			year: 1973,
		});
		const d = makeRelease({
			title: "The Dark Side of Moon",
			artists: [
				{ name: "Pink Floyd", ids: [{ source: "pandora", id: "4" }] },
			],
			year: 2003,
		});
		const withoutYear = computeSimilarity(c, d);

		expect(withYear.yearMatch).toBe(true);
		expect(withoutYear.yearMatch).toBe(false);
		// Base similarity should be < 1 so year bonus is visible
		expect(withYear.overall).toBeLessThanOrEqual(1);
		expect(withYear.overall).toBeGreaterThan(withoutYear.overall);
	});
});

describe("createMatcher", () => {
	test("adds new entries", () => {
		const matcher = createMatcher();
		const release = makeRelease({
			title: "Abbey Road",
			ids: [{ source: "pandora", id: "p1" }],
		});
		matcher.addOrMerge(release);

		expect(matcher.getAll()).toHaveLength(1);
		expect(matcher.getStats().newEntries).toBe(1);
	});

	test("matches by fingerprint (exact match)", () => {
		const matcher = createMatcher();
		const release1 = makeRelease({
			title: "Abbey Road",
			artists: [
				{
					name: "The Beatles",
					ids: [{ source: "pandora", id: "p1" }],
				},
			],
			year: 1969,
			ids: [{ source: "pandora", id: "p1" }],
		});
		const release2 = makeRelease({
			title: "Abbey Road",
			artists: [
				{
					name: "The Beatles",
					ids: [{ source: "musicbrainz", id: "mb1" }],
				},
			],
			year: 1969,
			ids: [{ source: "musicbrainz", id: "mb1" }],
			genres: ["Rock"],
		});

		matcher.addOrMerge(release1);
		matcher.addOrMerge(release2);

		expect(matcher.getAll()).toHaveLength(1);
		expect(matcher.getStats().exactMatches).toBe(1);

		const merged = matcher.getAll()[0];
		expect(merged?.ids).toHaveLength(2);
		expect(merged?.genres).toContain("Rock");
	});

	test("matches by fuzzy similarity", () => {
		const matcher = createMatcher();
		// Different years = different fingerprints, but title+artist similar enough for fuzzy
		const release1 = makeRelease({
			title: "Abbey Road",
			artists: [
				{
					name: "The Beatles",
					ids: [{ source: "pandora", id: "p1" }],
				},
			],
			year: 1969,
			ids: [{ source: "pandora", id: "p1" }],
		});
		const release2 = makeRelease({
			title: "Abbey Road (Remastered)",
			artists: [
				{
					name: "The Beatles",
					ids: [{ source: "discogs", id: "d1" }],
				},
			],
			year: 2009,
			ids: [{ source: "discogs", id: "d1" }],
			genres: ["Classic Rock"],
		});

		matcher.addOrMerge(release1);
		matcher.addOrMerge(release2);

		expect(matcher.getAll()).toHaveLength(1);
		expect(matcher.getStats().fuzzyMatches).toBe(1);

		const merged = matcher.getAll()[0];
		expect(merged?.ids).toHaveLength(2);
		expect(merged?.genres).toContain("Classic Rock");
	});

	test("keeps separate entries below similarity threshold", () => {
		const matcher = createMatcher();
		const release1 = makeRelease({
			title: "Abbey Road",
			artists: [
				{
					name: "The Beatles",
					ids: [{ source: "pandora", id: "p1" }],
				},
			],
			ids: [{ source: "pandora", id: "p1" }],
		});
		const release2 = makeRelease({
			title: "Nevermind",
			artists: [
				{
					name: "Nirvana",
					ids: [{ source: "discogs", id: "d1" }],
				},
			],
			ids: [{ source: "discogs", id: "d1" }],
		});

		matcher.addOrMerge(release1);
		matcher.addOrMerge(release2);

		expect(matcher.getAll()).toHaveLength(2);
		expect(matcher.getStats().newEntries).toBe(2);
	});

	test("merges IDs without duplicates", () => {
		const matcher = createMatcher();
		const release1 = makeRelease({
			title: "Test Album",
			artists: [
				{ name: "Artist", ids: [{ source: "pandora", id: "p1" }] },
			],
			year: 2020,
			ids: [{ source: "pandora", id: "p1" }],
		});
		const release2 = makeRelease({
			title: "Test Album",
			artists: [
				{ name: "Artist", ids: [{ source: "pandora", id: "p1" }] },
			],
			year: 2020,
			ids: [{ source: "pandora", id: "p1" }],
		});

		matcher.addOrMerge(release1);
		matcher.addOrMerge(release2);

		const merged = matcher.getAll()[0];
		expect(merged?.ids).toHaveLength(1);
	});

	test("prefers Discogs artwork", () => {
		const matcher = createMatcher();
		const release1 = makeRelease({
			title: "Test Album",
			artists: [
				{ name: "Artist", ids: [{ source: "pandora", id: "p1" }] },
			],
			year: 2020,
			ids: [{ source: "pandora", id: "p1" }],
			artworkUrl: "https://pandora.com/art.jpg",
		});
		const release2 = makeRelease({
			title: "Test Album",
			artists: [
				{ name: "Artist", ids: [{ source: "discogs", id: "d1" }] },
			],
			year: 2020,
			ids: [{ source: "discogs", id: "d1" }],
			artworkUrl: "https://discogs.com/art.jpg",
		});

		matcher.addOrMerge(release1);
		matcher.addOrMerge(release2);

		const merged = matcher.getAll()[0];
		expect(merged?.artworkUrl).toBe("https://discogs.com/art.jpg");
	});

	test("fills missing year from metadata source", () => {
		const matcher = createMatcher();
		const release1 = makeRelease({
			title: "Test Album",
			artists: [
				{ name: "Artist", ids: [{ source: "pandora", id: "p1" }] },
			],
			ids: [{ source: "pandora", id: "p1" }],
		});
		const release2 = makeRelease({
			title: "Test Album",
			artists: [
				{
					name: "Artist",
					ids: [{ source: "musicbrainz", id: "mb1" }],
				},
			],
			year: 2020,
			ids: [{ source: "musicbrainz", id: "mb1" }],
		});

		matcher.addOrMerge(release1);
		matcher.addOrMerge(release2);

		const merged = matcher.getAll()[0];
		expect(merged?.year).toBe(2020);
	});

	test("merges genres from multiple sources", () => {
		const matcher = createMatcher();
		const release1 = makeRelease({
			title: "Test Album",
			artists: [
				{ name: "Artist", ids: [{ source: "pandora", id: "p1" }] },
			],
			year: 2020,
			ids: [{ source: "pandora", id: "p1" }],
			genres: ["Rock"],
		});
		const release2 = makeRelease({
			title: "Test Album",
			artists: [
				{ name: "Artist", ids: [{ source: "discogs", id: "d1" }] },
			],
			year: 2020,
			ids: [{ source: "discogs", id: "d1" }],
			genres: ["Alternative", "Indie"],
		});

		matcher.addOrMerge(release1);
		matcher.addOrMerge(release2);

		const merged = matcher.getAll()[0];
		expect(merged?.genres).toContain("Rock");
		expect(merged?.genres).toContain("Alternative");
		expect(merged?.genres).toContain("Indie");
	});

	test("keeps highest confidence", () => {
		const matcher = createMatcher();
		const release1 = makeRelease({
			title: "Test Album",
			artists: [
				{ name: "Artist", ids: [{ source: "pandora", id: "p1" }] },
			],
			year: 2020,
			ids: [{ source: "pandora", id: "p1" }],
			confidence: 0.5,
		});
		const release2 = makeRelease({
			title: "Test Album",
			artists: [
				{
					name: "Artist",
					ids: [{ source: "musicbrainz", id: "mb1" }],
				},
			],
			year: 2020,
			ids: [{ source: "musicbrainz", id: "mb1" }],
			confidence: 0.9,
		});

		matcher.addOrMerge(release1);
		matcher.addOrMerge(release2);

		const merged = matcher.getAll()[0];
		expect(merged?.confidence).toBe(0.9);
	});
});
