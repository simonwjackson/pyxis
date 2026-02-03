import { readFileSync } from "node:fs";
import { parse } from "yaml";

const YAML_PATH =
	process.argv[2] ??
	"/home/simonwjackson/.claude-accounts/personal/albums.yaml";
const SERVER_URL = process.argv[3] ?? "http://localhost:8765";
const DELAY_MS = 1000;

type AlbumSource = {
	readonly type: string;
	readonly id: string;
};

type AlbumEntry = {
	readonly title: string;
	readonly artist: string;
	readonly year?: number;
	readonly artworkUrl?: string;
	readonly sources: readonly AlbumSource[];
};

type YamlData = {
	readonly albums: readonly AlbumEntry[];
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveAlbum(
	serverUrl: string,
	sourceId: string,
): Promise<{ readonly id: string; readonly alreadyExists: boolean }> {
	// Non-batch tRPC call: body is the raw input, no transformer
	const res = await fetch(`${serverUrl}/trpc/library.saveAlbum`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id: sourceId }),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`HTTP ${res.status}: ${text}`);
	}

	const body = (await res.json()) as {
		readonly result: {
			readonly data: { readonly id: string; readonly alreadyExists: boolean };
		};
	};
	return body.result.data;
}

async function main(): Promise<void> {
	const raw = readFileSync(YAML_PATH, "utf-8");
	const data = parse(raw) as YamlData;
	const albums = data.albums;

	console.log(`Found ${albums.length} albums in ${YAML_PATH}`);
	console.log(`Target server: ${SERVER_URL}`);
	console.log("---");

	let succeeded = 0;
	let skipped = 0;
	let failed = 0;
	const failures: Array<{ readonly index: number; readonly title: string; readonly artist: string; readonly error: string }> = [];

	for (let i = 0; i < albums.length; i++) {
		const album = albums[i];
		if (!album) continue;

		const source = album.sources[0];
		if (!source) {
			console.log(
				`[${i + 1}/${albums.length}] SKIP (no source): ${album.title} - ${album.artist}`,
			);
			skipped++;
			continue;
		}

		const sourceId = `${source.type}:${source.id}`;

		try {
			const result = await saveAlbum(SERVER_URL, sourceId);
			if (result.alreadyExists) {
				console.log(
					`[${i + 1}/${albums.length}] EXISTS: ${album.title} - ${album.artist}`,
				);
				skipped++;
			} else {
				console.log(
					`[${i + 1}/${albums.length}] SAVED: ${album.title} - ${album.artist} (${result.id})`,
				);
				succeeded++;
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(
				`[${i + 1}/${albums.length}] FAILED: ${album.title} - ${album.artist} (${message})`,
			);
			failures.push({ index: i + 1, title: album.title, artist: album.artist, error: message });
			failed++;
		}

		if (i < albums.length - 1) {
			await sleep(DELAY_MS);
		}
	}

	console.log("---");
	console.log(
		`Done. Imported ${succeeded}/${albums.length} albums (${skipped} skipped, ${failed} failed)`,
	);

	if (failures.length > 0) {
		console.log("\nFailed albums:");
		for (const f of failures) {
			console.log(`  [${f.index}] ${f.title} - ${f.artist}: ${f.error}`);
		}
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
