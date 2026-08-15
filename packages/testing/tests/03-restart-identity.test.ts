import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { existsSync, renameSync, writeFileSync, readFileSync } from 'node:fs';
import { runFixtureTwice } from '../src/process.js';
import { readDomainRegistrySnapshot } from '../src/readers.js';
import type { RegistrySnapshot } from '../src/types.js';

const fixtureDir = resolve(__dirname, '../fixtures/03-restart-identity');
const commerceIndexFile = resolve(fixtureDir, 'src/modules/commerce/index.ts');
const originalStoreDir = resolve(fixtureDir, 'src/modules/commerce/store');
const movedStoreDir = resolve(fixtureDir, 'src/modules/commerce/store-moved');

// Original commerce index contents
const originalCommerceIndex = `import { Domain } from '@kerith/core';

Domain('commerce', {
  subModules: ['catalog'],
  modules: ['store']
});
`;

const movedCommerceIndex = `import { Domain } from '@kerith/core';

Domain('commerce', {
  subModules: ['catalog'],
  modules: ['store-moved']
});
`;

function getCache(dir: string): any {
  const cachePath = resolve(dir, '.kerith/bootstrap-cache.json');
  return JSON.parse(readFileSync(cachePath, 'utf8'));
}

describe('03-restart-identity', () => {
  let boot1DomainRegistry: RegistrySnapshot;
  let boot2DomainRegistry: RegistrySnapshot;
  let boot1Cache: any;
  let boot2Cache: any;

  beforeAll(async () => {
    // Ensure we start with the original state in case a previous run failed
    if (existsSync(movedStoreDir)) {
      renameSync(movedStoreDir, originalStoreDir);
    }
    writeFileSync(commerceIndexFile, originalCommerceIndex);

    // Run the fixture twice, modifying the file system in between
    await runFixtureTwice(fixtureDir, {}, async () => {
      // Capture state after Boot 1
      boot1DomainRegistry = await readDomainRegistrySnapshot(fixtureDir, 'commerce');
      boot1Cache = getCache(fixtureDir);

      // Perform the move/rename
      renameSync(originalStoreDir, movedStoreDir);
      writeFileSync(commerceIndexFile, movedCommerceIndex);
      
      // We must also update the Module declaration inside store-moved/index.ts
      // because Kerith enforces that Module('name') matches the folder name EXACTLY.
      const storeIndexFile = resolve(movedStoreDir, 'index.ts');
      let storeIndexContent = readFileSync(storeIndexFile, 'utf8');
      storeIndexContent = storeIndexContent.replace("Module('store'", "Module('store-moved'");
      writeFileSync(storeIndexFile, storeIndexContent);
    });

    // Capture state after Boot 2
    boot2DomainRegistry = await readDomainRegistrySnapshot(fixtureDir, 'commerce');
    boot2Cache = getCache(fixtureDir);
  }, 120000); // 2 minutes timeout for two boots


  afterAll(() => {
    // Teardown: Restore the original state to keep git clean
    if (existsSync(movedStoreDir)) {
      // Restore the Module declaration back
      const storeIndexFile = resolve(movedStoreDir, 'index.ts');
      if (existsSync(storeIndexFile)) {
        let storeIndexContent = readFileSync(storeIndexFile, 'utf8');
        storeIndexContent = storeIndexContent.replace("Module('store-moved'", "Module('store'");
        writeFileSync(storeIndexFile, storeIndexContent);
      }
      renameSync(movedStoreDir, originalStoreDir);
    }
    writeFileSync(commerceIndexFile, originalCommerceIndex);
  });

  it('preserves NITS module identity across folder rename', () => {
    // Find store module in Boot 1
    const storeBoot1 = boot1DomainRegistry.records.find(r => r.name === 'store');
    expect(storeBoot1).toBeDefined();
    expect(storeBoot1?.status).toBe('active');
    
    // Find store-moved module in Boot 2
    const storeBoot2 = boot2DomainRegistry.records.find(r => r.name === 'store-moved');
    expect(storeBoot2).toBeDefined();
    
    // The path should be updated
    expect(storeBoot2?.path).toContain('store-moved');
    
    // The identity MUST be preserved
    expect(storeBoot2?.id).toBe(storeBoot1?.id);
    
    // The status should remain active
    expect(storeBoot2?.status).toBe('active');
  });

  it('indicates partial invalidation in bootstrap cache', () => {
    // The health module was completely untouched. Its cached mtime and size should be exactly the same.
    const healthBoot1 = boot1Cache.data.modules.find((m: any) => m.name === 'health');
    const healthBoot2 = boot2Cache.data.modules.find((m: any) => m.name === 'health');

    expect(healthBoot1).toBeDefined();
    expect(healthBoot2).toBeDefined();
    expect(healthBoot2.cachedMtime).toBe(healthBoot1.cachedMtime);
    expect(healthBoot2.cachedSize).toBe(healthBoot1.cachedSize);
    
    // The new store-moved should appear in the boot 2 cache
    const storeBoot2 = boot2Cache.data.modules.find((m: any) => m.name === 'store-moved');
    expect(storeBoot2).toBeDefined();
    expect(storeBoot2.dirPath).toContain('store-moved');
  });
});
