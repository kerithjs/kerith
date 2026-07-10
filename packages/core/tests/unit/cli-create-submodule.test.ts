import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSubModuleCommand } from '../../src/cli/commands/create-submodule.js';

describe('CLI: create-submodule', () => {
  let _mockConsoleLog: any;

  // We create a fake parent module dir so the command can resolve it.
  const testBase = path.resolve(process.cwd(), 'tests', '.tmp', 'create-submodule-test');
  const fakeModuleName = 'payments';
  const fakeModuleDir = path.join(testBase, 'src', fakeModuleName);
  const subModulesDir = path.join(fakeModuleDir, 'submodules');

  beforeEach(() => {
    _mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Clean slate
    if (fs.existsSync(testBase)) {
      fs.rmSync(testBase, { recursive: true, force: true });
    }

    // Pre-create the fake parent module so path resolution succeeds.
    fs.mkdirSync(fakeModuleDir, { recursive: true });

    // The command detects the language by checking tsconfig.json presence.
    // Force .ts by writing a tsconfig in the fake project root.
    fs.writeFileSync(path.join(testBase, 'tsconfig.json'), '{}', 'utf-8');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(testBase)) {
      fs.rmSync(testBase, { recursive: true, force: true });
    }
  });

  const runCommand = async (args: string[]) => {
    const cmd = createSubModuleCommand();
    // Commander resolves the module path from process.cwd(), so we override it
    // temporarily to point at our fake project root.
    const originalCwd = process.cwd();
    process.chdir(testBase);
    try {
      await cmd.parseAsync(['node', 'cli', ...args]);
    } finally {
      process.chdir(originalCwd);
    }
  };

  // ─── file presence ──────────────────────────────────────────────────────────

  it('creates index.ts and service file inside submodules/<name>/', async () => {
    await runCommand(['cart', '--module', fakeModuleName]);

    const subDir = path.join(subModulesDir, 'cart');
    expect(fs.existsSync(path.join(subDir, 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(subDir, 'cart.service.ts'))).toBe(true);
  });

  it('--routes also generates a routes file', async () => {
    await runCommand(['cart', '--module', fakeModuleName, '--routes']);

    const subDir = path.join(subModulesDir, 'cart');
    expect(fs.existsSync(path.join(subDir, 'cart.routes.ts'))).toBe(true);
  });

  it('does NOT generate routes file without --routes flag', async () => {
    await runCommand(['cart', '--module', fakeModuleName]);

    const subDir = path.join(subModulesDir, 'cart');
    expect(fs.existsSync(path.join(subDir, 'cart.routes.ts'))).toBe(false);
  });

  // ─── index.ts content snapshot ──────────────────────────────────────────────

  /**
   * This test is the primary guard against SubModuleOptions drift.
   * If SubModuleOptions ever gains or loses fields that should appear in the
   * generated index, this snapshot will fail and force an intentional update.
   *
   * Valid generated content:
   *   import { SubModule } from '@kerith/core'
   *   SubModule('cart')
   *
   * Invalid (the old broken template):
   *   SubModule('cart', { module: 'payments', exports: [] })
   *   — `module` and `exports` are NOT part of SubModuleOptions.
   */
  it('index.ts contains SubModule(name) with no extra options — no module/exports fields', async () => {
    await runCommand(['cart', '--module', fakeModuleName]);

    const indexPath = path.join(subModulesDir, 'cart', 'index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');

    // Must import SubModule from @kerith/core
    expect(content).toMatch(/import\s+\{\s*SubModule\s*\}\s+from\s+['"]@kerith\/core['"]/);

    // Must call SubModule with the submodule name
    expect(content).toMatch(/SubModule\(['"]cart['"]\)/);

    // Must NOT pass excess properties that don't exist in SubModuleOptions
    expect(content).not.toMatch(/module\s*:/);
    expect(content).not.toMatch(/exports\s*:/);
  });

  it('index.ts snapshot matches expected output exactly', async () => {
    await runCommand(['cart', '--module', fakeModuleName]);

    const indexPath = path.join(subModulesDir, 'cart', 'index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toMatchInlineSnapshot(`
      "import { SubModule } from '@kerith/core'

      SubModule('cart')
      "
    `);
  });

  // ─── language flags ──────────────────────────────────────────────────────────

  it('--js forces .js extension', async () => {
    await runCommand(['cart', '--module', fakeModuleName, '--js']);

    const subDir = path.join(subModulesDir, 'cart');
    expect(fs.existsSync(path.join(subDir, 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(subDir, 'index.ts'))).toBe(false);
  });

  it('--ts forces .ts extension', async () => {
    await runCommand(['cart', '--module', fakeModuleName, '--ts']);

    const subDir = path.join(subModulesDir, 'cart');
    expect(fs.existsSync(path.join(subDir, 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(subDir, 'index.js'))).toBe(false);
  });

  // ─── validation ─────────────────────────────────────────────────────────────

  it('throws when submodule name contains uppercase or spaces', async () => {
    await expect(
      runCommand(['Invalid Name', '--module', fakeModuleName]),
    ).rejects.toThrow(/Invalid submodule name/i);
  });

  it('throws when parent module directory does not exist', async () => {
    await expect(
      runCommand(['cart', '--module', 'nonexistent']),
    ).rejects.toThrow(/not found/i);
  });

  it('throws when the submodule directory already exists', async () => {
    // Pre-create the target directory
    fs.mkdirSync(path.join(subModulesDir, 'cart'), { recursive: true });

    await expect(
      runCommand(['cart', '--module', fakeModuleName]),
    ).rejects.toThrow(/already exists/i);
  });
});
