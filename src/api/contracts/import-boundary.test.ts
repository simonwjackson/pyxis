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

describe("API contract import boundaries", () => {
	it("does not import server, web, provider internals, filesystem, or environment modules", () => {
		const forbidden = [/from "\.\.\/\.\.\/server\//, /from "server\//, /from ".*src\/sources\//, /from "node:/, /process\.env/];
		const offenders = contractFiles("src/api/contracts").flatMap((file) => {
			const source = readFileSync(file, "utf8");
			return forbidden.some((pattern) => pattern.test(source)) ? [file] : [];
		});
		expect(offenders).toEqual([]);
	});
});
