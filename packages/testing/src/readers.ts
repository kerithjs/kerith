/**
 * readers.ts — File-system readers for fixture artifacts.
 *
 * readManifest()         — loads and types `manifest.json` from a fixture dir.
 * readRegistrySnapshot() — loads and types `.kerith/registry.json`.
 *
 * Both functions throw descriptive errors if the file is missing or malformed
 * so test failures point at the fixture, not at a cryptic JSON parse error.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Manifest, RegistrySnapshot, RegistryRecord } from './types.js';

// ---------------------------------------------------------------------------
// readManifest
// ---------------------------------------------------------------------------

/**
 * Loads `<fixtureDir>/manifest.json` and returns it typed as {@link Manifest}.
 *
 * The manifest is a small JSON file co-located with each fixture's test file.
 * It documents what the fixture is expected to do so tests can read from it
 * instead of hard-coding values.
 *
 * @param fixtureDir - Absolute path to the fixture project directory.
 */
export function readManifest(fixtureDir: string): Manifest {
  const manifestPath = resolve(fixtureDir, 'manifest.json');
  return readJson<Manifest>(manifestPath, 'manifest.json');
}

// ---------------------------------------------------------------------------
// readRegistrySnapshot
// ---------------------------------------------------------------------------

/**
 * Loads `<fixtureDir>/.kerith/registry.json` and returns it typed as
 * {@link RegistrySnapshot}.
 *
 * Used by `03-restart-identity` tests to compare NITS module IDs across two
 * sequential boots and assert that they remain stable.
 *
 * @param fixtureDir - Absolute path to the fixture project directory.
 */
export function readRegistrySnapshot(fixtureDir: string): RegistrySnapshot {
  const snapshotPath = resolve(fixtureDir, '.kerith', 'registry.json');
  const raw = readJson<any>(snapshotPath, '.kerith/registry.json');

  // Normalize: build a flat `records` array from the modules dict.
  // The registry stores modules as { [id]: NitsModuleRecord } — we flatten
  // that into an array so tests can iterate without coupling to the dict shape.
  const modules: Record<string, RegistryRecord> = raw.modules ?? {};
  const records: RegistryRecord[] = Object.values(modules);

  return {
    ...raw,
    modules,
    records,
  } as RegistrySnapshot;
}

// ---------------------------------------------------------------------------
// readDomainRegistrySnapshot
// ---------------------------------------------------------------------------

/**
 * Loads `<fixtureDir>/src/modules/<domainName>/.kerith-register/registry.json`
 * and returns it typed as {@link RegistrySnapshot}.
 * 
 * Used to verify the submodules registered within a specific domain.
 * 
 * @param fixtureDir - Absolute path to the fixture project directory.
 * @param domainName - The name of the domain (folder name).
 */
export function readDomainRegistrySnapshot(fixtureDir: string, domainName: string): RegistrySnapshot {
  const snapshotPath = resolve(fixtureDir, 'src', 'modules', domainName, '.kerith-register', 'registry.json');
  const raw = readJson<any>(snapshotPath, `src/modules/${domainName}/.kerith-register/registry.json`);

  // Domain registry shape: { version, domain, modules: {...}, submodules: [...], lastCheck }
  // We normalize to RegistrySnapshot by flattening `modules` into `records`.
  const modules: Record<string, RegistryRecord> = raw.modules ?? {};
  const records: RegistryRecord[] = Object.values(modules);

  return {
    project: raw.domain?.name ?? domainName,
    version: raw.version ?? '1.0.0',
    lastCheck: raw.lastCheck ?? new Date().toISOString(),
    modules,
    domains: {},
    _note: `Domain registry for ${domainName}`,
    records,
  } as RegistrySnapshot;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readJson<T>(absolutePath: string, label: string): T {
  let raw: string;

  try {
    raw = readFileSync(absolutePath, 'utf8');
  } catch (err) {
    throw new Error(
      `[readJson] Could not read "${label}" at path: ${absolutePath}\n` +
      `Make sure the file exists before calling this helper.\n` +
      `Original error: ${(err as Error).message}`,
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(
      `[readJson] "${label}" at path ${absolutePath} is not valid JSON.\n` +
      `Original error: ${(err as Error).message}`,
    );
  }
}
