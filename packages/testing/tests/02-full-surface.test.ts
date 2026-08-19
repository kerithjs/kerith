import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runFixture, stopFixture, readManifest, readRegistrySnapshot, readDomainRegistrySnapshot } from '../src/index.js';
import type { FixtureHandle, RegistrySnapshot, Manifest } from '../src/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runEndpointAssertions(handle: FixtureHandle, manifest: Manifest): Promise<void> {
  for (const endpoint of manifest.endpoints || []) {
    const res = await handle.http.request(endpoint.path, { method: endpoint.method });
    expect(
      res.status,
      `${endpoint.method} ${endpoint.path} — expected status ${endpoint.expectedStatus}, got ${res.status}`,
    ).toBe(endpoint.expectedStatus);

    if (endpoint.expectedBody !== null) {
      const body = await res.json();
      expect(
        body,
        `${endpoint.method} ${endpoint.path} — unexpected body`,
      ).toEqual(endpoint.expectedBody);
    }
  }
}

function normalizeSnapshot(snapshot: RegistrySnapshot, type: 'global' | 'domain'): any {
  // Deep clone to avoid mutating the original
  const clone = JSON.parse(JSON.stringify(snapshot));

  // Strip root-level volatile fields that change every boot.
  delete clone.lastCheck;

  // Normalize absolute paths to be platform-agnostic
  const walk = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key in obj) {
      if (key === 'path' && typeof obj[key] === 'string') {
        obj[key] = obj[key].replace(/\\/g, '/').replace(/^.*\/packages\/testing\/fixtures\//, '<root>/packages/testing/fixtures/');
      } else if (typeof obj[key] === 'object') {
        walk(obj[key]);
      }
    }
  };
  walk(clone);

  // Strip volatile fields from the flat records array.
  if (Array.isArray(clone.records)) {
    for (const record of clone.records) {
      delete record.lastSeen;
      if (type === 'domain') {
        delete record.createdAt;
      }
    }
  }

  // Also strip from the raw modules dict (same data, different shape).
  if (clone.modules && typeof clone.modules === 'object') {
    for (const record of Object.values(clone.modules) as any[]) {
      delete record.lastSeen;
      if (type === 'domain') {
        delete record.createdAt;
      }
    }
  }

  return clone;
}

function assertIdsAndTimestamps(boot1: RegistrySnapshot, boot2: RegistrySnapshot, type: 'global' | 'domain') {
  const ids = new Set<string>();

  expect(boot1.records.length).toBe(boot2.records.length);

  for (let i = 0; i < boot1.records.length; i++) {
    const r1 = boot1.records[i];
    const r2 = boot2.records[i];

    // Assert ID format (SubModules don't have IDs in DomainRegistry, they might have type instead, but wait, the typings: DomainSubModuleRecord has no id)
    if (r1.id) {
      expect(ids.has(r1.id)).toBe(false);
      ids.add(r1.id);
      
      if (r1.id.startsWith('dom_')) {
        expect(r1.id).toMatch(/^dom_[0-9a-f]{8}$/);
      } else if (r1.id.startsWith('mod_')) {
        expect(r1.id).toMatch(/^mod_[0-9a-f]{8}$/);
      } else {
        throw new Error(`Invalid ID prefix: ${r1.id}`);
      }
    }

    // Status must be active
    expect(r1.status).toBe('active');
    expect(r2.status).toBe('active');

    // Hash should be identical
    if (r1.hash) {
      expect(r1.hash).toBe(r2.hash);
    }

    // createdAt should be identical (only for global registry, domain registry rebuilds records on each boot)
    if (r1.createdAt && type === 'global') {
      expect(r1.createdAt).toBe(r2.createdAt);
    }

    // lastSeen should be present and boot2 >= boot1
    if (r1.lastSeen && r2.lastSeen) {
      const d1 = new Date(r1.lastSeen).getTime();
      const d2 = new Date(r2.lastSeen).getTime();
      expect(d1).not.toBeNaN();
      expect(d2).not.toBeNaN();
      expect(d2).toBeGreaterThanOrEqual(d1);
    }
  }
}

// ---------------------------------------------------------------------------
// 02-full-surface
// ---------------------------------------------------------------------------

describe('02-full-surface', () => {
  let handle1: FixtureHandle;
  let handle2: FixtureHandle;
  let globalBoot1: RegistrySnapshot;
  let globalBoot2: RegistrySnapshot;
  let domainBoot1: RegistrySnapshot;
  let domainBoot2: RegistrySnapshot;

  const fixtureDir = resolve(__dirname, '../fixtures/02-full-surface-core');
  const baselineGlobalPath = resolve(fixtureDir, 'baseline-global.json');
  const baselineDomainPath = resolve(fixtureDir, 'baseline-domain.json');

  beforeAll(async () => {
    // Boot 1
    handle1 = await runFixture(fixtureDir);
    globalBoot1 = readRegistrySnapshot(fixtureDir);
    domainBoot1 = readDomainRegistrySnapshot(fixtureDir, 'ecommerce');
    
    // Write baseline if it doesn't exist
    if (!existsSync(baselineGlobalPath)) {
      writeFileSync(baselineGlobalPath, JSON.stringify(globalBoot1, null, 2));
    }
    if (!existsSync(baselineDomainPath)) {
      writeFileSync(baselineDomainPath, JSON.stringify(domainBoot1, null, 2));
    }

    await stopFixture(handle1.child);

    // Boot 2
    handle2 = await runFixture(fixtureDir);
    globalBoot2 = readRegistrySnapshot(fixtureDir);
    domainBoot2 = readDomainRegistrySnapshot(fixtureDir, 'ecommerce');
  });

  afterAll(async () => {
    if (handle1?.child?.exitCode === null) await stopFixture(handle1.child);
    if (handle2?.child?.exitCode === null) await stopFixture(handle2.child);
  });

  it('endpoints respond exactly as declared in manifest, proving routing and injections', async () => {
    const manifest = readManifest(fixtureDir);
    // Assert on the second boot just to prove it works after a restart
    await runEndpointAssertions(handle2, manifest);
  });

  it('NITS global identifiers remain stable between boots', () => {
    assertIdsAndTimestamps(globalBoot1, globalBoot2, 'global');
    
    const normBoot1 = normalizeSnapshot(globalBoot1, 'global');
    const normBoot2 = normalizeSnapshot(globalBoot2, 'global');
    expect(normBoot1).toEqual(normBoot2);
  });

  it('NITS domain identifiers remain stable between boots', () => {
    assertIdsAndTimestamps(domainBoot1, domainBoot2, 'domain');
    
    const normBoot1 = normalizeSnapshot(domainBoot1, 'domain');
    const normBoot2 = normalizeSnapshot(domainBoot2, 'domain');
    expect(normBoot1).toEqual(normBoot2);
  });

  it('Matches the committed baseline snapshot', () => {
    const baselineGlobal = JSON.parse(readFileSync(baselineGlobalPath, 'utf8'));
    const baselineDomain = JSON.parse(readFileSync(baselineDomainPath, 'utf8'));

    const normBoot1Global = normalizeSnapshot(globalBoot1, 'global');
    const normBaselineGlobal = normalizeSnapshot(baselineGlobal, 'global');
    expect(normBoot1Global).toEqual(normBaselineGlobal);

    const normBoot1Domain = normalizeSnapshot(domainBoot1, 'domain');
    const normBaselineDomain = normalizeSnapshot(baselineDomain, 'domain');
    expect(normBoot1Domain).toEqual(normBaselineDomain);
  });
});

describe('02-full-surface-app (infrastructure composition)', () => {
  let handle: FixtureHandle;
  const fixtureDir = resolve(__dirname, '../fixtures/02-full-surface-app');

  beforeAll(async () => {
    handle = await runFixture(fixtureDir);
  });

  afterAll(async () => {
    if (handle?.child?.exitCode === null) {
      await stopFixture(handle.child);
    }
  });

  it('endpoints respond exactly as declared in manifest, proving full Config→Client→Store→Provider composition', async () => {
    const manifest = readManifest(fixtureDir);
    await runEndpointAssertions(handle, manifest);
  });
});
