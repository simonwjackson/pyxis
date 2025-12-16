import { Effect, Exit, Cause, Option } from "effect";
import pc from "picocolors";
import type {
	EncryptionError,
	DecryptionError,
	PartnerLoginError,
	UserLoginError,
	ApiCallError,
	ConfigError,
	NotFoundError,
	SessionError,
	PandoraError,
} from "../../types/errors.js";

// Exit codes for CLI
export const EXIT_CODE = {
	SUCCESS: 0,
	GENERAL_ERROR: 1,
	INVALID_ARGUMENTS: 2,
	AUTH_FAILED: 3,
	NETWORK_ERROR: 4,
	CONFIG_ERROR: 5,
	RESOURCE_NOT_FOUND: 6,
	API_ERROR: 7,
} as const;

// Error code mapping for JSON output
const ERROR_CODES = {
	EncryptionError: "ENCRYPTION_ERROR",
	DecryptionError: "DECRYPTION_ERROR",
	PartnerLoginError: "PARTNER_LOGIN_FAILED",
	UserLoginError: "AUTH_INVALID_CREDENTIALS",
	ApiCallError: "API_CALL_FAILED",
	ConfigError: "CONFIG_ERROR",
	NotFoundError: "NOT_FOUND",
	SessionError: "SESSION_ERROR",
} as const;

type ErrorFormatOptions = {
	readonly verbose: boolean;
	readonly json: boolean;
};

type JsonErrorOutput = {
	readonly success: false;
	readonly error: {
		readonly code: string;
		readonly message: string;
		readonly details: string;
		readonly method?: string;
	};
};

export function getExitCode(error: PandoraError): number {
	switch (error._tag) {
		case "EncryptionError":
		case "DecryptionError":
			return EXIT_CODE.GENERAL_ERROR;
		case "PartnerLoginError":
			return EXIT_CODE.NETWORK_ERROR;
		case "UserLoginError":
			return EXIT_CODE.AUTH_FAILED;
		case "ApiCallError":
			return EXIT_CODE.API_ERROR;
		case "ConfigError":
			return EXIT_CODE.CONFIG_ERROR;
		case "NotFoundError":
			return EXIT_CODE.RESOURCE_NOT_FOUND;
		case "SessionError":
			return EXIT_CODE.AUTH_FAILED;
		default: {
			const _exhaustive: never = error;
			return EXIT_CODE.GENERAL_ERROR;
		}
	}
}

function getErrorTitle(error: PandoraError): string {
	switch (error._tag) {
		case "EncryptionError":
			return "Encryption Failed";
		case "DecryptionError":
			return "Decryption Failed";
		case "PartnerLoginError":
			return "Partner Authentication Failed";
		case "UserLoginError":
			return "Authentication Failed";
		case "ApiCallError":
			return "API Call Failed";
		case "ConfigError":
			return "Configuration Error";
		case "NotFoundError":
			return "Resource Not Found";
		case "SessionError":
			return "Session Required";
		default: {
			const _exhaustive: never = error;
			return "Error";
		}
	}
}

function getErrorHints(error: PandoraError): ReadonlyArray<string> {
	switch (error._tag) {
		case "UserLoginError":
			return [
				"Invalid username or password. Please check your credentials.",
				"",
				"If you recently changed your password, update your config:",
				"  $ pandora config init --force",
			];
		case "PartnerLoginError":
			return [
				"Failed to establish connection with Pandora servers.",
				"",
				"This might be a temporary network issue or Pandora service disruption.",
				"Please try again in a few moments.",
			];
		case "ConfigError":
			// Check if this is a credential-related error
			if (
				error.message.toLowerCase().includes("credential") ||
				error.message.toLowerCase().includes("username") ||
				error.message.toLowerCase().includes("password") ||
				error.message.toLowerCase().includes("auth")
			) {
				return [
					"Authentication required. Set credentials via:",
					"",
					"  - Config: ~/.config/pyxis/config.yaml (auth.username, auth.password)",
					"  - Environment: PANDORA_USERNAME, PANDORA_PASSWORD",
					"  - Or run: pyxis auth login",
				];
			}
			return [
				"Your configuration file appears to be missing or invalid.",
				"",
				"Create a new configuration:",
				"  $ pyxis config init",
			];
		case "ApiCallError":
			return [
				"Failed to call Pandora API method: " + error.method,
				"",
				"This might indicate:",
				"  - Network connectivity issues",
				"  - Pandora API changes or maintenance",
				"  - Invalid request parameters",
			];
		case "EncryptionError":
		case "DecryptionError":
			return [
				"Internal cryptographic operation failed.",
				"",
				"This is likely a bug. Please report this issue with:",
				"  - The command you ran",
				"  - Error details (use --verbose flag)",
			];
		case "NotFoundError":
			return [
				"The requested resource could not be found.",
				"",
				"Please verify:",
				"  - The resource ID or name is correct",
				"  - You have access to this resource",
			];
		case "SessionError":
			return [
				"You need to be logged in to perform this action.",
				"",
				"Set credentials via:",
				"  - Config: ~/.config/pyxis/config.yaml (auth.username, auth.password)",
				"  - Environment: PANDORA_USERNAME, PANDORA_PASSWORD",
				"  - Or run: pyxis auth login",
			];
		default: {
			const _exhaustive: never = error;
			return ["An unexpected error occurred."];
		}
	}
}

function hasErrorCause(
	error: PandoraError,
): error is PandoraError & { readonly cause: unknown } {
	return "cause" in error && error.cause !== undefined;
}

function hasMethod(error: PandoraError): error is ApiCallError {
	return error._tag === "ApiCallError";
}

function formatHumanError(
	error: PandoraError,
	options: ErrorFormatOptions,
): string {
	const title = getErrorTitle(error);
	const hints = getErrorHints(error);

	const parts: string[] = [pc.red(pc.bold("Error: " + title)), "", ...hints];

	if (options.verbose) {
		parts.push("");
		parts.push(pc.dim("Debug Information:"));
		parts.push(pc.dim("  Error Type: " + error._tag));
		parts.push(pc.dim("  Message: " + error.message));

		if (hasErrorCause(error)) {
			parts.push(pc.dim("  Cause: " + String(error.cause)));
		}

		if (hasMethod(error)) {
			parts.push(pc.dim("  API Method: " + error.method));
		}
	}

	return parts.join("\n");
}

function formatJsonError(error: PandoraError): string {
	const errorCode = ERROR_CODES[error._tag];
	const title = getErrorTitle(error);

	const result: JsonErrorOutput = {
		success: false,
		error: {
			code: errorCode,
			message: title,
			details: error.message,
			...(hasMethod(error) ? { method: error.method } : {}),
		},
	};

	return JSON.stringify(result, null, 2);
}

export function formatCliError(
	error: PandoraError,
	options: ErrorFormatOptions,
): string {
	if (options.json) {
		return formatJsonError(error);
	}
	return formatHumanError(error, options);
}

function isPandoraError(error: unknown): error is PandoraError {
	return (
		typeof error === "object" &&
		error !== null &&
		"_tag" in error &&
		typeof error._tag === "string" &&
		(error._tag === "EncryptionError" ||
			error._tag === "DecryptionError" ||
			error._tag === "PartnerLoginError" ||
			error._tag === "UserLoginError" ||
			error._tag === "ApiCallError" ||
			error._tag === "ConfigError" ||
			error._tag === "NotFoundError" ||
			error._tag === "SessionError")
	);
}

export function handleEffectError(
	error: unknown,
	options: ErrorFormatOptions = { verbose: false, json: false },
): never {
	if (isPandoraError(error)) {
		const exitCode = getExitCode(error);
		const message = formatCliError(error, options);

		console.error(message);
		process.exit(exitCode);
		// Throw after process.exit to ensure function never returns (for tests where exit is mocked)
		throw error;
	}

	if (options.json) {
		const fallbackError: JsonErrorOutput = {
			success: false,
			error: {
				code: "UNKNOWN_ERROR",
				message: "Unknown Error",
				details: String(error),
			},
		};
		console.error(JSON.stringify(fallbackError, null, 2));
	} else {
		console.error(pc.red(pc.bold("Error: Unknown Error")));
		console.error("");
		console.error(String(error));

		if (options.verbose && error instanceof Error && error.stack) {
			console.error("");
			console.error(pc.dim("Stack trace:"));
			console.error(pc.dim(error.stack));
		}
	}

	process.exit(EXIT_CODE.GENERAL_ERROR);
	// Throw after process.exit to ensure function never returns (for tests where exit is mocked)
	throw error;
}

export async function runEffect<T, E extends PandoraError>(
	effect: Effect.Effect<T, E>,
	options: ErrorFormatOptions = { verbose: false, json: false },
): Promise<T> {
	const exit = await Effect.runPromiseExit(effect);

	return Exit.match(exit, {
		onFailure: (cause) => {
			const failure = Cause.failureOption(cause);

			if (Option.isSome(failure)) {
				handleEffectError(failure.value, options);
			}

			const defect = Cause.dieOption(cause);
			if (Option.isSome(defect)) {
				handleEffectError(defect.value, options);
			}

			handleEffectError(new Error(Cause.pretty(cause)), options);
		},
		onSuccess: (value) => value,
	});
}
