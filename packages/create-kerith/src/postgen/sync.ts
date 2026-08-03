import { spawn } from 'node:child_process';
import { spinner, log } from '@clack/prompts';

export interface SyncOptions {
  cwd: string;
  ext: 'ts' | 'js';
}

/**
 * Runs a command as a child process and returns a promise.
 */
function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

/**
 * Runs kerith sync-preload and optionally kerith sync-tsconfig.
 * Treats failures as warnings rather than fatal errors.
 */
export async function runSync(options: SyncOptions): Promise<void> {
  const s = spinner();
  s.start('Syncing Kerith configuration...');

  try {
    // Both JS and TS need sync-preload to configure alias resolution
    await runCommand('npx', ['kerith', 'sync-preload'], options.cwd);

    // Only TS needs sync-tsconfig to configure path mapping
    if (options.ext === 'ts') {
      await runCommand('npx', ['kerith', 'sync-tsconfig'], options.cwd);
    }

    s.stop('Configuration synced successfully.');
  } catch (error) {
    s.stop('Configuration completed with warnings.');
    log.warn(
      'Could not automatically sync the Kerith configuration.\n' +
      'Please run "npx kerith sync-preload"' +
      (options.ext === 'ts' ? ' and "npx kerith sync-tsconfig"' : '') +
      ' manually inside the project folder.'
    );
  }
}
