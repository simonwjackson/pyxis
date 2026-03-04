import { networkInterfaces } from "node:os";
import { buildStreamUrl } from "../lib/ids.js";
import { getAppConfig } from "./sourceManager.js";
import { createLogger } from "../../src/logger.js";

const log = createLogger("sonos").child({ component: "external-url" });

function normalizeBaseUrl(url: string): string {
	const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url) ? url : `http://${url}`;
	return withScheme.replace(/\/+$/, "");
}

function detectLanIp(): string | undefined {
	const interfaces = networkInterfaces();
	for (const entries of Object.values(interfaces)) {
		if (!entries) continue;
		for (const address of entries) {
			if (address.family !== "IPv4") continue;
			if (address.internal) continue;
			if (address.address.startsWith("169.254.")) continue;
			return address.address;
		}
	}
	return undefined;
}

export function resolveExternalBaseUrl(): string {
	const config = getAppConfig();
	const serverPort = config?.server.port ?? 8765;
	const serverHostname = config?.server.hostname ?? "localhost";
	const configuredExternalUrl = config?.server.externalUrl;
	if (configuredExternalUrl) {
		return normalizeBaseUrl(configuredExternalUrl);
	}

	if (serverHostname !== "localhost" && serverHostname !== "127.0.0.1") {
		return `http://${serverHostname}:${String(serverPort)}`;
	}

	const lanIp = detectLanIp();
	if (lanIp) {
		return `http://${lanIp}:${String(serverPort)}`;
	}

	log.warn({ hostname: serverHostname, port: serverPort }, "LAN IP not found, falling back to server hostname");
	return `http://${serverHostname}:${String(serverPort)}`;
}

export function buildExternalStreamUrl(
	opaqueTrackId: string,
	nextOpaqueTrackId?: string,
): string {
	const baseUrl = resolveExternalBaseUrl();
	const path = buildStreamUrl(opaqueTrackId, nextOpaqueTrackId);
	return new URL(path, `${baseUrl}/`).toString();
}
