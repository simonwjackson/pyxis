import pc from 'picocolors';
import { getConfigPath, getDefaultConfigPath } from '../../config/paths.js';
import { existsSync } from 'node:fs';

export async function showConfigPath(customConfigPath?: string): Promise<void> {
  const configPath = getConfigPath(customConfigPath);
  const defaultPath = getDefaultConfigPath();

  if (configPath) {
    console.log(configPath);
  } else {
    console.log(defaultPath + pc.dim(' (not found)'));
  }
}
