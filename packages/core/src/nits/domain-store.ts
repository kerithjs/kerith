// nits/domain-store.ts (nuevo)
import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from './atomic-write.js';
import { generateDomainId, isValidDomainId } from './domain-id.js';
import type { DomainRegistryFile, NitsModuleRecord } from '../types/nits.js';

const DOMAIN_REGISTER_DIR = '.kerith-register';
const DOMAIN_REGISTER_FILE = 'registry.json';
const DOMAIN_REGISTRY_VERSION = '1.0.0';

function getDomainRegistryPath(domainDirPath: string): string {
  return path.join(domainDirPath, DOMAIN_REGISTER_DIR, DOMAIN_REGISTER_FILE);
}

/**
 * Loads a domain's registry.json. Returns null if missing or invalid —
 * same resilience contract as loadNitsRegistry().
 */
export async function loadDomainRegistry(
  domainDirPath: string
): Promise<DomainRegistryFile | null> {
  const fullPath = getDomainRegistryPath(domainDirPath);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  try {
    const content = await fs.promises.readFile(fullPath, 'utf-8');
    const data = JSON.parse(content);

    if (!isValidDomainRegistryFile(data)) {
      console.warn(`[System] Warning: Domain registry at "${fullPath}" has an invalid structure. Ignoring.`);
      return null;
    }

    return data as DomainRegistryFile;
  } catch (err: any) {
    console.warn(`[System] Warning: Failed to load domain registry at "${fullPath}": ${err.message}`);
    return null;
  }
}

/**
 * Saves a domain's registry.json atomically. ALWAYS writes, even with
 * modules: {} — never deletes the file or the folder. The domain.id lives
 * exclusively in this file (no separate shadow file for domains), so an
 * empty `modules` is a valid, expected state — not a signal to clean up.
 *
 * Full replace of `modules` — not an upsert. Mirrors buildUpdatedNitsRegistry(),
 * which already reconstructs the global registry's modules{} from scratch
 * every cycle.
 */
export async function saveDomainRegistry(
  domainDirPath: string,
  registry: DomainRegistryFile
): Promise<void> {
  const fullPath = getDomainRegistryPath(domainDirPath);

  const registryToSave: DomainRegistryFile = {
    ...registry,
    version: DOMAIN_REGISTRY_VERSION,
    lastCheck: new Date().toISOString(),
  };

  await atomicWriteJson(fullPath, registryToSave);
}

/**
 * Builds a fresh DomainRegistryFile in memory. Does not write to disk —
 * call saveDomainRegistry() separately.
 */
export function initDomainRegistry(
  name: string,
  description?: string
): DomainRegistryFile {
  return {
    version: DOMAIN_REGISTRY_VERSION,
    domain: {
      id: generateDomainId(),
      name,
      description,
      registeredAt: new Date().toISOString(),
    },
    modules: {},
    submodules: [],
    lastCheck: new Date().toISOString(),
  };
}

/**
 * Idempotent entry point — mirrors ensureShadowFile() conceptually.
 * If a valid registry.json already exists for this domain, returns it
 * unchanged. If missing or invalid, creates a new one with a fresh id
 * and writes it.
 */
export async function ensureDomainRegistry(
  domainDirPath: string,
  name: string,
  description?: string
): Promise<DomainRegistryFile> {
  const existing = await loadDomainRegistry(domainDirPath);
  if (existing !== null) {
    return existing;
  }

  const fresh = initDomainRegistry(name, description);
  await saveDomainRegistry(domainDirPath, fresh);
  return fresh;
}

/**
 * Validates the basic structure of a DomainRegistryFile.
 * Same rigor as isValidRegistry() in nits-store.ts — reject the whole file
 * on any structural problem, never repair in place.
 */
function isValidDomainRegistryFile(data: any): data is DomainRegistryFile {
  if (
    !data ||
    typeof data !== 'object' ||
    typeof data.version !== 'string' ||
    !data.domain ||
    typeof data.domain.id !== 'string' ||
    !isValidDomainId(data.domain.id) ||
    typeof data.domain.name !== 'string' ||
    !data.domain.name ||
    typeof data.domain.registeredAt !== 'string' ||
    !data.modules ||
    typeof data.modules !== 'object'
  ) {
    return false;
  }

  return true;
}

/**
 * One-time backward migration: for a domain that has modules with `domain`
 * set in the global registry but no .kerith-register/registry.json yet
 * (the system didn't exist when the domain was created), create the domain
 * registry and populate it from what the global already has — BEFORE
 * removing those modules from the global on the next save.
 *
 * Must be called before the partition logic in step-04-nits.ts runs for
 * that domain, so the domain registry write succeeds first. Never purge
 * from the global until this succeeds — inverse order risks data loss.
 */
export async function migrateLegacyDomainModules(
  domainDirPath: string,
  domainName: string,
  legacyModulesFromGlobal: Record<string, NitsModuleRecord>
): Promise<void> {
  const existing = await loadDomainRegistry(domainDirPath);
  if (existing !== null) {
    return; // already migrated, nothing to do
  }

  const fresh = initDomainRegistry(domainName);
  fresh.modules = legacyModulesFromGlobal;

  await saveDomainRegistry(domainDirPath, fresh); // throws on failure — caller must not proceed to purge if this throws
}
