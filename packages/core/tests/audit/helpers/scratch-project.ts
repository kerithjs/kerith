import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

export function createScratchProject(files: Record<string, string>) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-audit-'));

  // Default files as requested
  const defaultFiles = {
    'package.json': JSON.stringify({ type: 'module', name: 'scratch-project' }, null, 2),
    'billing/orders.ts': `export const name = 'billing/orders';`,
    'shipping/orders.ts': `export const name = 'shipping/orders';`,
    'users/core.ts': `export const name = 'users/core';`,
    'shared/index.ts': `export const shared = true;`,
    'flat-module.ts': `export const flat = true;`,
  };

  const allFiles = { ...defaultFiles, ...files };

  for (const [filePath, content] of Object.entries(allFiles)) {
    const fullPath = path.join(projectDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }

  return projectDir;
}

export function runNode(projectDir: string, entryFile: string, args: string[] = []) {
  return spawnSync(process.execPath, [...args, entryFile], {
    cwd: projectDir,
    encoding: 'utf8',
  });
}
