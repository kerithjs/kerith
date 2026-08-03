import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { vi } from 'vitest';
import { buildAppTemplate } from '../src/generators/app-template.js';
import { buildCoreTemplate } from '../src/generators/core-template.js';
import * as channelStubs from '../src/generators/channel-stubs.js';

vi.mock('../src/generators/channel-stubs.js', () => {
  return {
    generateChannelStubs: vi.fn(),
  };
});
import { APP_VERSION, IDENTIFIERS_VERSION } from '../src/versions.js';

describe('app-template', () => {
  it('adds @kerith/app and @kerith/identifiers to the patched package.json', () => {
    const baseFiles = {
      'package.json': JSON.stringify({
        name: 'my-project',
        dependencies: {
          '@kerith/core': '^2.0.0',
        },
      }),
    };

    const result = buildAppTemplate(baseFiles, { projectName: 'my-project', channels: [], redis: false, socketio: false, language: 'ts' });
    const pkg = JSON.parse(result['package.json']);

    expect(pkg.dependencies['@kerith/app']).toBe(`^${APP_VERSION}`);
    expect(pkg.dependencies['@kerith/identifiers']).toBe(`^${IDENTIFIERS_VERSION}`);
    expect(pkg.dependencies['@kerith/core']).toBe('^2.0.0'); // preserves existing
  });

  it('adds optional dependencies if requested (redis, socketio)', () => {
    const baseFiles = {
      'package.json': JSON.stringify({ name: 'my-project' }),
    };

    const result = buildAppTemplate(baseFiles, { projectName: 'my-project', channels: [], redis: true, socketio: true, language: 'ts' });
    const pkg = JSON.parse(result['package.json']);

    expect(pkg.dependencies['ioredis']).toBeDefined();
    expect(pkg.dependencies['socket.io']).toBeDefined();
  });

  it('adds bullmq when worker channel is selected', () => {
    const baseFiles = { 'package.json': JSON.stringify({ name: 'my-project' }) };
    const result = buildAppTemplate(baseFiles, {
      projectName: 'my-project', channels: ['worker'], redis: false, socketio: false, language: 'ts',
    });
    const pkg = JSON.parse(result['package.json']);
    expect(pkg.dependencies['bullmq']).toBe('^5.0.0');
    expect(pkg.dependencies['node-cron']).toBeUndefined();
  });

  it('adds node-cron when cron channel is selected', () => {
    const baseFiles = { 'package.json': JSON.stringify({ name: 'my-project' }) };
    const result = buildAppTemplate(baseFiles, {
      projectName: 'my-project', channels: ['cron'], redis: false, socketio: false, language: 'ts',
    });
    const pkg = JSON.parse(result['package.json']);
    expect(pkg.dependencies['node-cron']).toBe('^3.0.0');
    expect(pkg.dependencies['bullmq']).toBeUndefined();
  });

  it('adds both bullmq and node-cron when both channels are selected', () => {
    const baseFiles = { 'package.json': JSON.stringify({ name: 'my-project' }) };
    const result = buildAppTemplate(baseFiles, {
      projectName: 'my-project', channels: ['cron', 'worker'], redis: false, socketio: false, language: 'ts',
    });
    const pkg = JSON.parse(result['package.json']);
    expect(pkg.dependencies['bullmq']).toBe('^5.0.0');
    expect(pkg.dependencies['node-cron']).toBe('^3.0.0');
  });

  it('does NOT add bullmq/node-cron when neither channel is selected', () => {
    const baseFiles = { 'package.json': JSON.stringify({ name: 'my-project' }) };
    const result = buildAppTemplate(baseFiles, {
      projectName: 'my-project', channels: ['alias'], redis: false, socketio: false, language: 'ts',
    });
    const pkg = JSON.parse(result['package.json']);
    expect(pkg.dependencies['bullmq']).toBeUndefined();
    expect(pkg.dependencies['node-cron']).toBeUndefined();
  });



  it('does NOT rewrite or drop scripts/devDependencies from core', () => {
    const baseFiles = {
      'package.json': JSON.stringify({
        name: 'my-project',
        scripts: {
          dev: 'kerith dev',
        },
        devDependencies: {
          typescript: '^5.0.0',
        },
      }),
    };

    const result = buildAppTemplate(baseFiles, { projectName: 'my-project', channels: [], redis: false, socketio: false, language: 'ts' });
    const pkg = JSON.parse(result['package.json']);

    expect(pkg.scripts.dev).toBe('kerith dev');
    expect(pkg.devDependencies.typescript).toBe('^5.0.0');
  });

  it('replaces @kerith/core with @kerith/app in server.ts and keeps it parseable', () => {
    const baseFiles = {
      'src/server.ts': `import express from 'express'
import { createApp, KerithError } from '@kerith/core'

const app = express()
console.log("I am a comment about @kerith/core")
`,
    };

    const result = buildAppTemplate(baseFiles, { projectName: 'my-project', channels: [], redis: false, socketio: false, language: 'ts' });
    const content = result['src/server.ts'];

    // 1. the import was updated
    expect(content).toContain(`from '@kerith/app'`);
    expect(content).not.toContain(`from '@kerith/core'`);
    
    // 2. the comment was NOT modified
    expect(content).toContain(`@kerith/core"`);

    // 3. parseable as valid TypeScript
    const sourceFile = ts.createSourceFile('server.ts', content, ts.ScriptTarget.Latest, true);
    // TypeScript parses regardless of errors, but parseDiagnostics is populated if it's completely malformed
    const diagnostics = (sourceFile as any).parseDiagnostics;
    if (diagnostics && diagnostics.length > 0) {
      throw new Error('Parsed file has syntax errors');
    }
  });

  it('replaces @kerith/core with @kerith/app in kerith.config.ts (ESM) and keeps it parseable', () => {
    const baseFiles = {
      'kerith.config.ts': `import { defineConfig } from '@kerith/core'

export default defineConfig({
  origin: 'src',
  prefix: "",
})`,
    };

    const result = buildAppTemplate(baseFiles, { projectName: 'my-project', channels: [], redis: false, socketio: false, language: 'ts' });
    const content = result['kerith.config.ts'];

    expect(content).toContain(`from '@kerith/app'`);
    expect(content).not.toContain(`from '@kerith/core'`);

    const sourceFile = ts.createSourceFile('kerith.config.ts', content, ts.ScriptTarget.Latest, true);
    const diagnostics = (sourceFile as any).parseDiagnostics;
    if (diagnostics && diagnostics.length > 0) {
      throw new Error('Parsed kerith.config.ts has syntax errors');
    }
  });

  it('replaces @kerith/core with @kerith/app in kerith.config.js (JSDoc) and keeps it parseable', () => {
    const baseFiles = {
      'kerith.config.js': `/** @type {import('@kerith/core').KerithConfig} */
export default {
  origin: 'src',
  prefix: "",
}`,
    };

    const result = buildAppTemplate(baseFiles, { projectName: 'my-project', channels: [], redis: false, socketio: false, language: 'ts' });
    const content = result['kerith.config.js'];

    expect(content).toContain(`import('@kerith/app')`);
    expect(content).not.toContain(`import('@kerith/core')`);

    const sourceFile = ts.createSourceFile('kerith.config.js', content, ts.ScriptTarget.Latest, true);
    const diagnostics = (sourceFile as any).parseDiagnostics;
    if (diagnostics && diagnostics.length > 0) {
      throw new Error('Parsed kerith.config.js has syntax errors');
    }
  });

  it('merges channel stubs when channels are requested', () => {
    vi.spyOn(channelStubs, 'generateChannelStubs').mockReturnValue({
      'src/channels/test-stub.ts': 'export const stub = true;'
    });

    const result = buildAppTemplate({}, { 
      projectName: 'test-app', 
      channels: ['alias'], 
      redis: false, 
      socketio: false,
      language: 'ts',
    });

    expect(channelStubs.generateChannelStubs).toHaveBeenCalledWith({
      projectName: 'test-app',
      channels: ['alias'],
      redis: false,
      socketio: false,
      language: 'ts',
    });

    expect(result['src/channels/test-stub.ts']).toBe('export const stub = true;');
  });

  it('snapshot: patched output matches fixture/app-project', () => {
    // Generate base core project first
    const coreFiles = buildCoreTemplate({
      projectName: 'my-test-project',
      language: 'ts',
      port: 3000,
      routePrefix: '',
      yes: true,
      outDir: '/fake/dir',
    });

    // Patch it with app template
    const result = buildAppTemplate(coreFiles, {
      projectName: 'my-test-project',
      channels: ['alias', 'middleware', 'cron', 'worker', 'gateway'],
      redis: true,
      socketio: true,
      language: 'ts',
    });

    // Sanitize non-deterministic fields from the shadow files
    for (const [filePath, content] of Object.entries(result)) {
      if (filePath.endsWith('.kerith')) {
        const parsed = JSON.parse(content);
        parsed.id = 'MOCKED-UUID';
        parsed.createdAt = 'MOCKED-DATE';
        result[filePath] = JSON.stringify(parsed, null, 2);
      }
    }

    expect(result).toMatchSnapshot();
  });
});
