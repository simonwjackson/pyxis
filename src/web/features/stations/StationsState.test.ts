import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { ApiStationSummary } from "../../../api/contracts/radio.js";
import { StationsState } from "./StationsState.js";

const sampleStation = (id: string): ApiStationSummary => ({
	id: `pandora:${id}`,
	stationId: `pandora:s-${id}`,
	name: `Station ${id}`,
	isQuickMix: false,
	quickMixStationIds: [],
	allowDelete: true,
	allowRename: true,
});

describe("StationsState.fromResult", () => {
	it("returns Loading while the RPC is initial", () => {
		const state = StationsState.fromResult(AsyncResult.initial(true));
		expect(state._tag).toBe("Loading");
	});

	it("returns Empty when the user has no stations", () => {
		const result = AsyncResult.success<readonly ApiStationSummary[]>([]);
		expect(StationsState.fromResult(result)).toEqual({ _tag: "Empty" });
	});

	it("returns Ready with all stations when populated", () => {
		const stations = [sampleStation("a"), sampleStation("b")] as const;
		const result = AsyncResult.success<readonly ApiStationSummary[]>(stations);
		expect(StationsState.fromResult(result)).toEqual({
			_tag: "Ready",
			stations,
		});
	});

	it("returns LoadError for typed public RPC failures", () => {
		const error = {
			_tag: "Unauthorized" as const,
			reason: "no credentials",
		};
		const result = AsyncResult.failure<
			readonly ApiStationSummary[],
			typeof error
		>(Cause.fail(error));
		expect(StationsState.fromResult(result)).toEqual({
			_tag: "LoadError",
			error,
		});
	});

	it("returns Defect for non-error failures", () => {
		const defect = new Error("transport boom");
		const result = AsyncResult.failure<readonly ApiStationSummary[], never>(
			Cause.die(defect),
		);
		const state = StationsState.fromResult(result);
		expect(state._tag).toBe("Defect");
		if (state._tag === "Defect") {
			expect(state.defect).toBe(defect);
		}
	});
});
