import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import envPaths from 'env-paths';

const paths = envPaths('pyxis', { suffix: '' });

/**
 * Resolve home directory in path
 */
function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return join(homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Get the config file path following priority:
 * 1. Custom path via parameter (from CLI --config flag)
 * 2. PYXIS_CONFIG env var
 * 3. XDG: $XDG_CONFIG_HOME/pyxis/config.yml (default: ~/.config/pyxis/config.yml)
 * 4. Legacy: ~/.pyxis/config.yml
 *
 * Returns the first existing config file, or null if none found.
 */
export function getConfigPath(customPath?: string): string | null {
  const candidates: string[] = [];

  // Priority 1: Custom path from CLI flag
  if (customPath) {
    candidates.push(resolve(expandHome(customPath)));
  }

  // Priority 2: Environment variable
  const envConfig = process.env.PYXIS_CONFIG;
  if (envConfig) {
    candidates.push(resolve(expandHome(envConfig)));
  }

  // Priority 3: XDG config path
  candidates.push(join(paths.config, 'config.yml'));

  // Priority 4: Legacy path
  candidates.push(join(homedir(), '.pyxis', 'config.yml'));

  // Return first existing path
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Get the default config path for creating new config files.
 * Always returns the XDG config path (does not check if it exists).
 */
export function getDefaultConfigPath(): string {
  return join(paths.config, 'config.yml');
}

/**
 * Get the cache directory path following priority:
 * 1. PYXIS_CACHE_DIR env var
 * 2. XDG: $XDG_CACHE_HOME/pyxis/ (default: ~/.cache/pyxis/)
 */
export function getCacheDir(): string {
  const envCache = process.env.PYXIS_CACHE_DIR;
  if (envCache) {
    return resolve(expandHome(envCache));
  }

  return paths.cache;
}

type NodeError = {
  code?: string;
};

function isNodeError(error: unknown): error is NodeError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Ensure the cache directory exists, creating it with mode 0o700 if needed.
 * Returns the cache directory path.
 */
export async function ensureCacheDir(): Promise<string> {
  const cacheDir = getCacheDir();

  try {
    await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  } catch (error: unknown) {
    // Ignore EEXIST errors
    if (!isNodeError(error) || error.code !== 'EEXIST') {
      throw error;
    }
  }

  return cacheDir;
}
