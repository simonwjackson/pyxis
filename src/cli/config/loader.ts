import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { AppConfig, AppConfigSchema, DEFAULT_CONFIG } from './schema.js';

/**
 * Error thrown when configuration loading or validation fails
 */
export class ConfigError extends Error {
  override cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ConfigError';
    this.cause = cause;
  }
}

/**
 * Deep merge two objects, with source overriding target
 */
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue as Partial<typeof targetValue>);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Load configuration from YAML file
 */
async function loadConfigFile(configPath: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = parseYaml(content);

    if (!parsed || typeof parsed !== 'object') {
      throw new ConfigError(`Invalid YAML in config file: ${configPath}`);
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }

    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      // File doesn't exist - this is okay, return empty config
      return {};
    }

    throw new ConfigError(
      `Failed to read config file: ${configPath}`,
      error
    );
  }
}

/**
 * Load configuration from environment variables
 */
function loadEnvConfig(): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  // Auth credentials
  if (process.env.PANDORA_USERNAME || process.env.PANDORA_PASSWORD) {
    config.auth = {
      ...(process.env.PANDORA_USERNAME && { username: process.env.PANDORA_USERNAME }),
      ...(process.env.PANDORA_PASSWORD && { password: process.env.PANDORA_PASSWORD }),
    };
  }

  // Output settings
  const outputFormat = process.env.PANDORA_OUTPUT_FORMAT;
  const outputVerbose = process.env.PANDORA_OUTPUT_VERBOSE;
  const outputColor = process.env.PANDORA_OUTPUT_COLOR;

  if (outputFormat || outputVerbose || outputColor) {
    config.output = {
      ...(outputFormat === 'human' || outputFormat === 'json' ? { format: outputFormat } : {}),
      ...(outputVerbose !== undefined && { verbose: outputVerbose === 'true' }),
      ...(outputColor !== undefined && { color: outputColor !== 'false' }),
    };
  }

  // Cache settings
  const cacheEnabled = process.env.PANDORA_CACHE_ENABLED;
  const cacheTtl = process.env.PANDORA_CACHE_TTL;
  const cachePath = process.env.PANDORA_CACHE_PATH;

  if (cacheEnabled || cacheTtl || cachePath) {
    const ttl = cacheTtl ? parseInt(cacheTtl, 10) : undefined;
    config.cache = {
      ...(cacheEnabled !== undefined && { enabled: cacheEnabled !== 'false' }),
      ...(ttl !== undefined && !isNaN(ttl) && ttl > 0 && { ttl }),
      ...(cachePath && { path: cachePath }),
    };
  }

  // Playlist settings
  const playlistQuality = process.env.PANDORA_PLAYLIST_QUALITY;
  const playlistUrl = process.env.PANDORA_PLAYLIST_ADDITIONAL_URL;

  if (playlistQuality || playlistUrl) {
    config.playlist = {
      ...(playlistQuality === 'high' || playlistQuality === 'medium' || playlistQuality === 'low'
        ? { quality: playlistQuality }
        : {}),
      ...(playlistUrl && { additionalUrl: playlistUrl }),
    };
  }

  // Station settings
  const stationsSort = process.env.PANDORA_STATIONS_SORT;
  const stationsLimit = process.env.PANDORA_STATIONS_LIMIT;

  if (stationsSort || stationsLimit) {
    const limit = stationsLimit ? parseInt(stationsLimit, 10) : undefined;
    config.stations = {
      ...(stationsSort === 'name' || stationsSort === 'created' || stationsSort === 'recent'
        ? { sort: stationsSort }
        : {}),
      ...(limit !== undefined && !isNaN(limit) && limit > 0 && { limit }),
    };
  }

  return config;
}

/**
 * Get default config file path
 */
function getDefaultConfigPath(): string {
  return join(homedir(), '.config', 'pandora', 'config.yaml');
}

/**
 * Load and validate application configuration
 *
 * Priority order (later sources override earlier ones):
 * 1. Default values
 * 2. Config file (YAML)
 * 3. Environment variables
 *
 * @param configPath - Optional path to config file (defaults to ~/.config/pandora/config.yaml)
 * @returns Validated configuration object
 * @throws ConfigError if configuration is invalid
 */
export async function loadConfig(configPath?: string): Promise<AppConfig> {
  try {
    // 1. Start with defaults as unknown to allow deep merging
    let config: unknown = DEFAULT_CONFIG;

    // 2. Merge config file
    const filePath = configPath ?? getDefaultConfigPath();
    const fileConfig = await loadConfigFile(filePath);
    config = deepMerge(config as AppConfig, fileConfig as Partial<AppConfig>);

    // 3. Merge environment variables
    const envConfig = loadEnvConfig();
    config = deepMerge(config as AppConfig, envConfig as Partial<AppConfig>);

    // 4. Validate final configuration
    const validated = AppConfigSchema.parse(config);

    return validated;
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      const messages = error.issues.map((err) => {
        const path = err.path.join('.');
        return `  - ${path}: ${err.message}`;
      });

      throw new ConfigError(
        `Configuration validation failed:\n${messages.join('\n')}`,
        error
      );
    }

    throw new ConfigError('Failed to load configuration', error);
  }
}

/**
 * Load configuration synchronously from environment only
 * (useful when config file access is not needed)
 */
export function loadConfigFromEnv(): AppConfig {
  try {
    const envConfig = loadEnvConfig();
    const config = deepMerge(DEFAULT_CONFIG, envConfig as Partial<AppConfig>);
    return AppConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((err) => {
        const path = err.path.join('.');
        return `  - ${path}: ${err.message}`;
      });

      throw new ConfigError(
        `Environment configuration validation failed:\n${messages.join('\n')}`,
        error
      );
    }

    throw new ConfigError('Failed to load environment configuration', error);
  }
}
