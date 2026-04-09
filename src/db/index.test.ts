import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { backfillAlbumPlacementFile } from "./index";

describe("backfillAlbumPlacementFile", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
	});

	it("backfills missing album placement fields to collection", async () => {
		const tempDir = await mkdtemp(join(process.cwd(), "tmp-db-album-placement-"));
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
		const tempDir = await mkdtemp(join(process.cwd(), "tmp-db-album-placement-"));
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
