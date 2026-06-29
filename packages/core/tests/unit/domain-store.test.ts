import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { 
  initDomainRegistry, 
  saveDomainRegistry, 
  loadDomainRegistry, 
  ensureDomainRegistry 
} from '../../src/nits/domain-store.js';
import { isValidDomainId } from '../../src/nits/domain-id.js';

describe('Domain Store', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-domain-store-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('initDomainRegistry', () => {
    it('produces an object with valid id and empty modules', () => {
      const registry = initDomainRegistry('Test Domain', 'Test Description');
      expect(isValidDomainId(registry.domain.id)).toBe(true);
      expect(registry.domain.name).toBe('Test Domain');
      expect(registry.domain.description).toBe('Test Description');
      expect(registry.modules).toEqual({});
      expect(registry.submodules).toEqual([]);
    });
  });

  describe('saveDomainRegistry and loadDomainRegistry', () => {
    it('performs a correct round-trip', async () => {
      const registry = initDomainRegistry('Round Trip');
      await saveDomainRegistry(tmpDir, registry);
      
      const loaded = await loadDomainRegistry(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded?.domain.id).toBe(registry.domain.id);
      expect(loaded?.domain.name).toBe('Round Trip');
    });

    it('returns null when file is absent', async () => {
      const loaded = await loadDomainRegistry(tmpDir);
      expect(loaded).toBeNull();
    });

    it('returns null when JSON is corrupted', async () => {
      const registryPath = path.join(tmpDir, '.kerith-register', 'registry.json');
      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      fs.writeFileSync(registryPath, '{ corrupted json');
      
      const loaded = await loadDomainRegistry(tmpDir);
      expect(loaded).toBeNull();
    });

    it('returns null when domain.id is invalid', async () => {
      const registryPath = path.join(tmpDir, '.kerith-register', 'registry.json');
      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      
      const invalidData = {
        version: '1.0.0',
        domain: {
          id: 'invalid_id',
          name: 'Invalid',
          registeredAt: new Date().toISOString()
        },
        modules: {}
      };
      
      fs.writeFileSync(registryPath, JSON.stringify(invalidData));
      
      const loaded = await loadDomainRegistry(tmpDir);
      expect(loaded).toBeNull();
    });

    it('saves registry even when modules is empty', async () => {
      const registry = initDomainRegistry('Empty Modules');
      registry.modules = {}; // Explicitly empty
      
      await saveDomainRegistry(tmpDir, registry);
      
      const loaded = await loadDomainRegistry(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded?.modules).toEqual({});
    });
  });

  describe('ensureDomainRegistry', () => {
    it('does not overwrite an existing valid file (id remains the same)', async () => {
      const initial = await ensureDomainRegistry(tmpDir, 'First Init');
      const initialId = initial.domain.id;
      
      // Call again
      const second = await ensureDomainRegistry(tmpDir, 'Second Init');
      expect(second.domain.id).toBe(initialId);
      expect(second.domain.name).toBe('First Init'); // Name should not change
    });
    
    it('creates a new registry if missing', async () => {
      const created = await ensureDomainRegistry(tmpDir, 'New Init');
      expect(isValidDomainId(created.domain.id)).toBe(true);
      expect(created.domain.name).toBe('New Init');
      
      // Verify it's on disk
      const loaded = await loadDomainRegistry(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded?.domain.id).toBe(created.domain.id);
    });
  });
});
