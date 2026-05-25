import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PyxisRpc } from "../rpc.js";

function tsFilesIn(dir: string): readonly string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return tsFilesIn(path);
		return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
	});
}

function productionSourceFiles(dir: string): readonly string[] {
	return tsFilesIn(dir).filter((file) => !file.endsWith(".test-support.ts"));
}

const apiProductionFiles: readonly string[] = [
	...tsFilesIn("src/api/contracts"),
	"src/api/rpc.ts",
];

describe("API contract import boundaries", () => {
	it("does not import server, web, provider internals, filesystem, or environment modules", () => {
		const forbidden = [
			/from "\.\.\/\.\.\/server\//,
			/from "server\//,
			/from ".*src\/sources\//,
			/from ".*src\/web\//,
			/from ".*src\/db\//,
			/from "node:/,
			/process\.env/,
		];
		const offenders = apiProductionFiles.flatMap((file) => {
			const source = readFileSync(file, "utf8");
			return forbidden.some((pattern) => pattern.test(source)) ? [file] : [];
		});
		expect(offenders).toEqual([]);
	});

	it("keeps branch-internal parity helpers out of production contracts", () => {
		const offenders = [
			...productionSourceFiles("src/api/contracts"),
			"src/api/rpc.ts",
		].flatMap((file) => {
			const source = readFileSync(file, "utf8");
			return source.includes("parity.test-support") ? [file] : [];
		});
		expect(offenders).toEqual([]);
	});

	it("exposes a single RPC group with entity.concept.action tag naming", () => {
		const tags = [...PyxisRpc.requests.keys()];
		expect(tags.length).toBeGreaterThan(0);
		const malformed = tags.filter(
			(tag) => !/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*){1,3}$/.test(tag),
		);
		expect(malformed).toEqual([]);
		expect(new Set(tags).size).toBe(tags.length);
	});
});
