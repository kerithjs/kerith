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
  s.start('Sincronizando configuración de Kerith...');

  try {
    // Both JS and TS need sync-preload to configure alias resolution
    await runCommand('npx', ['kerith', 'sync-preload'], options.cwd);

    // Only TS needs sync-tsconfig to configure path mapping
    if (options.ext === 'ts') {
      await runCommand('npx', ['kerith', 'sync-tsconfig'], options.cwd);
    }

    s.stop('Configuración sincronizada exitosamente.');
  } catch (error) {
    s.stop('Configuración completada con advertencias.');
    log.warn(
      'No se pudo sincronizar automáticamente la configuración de Kerith.\\n' +
      'Por favor, ejecuta "npx kerith sync-preload"' +
      (options.ext === 'ts' ? ' y "npx kerith sync-tsconfig"' : '') +
      ' manualmente dentro de la carpeta del proyecto.'
    );
  }
}
