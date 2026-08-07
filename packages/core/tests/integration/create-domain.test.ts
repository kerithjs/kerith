import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { isValidDomainId } from '../../src/nits/domain-id.js';

const cliPath = path.resolve(__dirname, '../../src/cli/index.ts');

describe('Integration: kerith create-domain', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-create-domain-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds a domain and creates a valid domain registry', () => {
    // Run create-domain command
    const tsxPath = path.resolve(__dirname, '../../node_modules/.bin/tsx');
    const tsxCmd = process.platform === 'win32' ? `${tsxPath}.cmd` : tsxPath;
    const output = execSync(`"${tsxCmd}" "${cliPath}" create-domain billing`, { 
      cwd: tmpDir, 
      encoding: 'utf-8', 
      stdio: 'pipe' 
    });

    // Check stdout
    expect(output).toContain("Domain 'billing' created");

    // Check if registry.json was created
    const registryPath = path.join(tmpDir, 'src/billing/.kerith-register/registry.json');
    expect(fs.existsSync(registryPath)).toBe(true);

    // Validate registry content
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    expect(registry.version).toBe('1.0.0');
    expect(registry.domain.name).toBe('billing');
    expect(isValidDomainId(registry.domain.id)).toBe(true);
    expect(registry.modules).toEqual({});
  });
});
