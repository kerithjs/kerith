import fs from 'node:fs';
import path from 'node:path';

/**
 * Atomically writes JSON to disk: write to a .tmp sibling, then rename.
 * Creates the target directory if it doesn't exist.
 * Shared by nits-store.ts (registry.json) and domain-store.ts (registry.json per domain).
 */
export async function atomicWriteJson(fullPath: string, data: unknown): Promise<void> {
  const tempPath = `${fullPath}.tmp`;
  const dir = path.dirname(fullPath);

  if (!fs.existsSync(dir)) {
    await fs.promises.mkdir(dir, { recursive: true });
  }

  await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.promises.rename(tempPath, fullPath);
}
