import pc from 'picocolors';
import { existsSync } from 'node:fs';
import { writeFile, mkdir, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getConfigPath, getDefaultConfigPath } from '../../config/paths.js';

export type InitOptions = {
  force?: boolean;
  path?: string;
};

const EXAMPLE_CONFIG = `# Pandora CLI Configuration
# Default location: ~/.config/pandora/config.yml

# Authentication credentials (can also be set via PANDORA_USERNAME/PANDORA_PASSWORD env vars)
auth:
  username: user@example.com
  # password: your-password-here  # Can be omitted and set via environment variable

# Output preferences
output:
  format: human  # human | json
  verbose: false
  color: true

# Cache settings
cache:
  enabled: true
  ttl: 3600  # seconds
  # path: /custom/cache/path  # Optional custom cache directory

# Playlist settings
playlist:
  quality: high  # high | medium | low
  # additionalUrl: https://example.com/additional  # Optional additional URL

# Station listing preferences
stations:
  sort: recent  # recent | name | created
  # limit: 50  # Optional limit on number of stations
`;

export async function initConfig(options: InitOptions = {}): Promise<void> {
  try {
    const targetPath = options.path || getDefaultConfigPath();
    const configExists = existsSync(targetPath);

    if (configExists && !options.force) {
      console.error(
        pc.red('Error: ') +
          'Config file already exists at ' +
          pc.cyan(targetPath)
      );
      console.error(
        pc.dim('Use ') +
          pc.cyan('--force') +
          pc.dim(' to overwrite existing config')
      );
      process.exit(1);
    }

    const configDir = dirname(targetPath);
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true, mode: 0o700 });
    }

    await writeFile(targetPath, EXAMPLE_CONFIG, { mode: 0o600 });

    console.log(
      pc.green('Success! ') +
        'Config file created at ' +
        pc.cyan(targetPath)
    );
    console.log(
      '\n' +
        pc.dim('Edit the file to configure authentication and preferences.')
    );
  } catch (error) {
    console.error(pc.red('Failed to initialize config:'));
    console.error(error);
    process.exit(1);
  }
}
