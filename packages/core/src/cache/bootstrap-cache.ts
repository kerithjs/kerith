import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import type { DomainScanEntry, SubModuleScanEntry, ModuleScanEntry } from '../bootstrap/scanner.js';
import type { SharedEntry } from '../types/index.js';

export type CacheStatus = 'pending' | 'ok' | 'failed';

export interface CachedModule extends ModuleScanEntry {
  id: string;           // NITS ID — mod_{hex}
  files: string[];      // paths of all module files
  identifiers: string[];
  aliases: string[];
  cachedSize: number;   // total size in bytes of all module files
}

export interface BootstrapCache {
  version: string;       // installed version
  status: CacheStatus;
  savedAt?: string;      // ISO 8601
  configHash?: string;   // kerith.config.ts hash
  data?: {
    domains: DomainScanEntry[];
    modules: CachedModule[];
    submodules: SubModuleScanEntry[];
    shared: SharedEntry[];
    identifiers: unknown[];
    aliases: unknown[];
  };
  error?: string;        // only if status === 'failed'
}

// Note: using .kerith instead of .nodulus due to the 1.8.2 rebranding
function getCachePaths() {
  const dir = path.join(process.cwd(), '.kerith');
  return {
    dir,
    file: path.join(dir, 'bootstrap-cache.json'),
    tmp: path.join(dir, 'bootstrap-cache.tmp'),
  };
}

export const CacheManager = {
  read(): BootstrapCache | null {
    const { file } = getCachePaths();
    if (!fs.existsSync(file)) {
      return null;
    }

    try {
      const content = fs.readFileSync(file, 'utf-8');
      const cache = JSON.parse(content) as BootstrapCache;
      
      if (!cache.data) {
        return null;
      }
      
      return cache;
    } catch (e) {
      return null;
    }
  },

  pending(): void {
    const { dir, file } = getCachePaths();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write only the pending status
    fs.writeFileSync(file, JSON.stringify({ status: 'pending' }), 'utf-8');
  },

  write(data: NonNullable<BootstrapCache['data']>, version: string, configHash: string): void {
    const { dir, file, tmp } = getCachePaths();
    
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const cache: BootstrapCache = {
        version,
        status: 'ok',
        savedAt: new Date().toISOString(),
        configHash,
        data
      };

      const content = JSON.stringify(cache, null, 2);
      
      fs.writeFileSync(tmp, content, 'utf-8');
      
      try {
        fs.renameSync(tmp, file);
      } catch (e) {
        // Windows fallback in case rename fails
        fs.copyFileSync(tmp, file);
        fs.unlinkSync(tmp);
      }
    } catch (e) {
      // Best effort cache write, do not crash bootstrap
    }
  },

  fail(error: string): void {
    const { file } = getCachePaths();
    try {
      fs.writeFileSync(file, JSON.stringify({ status: 'failed', error }), 'utf-8');
    } catch (e) {
      // Ignore error, the process is already failing
    }
  },

  valid(cache: BootstrapCache, currentVersion: string, currentConfigHash: string): boolean {
    if (cache.status !== 'ok') return false;
    if (cache.version !== currentVersion) return false;
    if (cache.configHash !== currentConfigHash) return false;
    return true;
  },

  invalidate(): void {
    const { file, tmp } = getCachePaths();
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
    }
    if (fs.existsSync(tmp)) {
      fs.rmSync(tmp, { force: true });
    }
  },

  hashConfig(configPath: string): string {
    if (!fs.existsSync(configPath)) {
      return 'no-config';
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  }
};
