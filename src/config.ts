import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";

const ServerSchema = z.object({
	port: z.number().int().min(1).max(65535).default(8765),
	hostname: z.string().default("localhost"),
});

const WebSchema = z.object({
	port: z.number().int().min(1).max(65535).default(5678),
	allowedHosts: z.array(z.string()).default([]),
});

const PandoraSourceSchema = z.object({
	username: z.string().optional(),
});

const MusicBrainzSourceSchema = z.object({
	enabled: z.boolean().default(true),
});

const DiscogsSourceSchema = z.object({
	enabled: z.boolean().default(true),
	token: z.string().optional(),
});

const DeezerSourceSchema = z.object({
	enabled: z.boolean().default(true),
});

const BandcampSourceSchema = z.object({
	enabled: z.boolean().default(true),
});

const SoundCloudSourceSchema = z.object({
	enabled: z.boolean().default(true),
	clientId: z.string().optional(),
});

const SourcesSchema = z.object({
	pandora: PandoraSourceSchema.default(() => PandoraSourceSchema.parse({})),
	musicbrainz: MusicBrainzSourceSchema.default(() => MusicBrainzSourceSchema.parse({})),
	discogs: DiscogsSourceSchema.default(() => DiscogsSourceSchema.parse({})),
	deezer: DeezerSourceSchema.default(() => DeezerSourceSchema.parse({})),
	bandcamp: BandcampSourceSchema.default(() => BandcampSourceSchema.parse({})),
	soundcloud: SoundCloudSourceSchema.default(() => SoundCloudSourceSchema.parse({})),
});

const LogSchema = z.object({
	level: z
		.enum(["trace", "debug", "info", "warn", "error", "fatal"])
		.default("info"),
});

export const ConfigSchema = z.object({
	server: ServerSchema.default(() => ServerSchema.parse({})),
	web: WebSchema.default(() => WebSchema.parse({})),
	sources: SourcesSchema.default(() => SourcesSchema.parse({})),
	log: LogSchema.default(() => LogSchema.parse({})),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

const paths = envPaths("pyxis", { suffix: "" });
const DEFAULT_CONFIG_PATH = join(paths.config, "config.yaml");

function loadYaml(filePath: string): unknown {
	if (!existsSync(filePath)) return {};
	const content = readFileSync(filePath, "utf-8");
	const parsed: unknown = parseYaml(content);
	return parsed ?? {};
}

function applyEnvOverrides(config: Record<string, unknown>): Record<string, unknown> {
	const result = structuredClone(config);

	const serverPort = process.env["PYXIS_SERVER_PORT"];
	if (serverPort) {
		if (!result["server"] || typeof result["server"] !== "object") {
			result["server"] = {};
		}
		(result["server"] as Record<string, unknown>)["port"] = Number.parseInt(serverPort, 10);
	}

	const serverHostname = process.env["PYXIS_SERVER_HOSTNAME"];
	if (serverHostname) {
		if (!result["server"] || typeof result["server"] !== "object") {
			result["server"] = {};
		}
		(result["server"] as Record<string, unknown>)["hostname"] = serverHostname;
	}

	const webPort = process.env["PYXIS_WEB_PORT"];
	if (webPort) {
		if (!result["web"] || typeof result["web"] !== "object") {
			result["web"] = {};
		}
		(result["web"] as Record<string, unknown>)["port"] = Number.parseInt(webPort, 10);
	}

	const logLevel = process.env["PYXIS_LOG_LEVEL"];
	if (logLevel) {
		if (!result["log"] || typeof result["log"] !== "object") {
			result["log"] = {};
		}
		(result["log"] as Record<string, unknown>)["level"] = logLevel;
	}

	const discogsToken = process.env["PYXIS_DISCOGS_TOKEN"];
	if (discogsToken) {
		if (!result["sources"] || typeof result["sources"] !== "object") {
			result["sources"] = {};
		}
		const sources = result["sources"] as Record<string, unknown>;
		if (!sources["discogs"] || typeof sources["discogs"] !== "object") {
			sources["discogs"] = {};
		}
		(sources["discogs"] as Record<string, unknown>)["token"] = discogsToken;
	}

	return result;
}

export function resolveConfig(configPath?: string): AppConfig {
	const yamlPath = configPath ?? DEFAULT_CONFIG_PATH;
	const raw = loadYaml(yamlPath);
	const withEnv = applyEnvOverrides(raw as Record<string, unknown>);
	return ConfigSchema.parse(withEnv);
}

export function getPandoraPassword(): string | undefined {
	return process.env["PYXIS_PANDORA_PASSWORD"];
}
