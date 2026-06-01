/**
 * @module Config
 * Application configuration with layered resolution: schema defaults → YAML file → environment variables.
 * Configuration file is located at XDG_CONFIG_HOME/pyxis/config.yaml.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Schema, SchemaGetter } from "effect";
import envPaths from "env-paths";
import { parse as parseYaml } from "yaml";

const withDefault = <S extends Schema.Top>(schema: S, value: S["Encoded"]) =>
  schema.pipe(Schema.withDecodingDefault(Effect.succeed(value)));

const optionalNullableString = Schema.Union([
  Schema.String,
  Schema.Null,
  Schema.Undefined,
]).pipe(
  Schema.decodeTo(Schema.UndefinedOr(Schema.String), {
    decode: SchemaGetter.transform((value) => value ?? undefined),
    encode: SchemaGetter.transform((value) => value ?? undefined),
  }),
);

const optionalString = Schema.optionalKey(optionalNullableString);
const portNumber = Schema.Finite.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(65535),
);
const positiveNumber = Schema.Finite.check(Schema.isGreaterThan(0));
const positiveInteger = Schema.Finite.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
);

const ServerSchema = Schema.Struct({
  port: withDefault(portNumber, 8765),
  hostname: withDefault(Schema.String, "localhost"),
});

const WebSchema = Schema.Struct({
  port: withDefault(portNumber, 5678),
  allowedHosts: withDefault(Schema.Array(Schema.String), []),
});

const PandoraSourceSchema = Schema.Struct({
  username: optionalString,
});

const MusicBrainzSourceSchema = Schema.Struct({
  enabled: withDefault(Schema.Boolean, true),
});

const DiscogsSourceSchema = Schema.Struct({
  enabled: withDefault(Schema.Boolean, true),
  token: optionalString,
});

const DeezerSourceSchema = Schema.Struct({
  enabled: withDefault(Schema.Boolean, true),
});

const BandcampSourceSchema = Schema.Struct({
  enabled: withDefault(Schema.Boolean, true),
});

const SoundCloudSourceSchema = Schema.Struct({
  enabled: withDefault(Schema.Boolean, true),
  clientId: optionalString,
});

const SoulseekSourceSchema = Schema.Struct({
  enabled: withDefault(Schema.Boolean, false),
  username: optionalString,
  maxConcurrentDownloads: withDefault(positiveInteger, 2),
});

const SourcesSchema = Schema.Struct({
  pandora: withDefault(PandoraSourceSchema, {}),
  musicbrainz: withDefault(MusicBrainzSourceSchema, {}),
  discogs: withDefault(DiscogsSourceSchema, {}),
  deezer: withDefault(DeezerSourceSchema, {}),
  bandcamp: withDefault(BandcampSourceSchema, {}),
  soundcloud: withDefault(SoundCloudSourceSchema, {}),
  soulseek: withDefault(SoulseekSourceSchema, {}),
});

const UpgradeStorageSchema = Schema.Struct({
  maxCapacityMB: Schema.optionalKey(positiveNumber),
  ttlDays: Schema.optionalKey(positiveNumber),
});

const UpgradeSchema = Schema.Struct({
  enabled: withDefault(Schema.Boolean, false),
  radioLookahead: withDefault(positiveInteger, 3),
  retrySchedule: withDefault(Schema.Array(positiveInteger), [1, 3, 7, 30]),
  storage: withDefault(UpgradeStorageSchema, {}),
});

const LogSchema = Schema.Struct({
  level: withDefault(
    Schema.Literals(["trace", "debug", "info", "warn", "error", "fatal"]),
    "info",
  ),
});

const AndroidBridgeSchema = Schema.Struct({
  enabled: withDefault(Schema.Boolean, false),
  token: optionalString,
});

/**
 * Effect Schema for the complete application configuration.
 * Validates and provides defaults for server, web, sources, upgrade, Android bridge, and log settings.
 */
export const ConfigSchema = Schema.Struct({
  server: withDefault(ServerSchema, {}),
  web: withDefault(WebSchema, {}),
  sources: withDefault(SourcesSchema, {}),
  upgrade: withDefault(UpgradeSchema, {}),
  log: withDefault(LogSchema, {}),
  androidBridge: withDefault(AndroidBridgeSchema, {}),
});

export const decodeConfig = Schema.decodeUnknownSync(ConfigSchema);

/**
 * Fully resolved application configuration type.
 * Derived from ConfigSchema with all defaults applied.
 */
export type AppConfig = Schema.Schema.Type<typeof ConfigSchema>;

const paths = envPaths("pyxis", { suffix: "" });
const DEFAULT_CONFIG_PATH = join(paths.config, "config.yaml");

function loadYaml(filePath: string): unknown {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf-8");
  const parsed: unknown = parseYaml(content);
  return parsed ?? {};
}

function applyEnvOverrides(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result = structuredClone(config);

  const serverPort = process.env.PYXIS_SERVER_PORT;
  if (serverPort) {
    if (!result.server || typeof result.server !== "object") {
      result.server = {};
    }
    (result.server as Record<string, unknown>).port = Number.parseInt(
      serverPort,
      10,
    );
  }

  const serverHostname = process.env.PYXIS_SERVER_HOSTNAME;
  if (serverHostname) {
    if (!result.server || typeof result.server !== "object") {
      result.server = {};
    }
    (result.server as Record<string, unknown>).hostname = serverHostname;
  }

  const webPort = process.env.PYXIS_WEB_PORT;
  if (webPort) {
    if (!result.web || typeof result.web !== "object") {
      result.web = {};
    }
    (result.web as Record<string, unknown>).port = Number.parseInt(webPort, 10);
  }

  const logLevel = process.env.PYXIS_LOG_LEVEL;
  if (logLevel) {
    if (!result.log || typeof result.log !== "object") {
      result.log = {};
    }
    (result.log as Record<string, unknown>).level = logLevel;
  }

  const androidBridgeEnabled = process.env.PYXIS_ANDROID_BRIDGE_ENABLED;
  if (androidBridgeEnabled) {
    if (!result.androidBridge || typeof result.androidBridge !== "object") {
      result.androidBridge = {};
    }
    (result.androidBridge as Record<string, unknown>).enabled =
      androidBridgeEnabled === "1" ||
      androidBridgeEnabled.toLowerCase() === "true";
  }

  const androidBridgeToken = process.env.PYXIS_ANDROID_BRIDGE_TOKEN;
  if (androidBridgeToken) {
    if (!result.androidBridge || typeof result.androidBridge !== "object") {
      result.androidBridge = {};
    }
    (result.androidBridge as Record<string, unknown>).token =
      androidBridgeToken;
  }

  const discogsToken = process.env.PYXIS_DISCOGS_TOKEN;
  if (discogsToken) {
    if (!result.sources || typeof result.sources !== "object") {
      result.sources = {};
    }
    const sources = result.sources as Record<string, unknown>;
    if (!sources.discogs || typeof sources.discogs !== "object") {
      sources.discogs = {};
    }
    (sources.discogs as Record<string, unknown>).token = discogsToken;
  }

  return result;
}

/**
 * Resolves the complete application configuration with layered precedence.
 * Resolution order: schema defaults → YAML file → environment variables.
 *
 * @param configPath - Optional path to config YAML file. Defaults to ~/.config/pyxis/config.yaml
 * @returns Fully resolved and validated configuration
 *
 * @example
 * ```ts
 * const config = resolveConfig();
 * const log = createLogger("config");
 * log.info({ port: config.server.port }, "resolved server port");
 *
 * // With custom config file
 * const config = resolveConfig("/path/to/config.yaml");
 * ```
 */
export function resolveConfig(configPath?: string): AppConfig {
  const yamlPath = configPath ?? DEFAULT_CONFIG_PATH;
  const raw = loadYaml(yamlPath);
  const withEnv = applyEnvOverrides(raw as Record<string, unknown>);
  return decodeConfig(withEnv);
}

/**
 * Retrieves the Pandora password from PYXIS_PANDORA_PASSWORD environment variable.
 * Passwords are never stored in config files or database for security.
 *
 * @returns The Pandora password if set, undefined otherwise
 */
export function getPandoraPassword(): string | undefined {
  return process.env.PYXIS_PANDORA_PASSWORD;
}

export function getSoulseekPassword(): string | undefined {
  return process.env.PYXIS_SOULSEEK_PASSWORD;
}
