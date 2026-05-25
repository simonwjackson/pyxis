import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function contractFiles(dir: string): readonly string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return contractFiles(path);
		return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
	});
}

function productionContractFiles(dir: string): readonly string[] {
	return contractFiles(dir).filter(
		(file) => !file.endsWith(".test-support.ts"),
	);
}

describe("API contract import boundaries", () => {
	it("does not import server, web, provider internals, filesystem, or environment modules", () => {
		const forbidden = [
			/from "\.\.\/\.\.\/server\//,
			/from "server\//,
			/from ".*src\/sources\//,
			/from "node:/,
			/process\.env/,
		];
		const offenders = contractFiles("src/api/contracts").flatMap((file) => {
			const source = readFileSync(file, "utf8");
			return forbidden.some((pattern) => pattern.test(source)) ? [file] : [];
		});
		expect(offenders).toEqual([]);
	});

	it("keeps branch-internal parity helpers out of production contracts", () => {
		const offenders = productionContractFiles("src/api/contracts").flatMap(
			(file) => {
				const source = readFileSync(file, "utf8");
				return source.includes("parity.test-support") ? [file] : [];
			},
		);
		expect(offenders).toEqual([]);
	});
});
