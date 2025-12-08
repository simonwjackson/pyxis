import { Data } from "effect";

export class EncryptionError extends Data.TaggedError("EncryptionError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class DecryptionError extends Data.TaggedError("DecryptionError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class PartnerLoginError extends Data.TaggedError("PartnerLoginError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class UserLoginError extends Data.TaggedError("UserLoginError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class ApiCallError extends Data.TaggedError("ApiCallError")<{
	readonly method: string;
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class ConfigError extends Data.TaggedError("ConfigError")<{
	readonly message: string;
}> {}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
	readonly message: string;
}> {}

export class SessionError extends Data.TaggedError("SessionError")<{
	readonly message: string;
}> {}

export type PandoraError =
	| EncryptionError
	| DecryptionError
	| PartnerLoginError
	| UserLoginError
	| ApiCallError
	| ConfigError
	| NotFoundError
	| SessionError;
