import { Data } from "effect";

export class SonosDiscoveryError extends Data.TaggedError("SonosDiscoveryError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class SonosControlError extends Data.TaggedError("SonosControlError")<{
	readonly message: string;
	readonly action?: string;
	readonly cause?: unknown;
}> {}

export class SonosNotFoundError extends Data.TaggedError("SonosNotFoundError")<{
	readonly message: string;
	readonly uuid: string;
}> {}

export class SonosStreamError extends Data.TaggedError("SonosStreamError")<{
	readonly message: string;
	readonly trackId: string;
	readonly cause?: unknown;
}> {}

export type SonosError =
	| SonosDiscoveryError
	| SonosControlError
	| SonosNotFoundError
	| SonosStreamError;
