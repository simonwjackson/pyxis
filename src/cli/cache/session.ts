import { createHash } from "node:crypto";
import { readFile, writeFile, unlink, chmod } from "node:fs/promises";
import * as lockfile from "proper-lockfile";
import type { PandoraSession } from "../../client.js";
import {
	getCacheDir,
	getSessionCachePath,
	getSessionLockPath,
	ensureCacheDir,
} from "./paths.js";

const CACHE_VERSION = 1;
// TTL is informational only - sessions are valid until Pandora API rejects them
const DEFAULT_TTL_SECONDS = 3600;

type CachedSession = {
	readonly version: number;
	readonly session: PandoraSession;
	readonly createdAt: number;
	readonly expiresAt: number;
	readonly checksum: string;
};

type SessionInfo = {
	readonly valid: boolean;
	readonly expiresIn: number | undefined;
	readonly cachePath: string;
};

const calculateChecksum = (session: PandoraSession): string => {
	const data = JSON.stringify({
		syncTime: session.syncTime,
		partnerId: session.partnerId,
		partnerAuthToken: session.partnerAuthToken,
		userId: session.userId,
		userAuthToken: session.userAuthToken,
	});
	return createHash("sha256").update(data).digest("hex");
};

const validateChecksum = (cached: CachedSession): boolean => {
	const computed = calculateChecksum(cached.session);
	return computed === cached.checksum;
};

const parseCachedSession = (data: string): CachedSession | null => {
	try {
		const parsed: unknown = JSON.parse(data);

		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("version" in parsed) ||
			!("session" in parsed) ||
			!("createdAt" in parsed) ||
			!("expiresAt" in parsed) ||
			!("checksum" in parsed)
		) {
			return null;
		}

		const candidate = parsed as Record<string, unknown>;

		if (
			typeof candidate.version !== "number" ||
			typeof candidate.session !== "object" ||
			candidate.session === null ||
			typeof candidate.createdAt !== "number" ||
			typeof candidate.expiresAt !== "number" ||
			typeof candidate.checksum !== "string"
		) {
			return null;
		}

		const session = candidate.session as Record<string, unknown>;

		if (
			typeof session.syncTime !== "number" ||
			typeof session.partnerId !== "string" ||
			typeof session.partnerAuthToken !== "string" ||
			typeof session.userId !== "string" ||
			typeof session.userAuthToken !== "string"
		) {
			return null;
		}

		return {
			version: candidate.version,
			session: {
				syncTime: session.syncTime,
				partnerId: session.partnerId,
				partnerAuthToken: session.partnerAuthToken,
				userId: session.userId,
				userAuthToken: session.userAuthToken,
			},
			createdAt: candidate.createdAt,
			expiresAt: candidate.expiresAt,
			checksum: candidate.checksum,
		};
	} catch {
		return null;
	}
};

export const getSession = async (): Promise<PandoraSession | null> => {
	const cachePath = getSessionCachePath();
	let release: (() => Promise<void>) | null = null;

	try {
		await ensureCacheDir();
		release = await lockfile.lock(cachePath, {
			retries: { retries: 5, minTimeout: 100 },
			realpath: false,
			stale: 10000,
		});

		const data = await readFile(cachePath, "utf-8");
		const cached = parseCachedSession(data);

		if (!cached) {
			return null;
		}

		if (cached.version !== CACHE_VERSION) {
			return null;
		}

		// TTL not enforced - session validity determined by Pandora API response

		if (!validateChecksum(cached)) {
			return null;
		}

		return cached.session;
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return null;
		}
		throw error;
	} finally {
		if (release) {
			await release();
		}
	}
};

export const saveSession = async (
	session: PandoraSession,
	ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> => {
	const cachePath = getSessionCachePath();
	let release: (() => Promise<void>) | null = null;

	try {
		await ensureCacheDir();
		release = await lockfile.lock(cachePath, {
			retries: { retries: 5, minTimeout: 100 },
			realpath: false,
			stale: 10000,
		});

		const now = Date.now();
		const cached: CachedSession = {
			version: CACHE_VERSION,
			session,
			createdAt: now,
			expiresAt: now + ttlSeconds * 1000,
			checksum: calculateChecksum(session),
		};

		const data = JSON.stringify(cached, null, 2);
		await writeFile(cachePath, data, { encoding: "utf-8", mode: 0o600 });
		await chmod(cachePath, 0o600);
	} finally {
		if (release) {
			await release();
		}
	}
};

export const clearSession = async (): Promise<void> => {
	const cachePath = getSessionCachePath();
	let release: (() => Promise<void>) | null = null;

	try {
		await ensureCacheDir();
		release = await lockfile.lock(cachePath, {
			retries: { retries: 5, minTimeout: 100 },
			realpath: false,
			stale: 10000,
		});

		await unlink(cachePath);
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return;
		}
		throw error;
	} finally {
		if (release) {
			await release();
		}
	}
};

export const getSessionInfo = async (): Promise<SessionInfo | null> => {
	const cachePath = getSessionCachePath();
	let release: (() => Promise<void>) | null = null;

	try {
		await ensureCacheDir();
		release = await lockfile.lock(cachePath, {
			retries: { retries: 5, minTimeout: 100 },
			realpath: false,
			stale: 10000,
		});

		const data = await readFile(cachePath, "utf-8");
		const cached = parseCachedSession(data);

		if (!cached) {
			return {
				valid: false,
				expiresIn: undefined,
				cachePath,
			};
		}

		if (cached.version !== CACHE_VERSION) {
			return {
				valid: false,
				expiresIn: undefined,
				cachePath,
			};
		}

		if (!validateChecksum(cached)) {
			return {
				valid: false,
				expiresIn: undefined,
				cachePath,
			};
		}

		// TTL is informational only - valid as long as checksum and version match
		// Session will be invalidated when Pandora API rejects it with auth error
		const expiresIn = Math.floor((cached.expiresAt - Date.now()) / 1000);

		return {
			valid: true,
			expiresIn: expiresIn > 0 ? expiresIn : undefined,
			cachePath,
		};
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return null;
		}
		throw error;
	} finally {
		if (release) {
			await release();
		}
	}
};
