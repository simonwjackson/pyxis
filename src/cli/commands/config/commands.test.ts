import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AppConfig } from '../../config/schema.js';

// Create mocks before importing modules
const mockGetConfigPath = mock(() => null as string | null);
const mockGetDefaultConfigPath = mock(() => '/default/path');
const mockLoadConfig = mock(async () => ({} as AppConfig));

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

// Mock the modules before importing the commands
mock.module('../../config/paths.js', () => ({
  getConfigPath: mockGetConfigPath,
  getDefaultConfigPath: mockGetDefaultConfigPath,
}));

mock.module('../../config/loader.js', () => ({
  loadConfig: mockLoadConfig,
  ConfigError,
}));

// Import after mocking
import { initConfig } from './init.js';
import { showConfig } from './show.js';
import { showConfigPath } from './path.js';

describe('config commands', () => {
  const originalEnv: Record<string, string | undefined> = {};
  const originalExit = process.exit;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  let testDir: string;
  let exitCode: number | undefined;
  let consoleOutput: string[] = [];
  let consoleErrors: string[] = [];

  beforeEach(() => {
    // Create temp test directory
    const timestamp = String(Math.floor(Math.random() * 1000000));
    testDir = join(tmpdir(), 'pyxis-test-' + timestamp);
    mkdirSync(testDir, { recursive: true });

    // Mock process.exit
    exitCode = undefined;
    process.exit = mock((code?: string | number | null | undefined) => {
      exitCode = code as number;
      throw new Error('process.exit: ' + String(code));
    }) as never;

    // Mock console
    consoleOutput = [];
    consoleErrors = [];
    console.log = mock((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    console.error = mock((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });

    // Reset mocks
    mockGetConfigPath.mockReset();
    mockGetDefaultConfigPath.mockReset();
    mockLoadConfig.mockReset();

    // Clear env vars
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

    for (const key of envVars) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    // Restore
    process.exit = originalExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    // Restore env
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  describe('config init', () => {
    // Note: These tests use the `path` option to bypass the mocked getDefaultConfigPath
    // since Bun's module mocking can interfere with fs operations in other tests

    it('should create config file at custom path', async () => {
      const configPath = join(testDir, 'config.yml');

      await initConfig({ path: configPath });

      expect(existsSync(configPath)).toBe(true);
      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('Pyxis Configuration');
      expect(content).toContain('auth:');
      expect(consoleOutput.some((line) => line.includes('Success!'))).toBe(true);
    });

    it('should use custom path when provided', async () => {
      const customPath = join(testDir, 'custom.yml');

      await initConfig({ path: customPath });

      expect(existsSync(customPath)).toBe(true);
      const content = readFileSync(customPath, 'utf-8');
      expect(content).toContain('Pyxis Configuration');
    });

    it('should fail when config exists without --force', async () => {
      const configPath = join(testDir, 'existing.yml');
      writeFileSync(configPath, 'existing content');

      try {
        await initConfig({ path: configPath });
      } catch {
        // Expected
      }

      expect(exitCode).toBe(1);
      expect(consoleErrors.some((line) => line.includes('already exists'))).toBe(true);
      expect(consoleErrors.some((line) => line.includes('--force'))).toBe(true);
    });

    it('should overwrite existing config with --force flag', async () => {
      const configPath = join(testDir, 'existing.yml');
      writeFileSync(configPath, 'old content');

      await initConfig({ path: configPath, force: true });

      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain('Pyxis Configuration');
      expect(content).not.toContain('old content');
      expect(exitCode).toBeUndefined();
    });

    it('should create config directory if it does not exist', async () => {
      const configPath = join(testDir, 'new', 'dir', 'config.yml');

      await initConfig({ path: configPath });

      expect(existsSync(configPath)).toBe(true);
      expect(existsSync(join(testDir, 'new', 'dir'))).toBe(true);
    });
  });

  describe('config show', () => {
    it('should display configuration', async () => {
      const mockConfig: AppConfig = {
        auth: { username: 'test@example.com', password: 'secret123' },
        output: { format: 'human', verbose: false, color: true },
        cache: { enabled: true, ttl: 3600 },
        playlist: { quality: 'high' },
        stations: { sort: 'recent' },
      };

      mockGetConfigPath.mockReturnValue('/mock/config.yml');
      mockGetDefaultConfigPath.mockReturnValue('/default/path');
      mockLoadConfig.mockResolvedValue(mockConfig);

      await showConfig({});

      expect(consoleOutput.some((line) => line.includes('Pyxis Configuration'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('test@example.com'))).toBe(true);
    });

    it('should mask password by default', async () => {
      const mockConfig: AppConfig = {
        auth: { username: 'test@example.com', password: 'supersecret' },
        output: { format: 'human', verbose: false, color: true },
        cache: { enabled: true, ttl: 3600 },
        playlist: { quality: 'high' },
        stations: { sort: 'recent' },
      };

      mockGetConfigPath.mockReturnValue('/config.yml');
      mockGetDefaultConfigPath.mockReturnValue('/default');
      mockLoadConfig.mockResolvedValue(mockConfig);

      await showConfig({ revealSecrets: false });

      const allOutput = consoleOutput.join('\n');
      expect(allOutput).not.toContain('supersecret');
      expect(allOutput).toContain('**********');
    });

    it('should reveal password with --reveal-secrets flag', async () => {
      const mockConfig: AppConfig = {
        auth: { username: 'test@example.com', password: 'supersecret' },
        output: { format: 'human', verbose: false, color: true },
        cache: { enabled: true, ttl: 3600 },
        playlist: { quality: 'high' },
        stations: { sort: 'recent' },
      };

      mockGetConfigPath.mockReturnValue('/config.yml');
      mockGetDefaultConfigPath.mockReturnValue('/default');
      mockLoadConfig.mockResolvedValue(mockConfig);

      await showConfig({ revealSecrets: true });

      const allOutput = consoleOutput.join('\n');
      expect(allOutput).toContain('supersecret');
    });

    it('should display environment variable overrides', async () => {
      const mockConfig: AppConfig = {
        output: { format: 'human', verbose: false, color: true },
        cache: { enabled: true, ttl: 3600 },
        playlist: { quality: 'high' },
        stations: { sort: 'recent' },
      };

      process.env.PANDORA_USERNAME = 'env@example.com';
      process.env.PANDORA_PASSWORD = 'envpassword';

      mockGetConfigPath.mockReturnValue('/config.yml');
      mockGetDefaultConfigPath.mockReturnValue('/default');
      mockLoadConfig.mockResolvedValue(mockConfig);

      await showConfig({});

      const allOutput = consoleOutput.join('\n');
      expect(allOutput).toContain('Environment overrides:');
      expect(allOutput).toContain('PANDORA_USERNAME');
      expect(allOutput).toContain('PANDORA_PASSWORD');
    });

    it('should mask environment password by default', async () => {
      const mockConfig: AppConfig = {
        output: { format: 'human', verbose: false, color: true },
        cache: { enabled: true, ttl: 3600 },
        playlist: { quality: 'high' },
        stations: { sort: 'recent' },
      };

      process.env.PANDORA_PASSWORD = 'envpassword';

      mockGetConfigPath.mockReturnValue('/config.yml');
      mockGetDefaultConfigPath.mockReturnValue('/default');
      mockLoadConfig.mockResolvedValue(mockConfig);

      await showConfig({ revealSecrets: false });

      const allOutput = consoleOutput.join('\n');
      expect(allOutput).not.toContain('envpassword');
      expect(allOutput).toContain('(set, hidden)');
    });

    it('should reveal environment password with --reveal-secrets', async () => {
      const mockConfig: AppConfig = {
        output: { format: 'human', verbose: false, color: true },
        cache: { enabled: true, ttl: 3600 },
        playlist: { quality: 'high' },
        stations: { sort: 'recent' },
      };

      process.env.PANDORA_PASSWORD = 'envpassword';

      mockGetConfigPath.mockReturnValue('/config.yml');
      mockGetDefaultConfigPath.mockReturnValue('/default');
      mockLoadConfig.mockResolvedValue(mockConfig);

      await showConfig({ revealSecrets: true });

      const allOutput = consoleOutput.join('\n');
      expect(allOutput).toContain('envpassword');
    });

    it('should show warning when no config file found', async () => {
      const mockConfig: AppConfig = {
        output: { format: 'human', verbose: false, color: true },
        cache: { enabled: true, ttl: 3600 },
        playlist: { quality: 'high' },
        stations: { sort: 'recent' },
      };

      mockGetConfigPath.mockReturnValue(null);
      mockGetDefaultConfigPath.mockReturnValue('/default/config.yml');
      mockLoadConfig.mockResolvedValue(mockConfig);

      await showConfig({});

      const allOutput = consoleOutput.join('\n');
      expect(allOutput).toContain('no config file found');
      expect(allOutput).toContain('/default/config.yml');
    });

    it('should handle config loading errors', async () => {
      mockGetConfigPath.mockReturnValue('/config.yml');
      mockGetDefaultConfigPath.mockReturnValue('/default');
      mockLoadConfig.mockRejectedValue(new ConfigError('Invalid YAML'));

      try {
        await showConfig({});
      } catch (error) {
        // Expected
      }

      expect(exitCode).toBe(1);
      expect(consoleErrors.some((line) => line.includes('Error loading configuration'))).toBe(true);
    });
  });

  describe('config path', () => {
    it('should display config path when file exists', async () => {
      mockGetConfigPath.mockReturnValue('/home/user/.config/pyxis/config.yml');
      mockGetDefaultConfigPath.mockReturnValue('/default');

      await showConfigPath();

      expect(consoleOutput).toContain('/home/user/.config/pyxis/config.yml');
      expect(consoleOutput.join('\n')).not.toContain('(not found)');
    });

    it('should display default path with "(not found)" when file does not exist', async () => {
      mockGetConfigPath.mockReturnValue(null);
      mockGetDefaultConfigPath.mockReturnValue('/home/user/.config/pyxis/config.yml');

      await showConfigPath();

      expect(consoleOutput.some((line) => line.includes('/home/user/.config/pyxis/config.yml'))).toBe(true);
      expect(consoleOutput.some((line) => line.includes('(not found)'))).toBe(true);
    });

    it('should output only the path (for easy piping)', async () => {
      mockGetConfigPath.mockReturnValue('/config/path.yml');
      mockGetDefaultConfigPath.mockReturnValue('/default');

      await showConfigPath();

      expect(consoleOutput.length).toBe(1);
      expect(consoleOutput[0]).toContain('/config/path.yml');
    });
  });

  describe('integration tests', () => {
    it('should handle custom path across all commands', async () => {
      const customPath = join(testDir, 'custom.yml');
      const mockConfig: AppConfig = {
        auth: { username: 'custom@test.com' },
        output: { format: 'human', verbose: false, color: true },
        cache: { enabled: true, ttl: 3600 },
        playlist: { quality: 'high' },
        stations: { sort: 'recent' },
      };

      // Init with custom path
      await initConfig({ path: customPath });
      expect(existsSync(customPath)).toBe(true);

      consoleOutput = [];

      // Show path
      mockGetConfigPath.mockReturnValue(customPath);

      await showConfigPath(customPath);
      expect(consoleOutput).toContain(customPath);

      consoleOutput = [];

      // Show config
      mockLoadConfig.mockResolvedValue(mockConfig);

      await showConfig({}, customPath);
      expect(consoleOutput.some((line) => line.includes('custom@test.com'))).toBe(true);
    });

    it('should handle missing config file gracefully across commands', async () => {
      mockGetConfigPath.mockReturnValue(null);
      mockGetDefaultConfigPath.mockReturnValue('/default/config.yml');

      await showConfigPath();
      expect(consoleOutput.some((line) => line.includes('(not found)'))).toBe(true);

      consoleOutput = [];

      const mockConfig: AppConfig = {
        output: { format: 'human', verbose: false, color: true },
        cache: { enabled: true, ttl: 3600 },
        playlist: { quality: 'high' },
        stations: { sort: 'recent' },
      };

      mockLoadConfig.mockResolvedValue(mockConfig);

      await showConfig({});
      expect(consoleOutput.some((line) => line.includes('no config file found'))).toBe(true);
    });
  });
});
