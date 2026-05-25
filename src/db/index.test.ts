import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { backfillAlbumPlacementFile, repairJsonlFile } from "./index";

describe("backfillAlbumPlacementFile", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempDirs
				.splice(0)
				.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it("backfills missing album placement fields to collection", async () => {
		const tempDir = await mkdtemp(
			join(process.cwd(), "tmp-db-album-placement-"),
		);
		tempDirs.push(tempDir);
		const albumsPath = join(tempDir, "albums.yaml");

		await writeFile(
			albumsPath,
			[
				"album_1:",
				"  id: album_1",
				"  title: Album One",
				"  artist: Artist One",
				"  createdAt: 123",
				"album_2:",
				"  id: album_2",
				"  title: Album Two",
				"  artist: Artist Two",
			].join("\n"),
			"utf-8",
		);

		expect(backfillAlbumPlacementFile(albumsPath)).toBe(true);

		const content = await readFile(albumsPath, "utf-8");
		expect(content).toContain("placement: collection");
		expect(content).toContain("placementUpdatedAt: 123");
	});

	it("does nothing when placement fields already exist", async () => {
		const tempDir = await mkdtemp(
			join(process.cwd(), "tmp-db-album-placement-"),
		);
		tempDirs.push(tempDir);
		const albumsPath = join(tempDir, "albums.yaml");
		const initial = [
			"album_1:",
			"  id: album_1",
			"  title: Album One",
			"  artist: Artist One",
			"  placement: archive",
			"  placementUpdatedAt: 456",
			"  createdAt: 123",
		].join("\n");

		await writeFile(albumsPath, initial, "utf-8");

		expect(backfillAlbumPlacementFile(albumsPath)).toBe(false);
		expect(await readFile(albumsPath, "utf-8")).toBe(initial);
	});
});

describe("repairJsonlFile", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempDirs
				.splice(0)
				.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	async function tempJsonl(content: string): Promise<string> {
		const tempDir = await mkdtemp(join(process.cwd(), "tmp-db-jsonl-repair-"));
		tempDirs.push(tempDir);
		const filePath = join(tempDir, "listen-log.jsonl");
		await writeFile(filePath, content, "utf-8");
		return filePath;
	}

	it("does nothing for valid JSONL files", async () => {
		const filePath = await tempJsonl('{"id":"1"}\n{"id":"2"}\n');

		expect(repairJsonlFile(filePath)).toBe(false);
		expect(await readFile(filePath, "utf-8")).toBe('{"id":"1"}\n{"id":"2"}\n');
	});

	it("splits concatenated JSON objects into separate lines", async () => {
		const filePath = await tempJsonl('{"id":"1"}{"id":"2"}\n');

		expect(repairJsonlFile(filePath)).toBe(true);
		expect(await readFile(filePath, "utf-8")).toBe('{"id":"1"}\n{"id":"2"}\n');
	});

	it("keeps escaped quotes and braces inside JSON strings", async () => {
		const filePath = await tempJsonl(
			'{"message":"brace } and quote \\" stay"}{"id":"2"}\n',
		);

		expect(repairJsonlFile(filePath)).toBe(true);
		expect(await readFile(filePath, "utf-8")).toBe(
			'{"message":"brace } and quote \\" stay"}\n{"id":"2"}\n',
		);
	});

	it("preserves the original file and leaves no temp file when repair validation fails", async () => {
		const original = '{"id":"1"}{"id":broken}\n';
		const filePath = await tempJsonl(original);

		expect(() => repairJsonlFile(filePath)).toThrow();
		expect(await readFile(filePath, "utf-8")).toBe(original);
		expect(
			(await readdir(dirname(filePath))).filter((entry) =>
				entry.includes(".tmp"),
			),
		).toEqual([]);
	});
});
