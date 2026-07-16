import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline';
import { cleanCommand } from '../../src/cli/commands/clean.js';

vi.mock('node:readline', () => {
  return {
    default: {
      createInterface: () => ({
        question: (q: string, cb: (ans: string) => void) => cb('y'),
        close: () => {}
      })
    },
    createInterface: () => ({
      question: (q: string, cb: (ans: string) => void) => cb('y'),
      close: () => {}
    })
  };
});

describe('CLI: clean --shadow-files', () => {
  let _mockConsoleLog: any;
  let _mockConsoleWarn: any;
  const testBase = path.resolve(process.cwd(), 'tests', '.tmp', 'cli-clean-test');

  beforeEach(() => {
    _mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    _mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Clean slate
    if (fs.existsSync(testBase)) {
      fs.rmSync(testBase, { recursive: true, force: true });
    }
    fs.mkdirSync(testBase, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(testBase)) {
      fs.rmSync(testBase, { recursive: true, force: true });
    }
  });

  const runCommand = async (cwd: string, args: string[]) => {
    const cmd = cleanCommand();
    const originalCwd = process.cwd();
    process.chdir(cwd);
    try {
      await cmd.parseAsync(['node', 'cli', ...args]);
    } finally {
      process.chdir(originalCwd);
    }
  };

  it('finds and cleans shadow files in a project using origin (v2.0.0+)', async () => {
    // Setup a fake v2 domain structure
    const domainDir = path.join(testBase, 'src', 'billing', 'invoices');
    fs.mkdirSync(domainDir, { recursive: true });
    
    // Create config pointing to origin
    fs.writeFileSync(path.join(testBase, 'kerith.config.ts'), `
      export default { origin: 'src' };
    `);

    // Create a shadow file
    const shadowFile = path.join(domainDir, '.kerith');
    fs.writeFileSync(shadowFile, '{}', 'utf-8');

    expect(fs.existsSync(shadowFile)).toBe(true);

    await runCommand(testBase, ['--shadow-files']);

    // Should have deleted the shadow file
    expect(fs.existsSync(shadowFile)).toBe(false);
    expect(_mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Deleted 1 .kerith identity file(s)'));
  });

  it('falls back to modules correctly for v1 legacy projects (backward compatibility)', async () => {
    // Setup a fake v1 modules structure
    const modulesDir = path.join(testBase, 'src', 'modules', 'payments');
    fs.mkdirSync(modulesDir, { recursive: true });
    
    // Create config pointing to legacy modules
    fs.writeFileSync(path.join(testBase, 'kerith.config.ts'), `
      export default { modules: 'src/modules/*' };
    `);

    // Create a shadow file
    const shadowFile = path.join(modulesDir, '.kerith');
    fs.writeFileSync(shadowFile, '{}', 'utf-8');

    expect(fs.existsSync(shadowFile)).toBe(true);

    await runCommand(testBase, ['--shadow-files']);

    // Should have deleted the shadow file
    expect(fs.existsSync(shadowFile)).toBe(false);
    expect(_mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Deleted 1 .kerith identity file(s)'));
  });

});
