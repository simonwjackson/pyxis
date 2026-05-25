import {
	type CanonicalParityValue,
	type ContractParityOptions,
	canonicalizeContractPayload,
} from "../../src/api/contracts/parity.test-support.js";

export type RpcParityOptions = ContractParityOptions;

export function canonicalizeLegacyTrpcOutput(
	value: unknown,
	options?: RpcParityOptions,
): CanonicalParityValue {
	return canonicalizeContractPayload(value, options);
}

export function canonicalizeEffectRpcOutput(
	value: unknown,
	options?: RpcParityOptions,
): CanonicalParityValue {
	return canonicalizeContractPayload(value, options);
}

export function canonicalizeRpcParityPair(
	input: {
		readonly legacy: unknown;
		readonly effect: unknown;
	},
	options?: RpcParityOptions,
): {
	readonly legacy: CanonicalParityValue;
	readonly effect: CanonicalParityValue;
} {
	return {
		legacy: canonicalizeLegacyTrpcOutput(input.legacy, options),
		effect: canonicalizeEffectRpcOutput(input.effect, options),
	};
}
