import type { Command } from 'commander';
import { showConfig } from './show.js';
import { showConfigPath } from './path.js';
import { initConfig } from './init.js';
import type { GlobalOptions } from '../../index.js';

export function registerConfigCommands(program: Command): void {
  const config = program
    .command('config')
    .description('Configuration management commands');

  config
    .command('init')
    .description('Initialize configuration file')
    .option('--force', 'Overwrite existing config')
    .option('--path <path>', 'Custom path for new config file')
    .action(async (options) => {
      const globalOpts = program.opts<GlobalOptions>();
      await initConfig({
        force: options.force,
        path: options.path || globalOpts.config,
      });
    });

  config
    .command('show')
    .description('Show current configuration')
    .option('--reveal-secrets', 'Show passwords (masked by default)')
    .action(async (options) => {
      const globalOpts = program.opts<GlobalOptions>();
      await showConfig(
        { revealSecrets: options.revealSecrets },
        globalOpts.config
      );
    });

  config
    .command('path')
    .description('Show config file path')
    .action(async () => {
      const globalOpts = program.opts<GlobalOptions>();
      await showConfigPath(globalOpts.config);
    });
}

export { showConfig, showConfigPath, initConfig };
export type { ShowOptions } from './show.js';
export type { InitOptions } from './init.js';
