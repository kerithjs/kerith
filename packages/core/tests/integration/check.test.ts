import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const cliPath = path.resolve(__dirname, '../../src/cli/index.ts');
const fixturesRoot = path.resolve(__dirname, '../fixtures');

function runKerithCheck(fixturePath: string, args: string = '') {
  try {
    const output = execSync(`npx tsx ${cliPath} check ${args}`, { cwd: fixturePath, encoding: 'utf-8', stdio: 'pipe' });
    return { exitCode: 0, output };
  } catch (error: any) {
    return { exitCode: error.status, output: error.stdout + (error.stderr || '') };
  }
}

function createFixture(name: string, files: Record<string, string>) {
  const dir = path.join(fixturesRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return dir;
}

describe('Integration: check.test.ts (Coupling & Regression)', () => {
  const couplingApp = 'temp-coupling-app';
  const circularApp = 'temp-circular-app';
  const boundaryApp = 'temp-boundary-app';
  
  beforeAll(() => {
    fs.rmSync(path.join(fixturesRoot, couplingApp), { recursive: true, force: true });
    fs.rmSync(path.join(fixturesRoot, circularApp), { recursive: true, force: true });
    fs.rmSync(path.join(fixturesRoot, boundaryApp), { recursive: true, force: true });

    createFixture(couplingApp, {
      'package.json': '{"type":"module"}',
      'kerith.config.js': `
        export default {
          modules: 'src/*',
          rules: {
            fanOutThreshold: 2,
            fanInThreshold: 2
          }
        };
      `,
      'src/target/index.ts': 'import { Module } from "@kerith/core"; Module("target");',
      'src/m1/index.ts': 'import { Module } from "@kerith/core"; Module("m1", { imports: ["target"] }); import "@modules/target";',
      'src/m2/index.ts': 'import { Module } from "@kerith/core"; Module("m2", { imports: ["target", "m1", "m3"] }); import "@modules/target"; import "@modules/m1"; import "@modules/m3";',
      'src/m3/index.ts': 'import { Module } from "@kerith/core"; Module("m3", { imports: ["target"] }); import "@modules/target";'
    });
    
    createFixture(circularApp, {
      'package.json': '{"type":"module"}',
      'kerith.config.js': `export default { modules: 'src/*' };`,
      'src/a/index.ts': 'import { Module } from "@kerith/core"; Module("a", { imports: ["b"] }); import "@modules/b";',
      'src/b/index.ts': 'import { Module } from "@kerith/core"; Module("b", { imports: ["a"] }); import "@modules/a";'
    });
    
    createFixture(boundaryApp, {
      'package.json': '{"type":"module"}',
      'kerith.config.js': `export default { modules: 'src/*' };`,
      'src/a/index.ts': 'import { Module } from "@kerith/core"; Module("a", { imports: ["b"] }); import "../b/private.ts";',
      'src/b/index.ts': 'import { Module } from "@kerith/core"; Module("b");',
      'src/b/private.ts': 'export const secret = 1;'
    });
  });

  afterAll(() => {
    fs.rmSync(path.join(fixturesRoot, couplingApp), { recursive: true, force: true });
    fs.rmSync(path.join(fixturesRoot, circularApp), { recursive: true, force: true });
    fs.rmSync(path.join(fixturesRoot, boundaryApp), { recursive: true, force: true });
  });

  it('verifies that output includes warnings of coupling with prefix ⚠ and exit code is 0 without --strict', () => {
    const dir = path.join(fixturesRoot, couplingApp);
    const { exitCode, output } = runKerithCheck(dir);
    
    // Messages come from violations.ts and are printed as w.message in quality warnings
    expect(output).toContain('High fan-in coupling: "target"');
    expect(output).toContain('High fan-out coupling: "m2"');
    // Exit code must be 0 without --strict (coupling warnings are severity: 'warn')
    // Check that output contains ⚠ warning prefix for coupling warnings
    expect(output).toContain('⚠');
    expect(exitCode).toBe(0);
    expect(output).toContain('exit 0');
    expect(output).not.toContain('exit 1 — violations found');
  });

  it('verifies that with --strict the exit code is 1 due to coupling warnings', () => {
    const dir = path.join(fixturesRoot, couplingApp);
    const { exitCode, output } = runKerithCheck(dir, '--strict');
    
    expect(exitCode).toBe(1);
    expect(output).toContain('exit 1 — violations found');
  });

  it('verifies that RELATIVE_BOUNDARY_VIOLATION still blocks without --strict', () => {
    const dir = path.join(fixturesRoot, boundaryApp);
    const { exitCode, output } = runKerithCheck(dir);
    
    expect(exitCode).toBe(1);
    expect(output).toContain('RELATIVE_BOUNDARY_VIOLATION');
  });

  it('verifies that CIRCULAR_DEPENDENCY does not block without --strict (Phase 0b regression test)', () => {
    const dir = path.join(fixturesRoot, circularApp);
    const { exitCode, output } = runKerithCheck(dir);
    
    expect(exitCode).toBe(0);
    expect(output).toContain('Circular dependency detected');
  });

  it('verifies that CIRCULAR_DEPENDENCY blocks with --strict', () => {
    const dir = path.join(fixturesRoot, circularApp);
    const { exitCode, output } = runKerithCheck(dir, '--strict');
    
    expect(exitCode).toBe(1);
    expect(output).toContain('Circular dependency detected');
  });

  it('verifies that FAN_OUT_HIGH does not block without --strict', () => {
    const dir = path.join(fixturesRoot, couplingApp);
    const { exitCode, output } = runKerithCheck(dir);
    
    expect(exitCode).toBe(0);
    expect(output).toContain('High fan-out coupling: "m2"');
    expect(output).not.toContain('exit 1 — violations found');
  });

  it('verifies that FAN_OUT_HIGH blocks with --strict', () => {
    const dir = path.join(fixturesRoot, couplingApp);
    const { exitCode, output } = runKerithCheck(dir, '--strict');
    
    expect(exitCode).toBe(1);
    expect(output).toContain('High fan-out coupling: "m2"');
    expect(output).toContain('exit 1 — violations found');
  });
});
