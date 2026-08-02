import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { vi } from 'vitest';
import { buildAppTemplate } from '../src/generators/app-template.js';
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

    const result = buildAppTemplate(baseFiles, { projectName: 'my-project', channels: [], redis: false, socketio: false });
    const pkg = JSON.parse(result['package.json']);

    expect(pkg.dependencies['@kerith/app']).toBe(`^${APP_VERSION}`);
    expect(pkg.dependencies['@kerith/identifiers']).toBe(`^${IDENTIFIERS_VERSION}`);
    expect(pkg.dependencies['@kerith/core']).toBe('^2.0.0'); // preserves existing
  });

  it('adds optional dependencies if requested (redis, socketio)', () => {
    const baseFiles = {
      'package.json': JSON.stringify({ name: 'my-project' }),
    };

    const result = buildAppTemplate(baseFiles, { projectName: 'my-project', channels: [], redis: true, socketio: true });
    const pkg = JSON.parse(result['package.json']);

    expect(pkg.dependencies['ioredis']).toBeDefined();
    expect(pkg.dependencies['socket.io']).toBeDefined();
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

    const result = buildAppTemplate(baseFiles, { projectName: 'my-project', channels: [], redis: false, socketio: false });
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

    const result = buildAppTemplate(baseFiles, { projectName: 'my-project', channels: [], redis: false, socketio: false });
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

    const result = buildAppTemplate(baseFiles, { projectName: 'my-project', channels: [], redis: false, socketio: false });
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

    const result = buildAppTemplate(baseFiles, { projectName: 'my-project', channels: [], redis: false, socketio: false });
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
      socketio: false 
    });

    expect(channelStubs.generateChannelStubs).toHaveBeenCalledWith({
      projectName: 'test-app',
      channels: ['alias'],
      redis: false,
      socketio: false,
    });

    expect(result['src/channels/test-stub.ts']).toBe('export const stub = true;');
  });

  it.todo('snapshot: patched output matches fixture/app-project');
});
