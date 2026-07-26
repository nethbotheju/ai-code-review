import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import * as core from '@actions/core';
import { PI_PACKAGE } from './constants';

/** Directory where pi is installed. Cacheable by consumers across runs. */
export function installDir(version: string): string {
  return path.join(os.homedir(), '.cache', 'ai-code-review-pi', version);
}

/** Absolute path to the bundled CLI entry inside the install dir. */
export function cliEntryPath(version: string): string {
  return path.join(installDir(version), 'node_modules', PI_PACKAGE, 'dist', 'cli.js');
}

/**
 * Ensure pi is installed for the given version. Idempotent: skips if the CLI
 * entry already exists (so consumers can cache `~/.cache/ai-code-review-pi`).
 * Returns the absolute path to the bundled CLI entry point.
 */
export async function ensurePiInstalled(version: string): Promise<string> {
  const entry = cliEntryPath(version);
  if (fs.existsSync(entry)) {
    core.info(`pi ${version} found at ${installDir(version)} (cached).`);
    return entry;
  }

  const dir = installDir(version);
  fs.mkdirSync(dir, { recursive: true });
  core.info(`Installing ${PI_PACKAGE}@${version} into ${dir} ...`);

  await runNpm(
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', `${PI_PACKAGE}@${version}`],
    dir,
  );

  if (!fs.existsSync(entry)) {
    throw new Error(`npm reported success but the pi CLI entry was not found at ${entry}.`);
  }
  core.info('pi installed.');
  return entry;
}

/** Run an npm command in `cwd`. Version is validated upstream; npm resolves via PATH on the Linux runner. */
export function runNpm(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`npm ${args.join(' ')} exited with code ${code}`));
      else resolve();
    });
  });
}
