import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const cliPath = path.resolve(__dirname, '../../src/cli/index.ts');
const fixturesDir = path.resolve(__dirname, '../fixtures');

function runKerithCheck(fixtureName: string, args: string = '') {
  const cwd = path.join(fixturesDir, fixtureName);
  try {
    const output = execSync(`npx tsx ${cliPath} check ${args}`, { cwd, encoding: 'utf-8', stdio: 'pipe' });
    return { exitCode: 0, output };
  } catch (error: any) {
    return { exitCode: error.status, output: error.stdout + (error.stderr || '') };
  }
}

describe('CLI Integration: kerith check', () => {
  it('kerith check in v2-hierarchy-app -> exit 0, grouped output', () => {
    const { exitCode, output } = runKerithCheck('v2-hierarchy-app');
    
    expect(exitCode).toBe(0);
    expect(output).toContain('exit 0 — no violations found');
    
    expect(output).toContain('billing');
    expect(output).toContain('workspace');
    
    expect(output).toContain('Modules');
    expect(output).toContain('billing/payments');
    expect(output).toContain('billing/invoices');
    expect(output).toContain('workspace/members');
    
    expect(output).toContain('SubModules');
    expect(output).toContain('billing/payments/trial');
    
    // Summary
    expect(output).toContain('0 domain violations, 0 module violations, 0 submodule violations');
  });

  it('kerith check in v2-violations-app -> exit 1, detects violations', () => {
    const { exitCode, output } = runKerithCheck('v2-violations-app', '--strict');
    
    expect(exitCode).toBe(1);
    expect(output).toContain('exit 1 — violations found');
    
    // Check for domain boundary violation
    expect(output).toMatch(/Domain boundary violation/i);
    expect(output).toContain('members.service.ts');
    expect(output).toContain('@billing/payments');
    
    // Check for relative boundary violation
    expect(output).toContain('RELATIVE_BOUNDARY_VIOLATION');
    expect(output).toContain('payments.service.ts');
    expect(output).toContain('../../invoices/invoices.service');
    
    // Summary
    expect(output).toContain('2 domain violations');
  });

  it('kerith check in v1-compat-app -> exit 0, flat v1.x output', () => {
    const { exitCode, output } = runKerithCheck('v1-compat-app');
    
    expect(exitCode).toBe(0);
    expect(output).toContain('exit 0 — no violations found');
    
    // Ensure v2 sections don't appear
    expect(output).not.toContain('Domains');
    expect(output).not.toContain('SubModules');
    
    // Contains just flat Modules without the header if there are no domains (or maybe it just prints the modules directly)
    expect(output).toContain('auth');
    expect(output).toContain('users');
  });
});
