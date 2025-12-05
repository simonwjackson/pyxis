import pc from 'picocolors';
import { getConfigPath, getDefaultConfigPath } from '../../config/paths.js';
import { loadConfig, ConfigError } from '../../config/loader.js';
import type { AppConfig } from '../../config/schema.js';

export type ShowOptions = {
  revealSecrets?: boolean;
};

function maskValue(value: string): string {
  return '*'.repeat(10);
}

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && current !== null && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

function formatValue(value: unknown, shouldMask: boolean = false): string {
  if (value === undefined) {
    return pc.dim('(not set)');
  }

  if (value === null) {
    return pc.dim('null');
  }

  if (typeof value === 'boolean') {
    return value ? pc.green('true') : pc.red('false');
  }

  if (typeof value === 'string') {
    if (shouldMask) {
      return pc.yellow(maskValue(value)) + pc.dim(' (hidden)');
    }
    return pc.cyan(value);
  }

  if (typeof value === 'number') {
    return pc.cyan(String(value));
  }

  return pc.cyan(JSON.stringify(value));
}

function getEnvOverrides(): Map<string, string> {
  const overrides = new Map<string, string>();

  const envVars = [
    'PANDORA_USERNAME',
    'PANDORA_PASSWORD',
    'PYXIS_OUTPUT_FORMAT',
    'PYXIS_OUTPUT_VERBOSE',
    'PYXIS_OUTPUT_COLOR',
    'PYXIS_CACHE_ENABLED',
    'PYXIS_CACHE_TTL',
    'PYXIS_CACHE_PATH',
    'PYXIS_PLAYLIST_QUALITY',
    'PYXIS_PLAYLIST_ADDITIONAL_URL',
    'PYXIS_STATIONS_SORT',
    'PYXIS_STATIONS_LIMIT',
  ];

  for (const varName of envVars) {
    const value = process.env[varName];
    if (value !== undefined) {
      overrides.set(varName, value);
    }
  }

  return overrides;
}

type ConfigPath = {
  path: string;
  mask: boolean;
};

export async function showConfig(
  options: ShowOptions = {},
  customConfigPath?: string
): Promise<void> {
  try {
    const configPath = getConfigPath(customConfigPath);
    const defaultPath = getDefaultConfigPath();

    console.log(pc.bold(pc.blue('\nPyxis Configuration')));
    console.log(pc.bold(pc.blue('='.repeat(19))) + '\n');

    if (configPath) {
      console.log(pc.bold('Source: ') + pc.cyan(configPath));
    } else {
      console.log(
        pc.bold('Source: ') +
          pc.yellow('(no config file found)') +
          '\n' +
          pc.dim('  Default location: ' + defaultPath)
      );
    }

    console.log();

    let config: AppConfig;
    try {
      config = await loadConfig(customConfigPath);
    } catch (error) {
      if (error instanceof ConfigError) {
        console.error(pc.red('Error loading configuration:'));
        console.error(pc.red(error.message));
        process.exit(1);
      }
      throw error;
    }

    const configPaths: ConfigPath[] = [
      { path: 'auth.username', mask: false },
      { path: 'auth.password', mask: true },
      { path: 'output.format', mask: false },
      { path: 'output.verbose', mask: false },
      { path: 'output.color', mask: false },
      { path: 'cache.enabled', mask: false },
      { path: 'cache.ttl', mask: false },
      { path: 'cache.path', mask: false },
      { path: 'playlist.quality', mask: false },
      { path: 'playlist.additionalUrl', mask: false },
      { path: 'stations.sort', mask: false },
      { path: 'stations.limit', mask: false },
    ];

    for (const { path, mask } of configPaths) {
      const value = getNestedValue(config, path);
      const shouldMask = mask && !options.revealSecrets;
      const formattedValue = formatValue(value, shouldMask);

      console.log('  ' + pc.bold(path.padEnd(24)) + ' ' + formattedValue);
    }

    const envOverrides = getEnvOverrides();
    if (envOverrides.size > 0) {
      console.log(pc.bold('\nEnvironment overrides:'));
      for (const [varName, value] of envOverrides) {
        const isSensitive = varName.includes('PASSWORD');
        const displayValue =
          isSensitive && !options.revealSecrets
            ? pc.yellow('(set, hidden)')
            : pc.cyan(value);
        console.log('  ' + pc.bold(varName.padEnd(35)) + ' ' + displayValue);
      }
    }

    if (!options.revealSecrets && getNestedValue(config, 'auth.password')) {
      console.log(
        '\n' +
          pc.dim('Tip: Use ') +
          pc.cyan('--reveal-secrets') +
          pc.dim(' to show masked values')
      );
    }

    console.log();
  } catch (error) {
    console.error(pc.red('Failed to show configuration:'));
    console.error(error);
    process.exit(1);
  }
}
