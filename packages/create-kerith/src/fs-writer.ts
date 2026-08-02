import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { validateDirectoryGuard } from '@kerith/core/cli';

/**
 * fs-writer.ts
 *
 * Single responsibility: given a file map (path → content) and an output
 * directory, write every file to disk and optionally run `npm install`.
 *
 * Nothing in here knows about Kerith templates — it is intentionally
 * dumb so it can be tested in isolation with any arbitrary file map.
 */

export interface WriteOptions {
  /** Absolute path to the target project directory. */
  outDir: string;
  /** Map of relative file paths to their string contents. */
  files: Record<string, string>;
  /** Whether to run `npm install` after writing files. */
  install: boolean;
  /** Whether to skip confirmation if directory exists */
  yes?: boolean;
}

export function writeFiles(targetDir: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(targetDir, relativePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
}

export function runNpmInstall(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['install'], {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install failed with code ${code}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

/**
 * Writes `options.files` to `options.outDir` and, if requested,
 * runs `npm install` inside that directory.
 */
export async function writeProject(options: WriteOptions): Promise<void> {
  // Ensure the target directory exists before validateDirectoryGuard runs:
  // the guard calls readdirSync internally and will throw ENOENT if the
  // directory hasn't been created yet (e.g. first-time scaffold of <projectName>/).
  fs.mkdirSync(options.outDir, { recursive: true });

  validateDirectoryGuard(options.outDir, !!options.yes);
  
  writeFiles(options.outDir, options.files);

  if (options.install) {
    await runNpmInstall(options.outDir);
  }
}
