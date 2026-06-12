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
const CACHE_DIR = path.join(process.cwd(), '.kerith');
const CACHE_FILE = path.join(CACHE_DIR, 'bootstrap-cache.json');
const CACHE_TMP = path.join(CACHE_DIR, 'bootstrap-cache.tmp');

export const CacheManager = {
  read(): BootstrapCache | null {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }

    try {
      const content = fs.readFileSync(CACHE_FILE, 'utf-8');
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
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    
    // Write only the pending status
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ status: 'pending' }), 'utf-8');
  },

  write(data: NonNullable<BootstrapCache['data']>, version: string, configHash: string): void {
    const cache: BootstrapCache = {
      version,
      status: 'ok',
      savedAt: new Date().toISOString(),
      configHash,
      data
    };

    const content = JSON.stringify(cache, null, 2);
    
    fs.writeFileSync(CACHE_TMP, content, 'utf-8');
    
    try {
      fs.renameSync(CACHE_TMP, CACHE_FILE);
    } catch (e) {
      // Windows fallback in case rename fails
      fs.copyFileSync(CACHE_TMP, CACHE_FILE);
      fs.unlinkSync(CACHE_TMP);
    }
  },

  fail(error: string): void {
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ status: 'failed', error }), 'utf-8');
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
    if (fs.existsSync(CACHE_FILE)) {
      fs.rmSync(CACHE_FILE, { force: true });
    }
    if (fs.existsSync(CACHE_TMP)) {
      fs.rmSync(CACHE_TMP, { force: true });
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
