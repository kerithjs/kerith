import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import {
  aliasStub,
  middlewareStub,
  cronStub,
  workerStub,
  gatewayStub,
  generateChannelStubs,
} from '../src/generators/channel-stubs.js';

function parseAsTs(content: string, filename: string): void {
  const sourceFile = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
  const diagnostics = (sourceFile as any).parseDiagnostics;
  if (diagnostics && diagnostics.length > 0) {
    throw new Error(`Parsed file ${filename} has syntax errors`);
  }
}

describe('channel-stubs', () => {
  it('aliasStub returns a valid TypeScript string', () => {
    const code = aliasStub('test-project');
    expect(code).toContain(`Client('Database', () => ({ connected: true }))`);
    parseAsTs(code, 'alias.ts');
  });

  it('middlewareStub returns a valid TypeScript string (ts)', () => {
    const code = middlewareStub('test-project', 'ts');
    expect(code).toContain(`Middleware('logger'`);
    expect(code).toContain('next as Function');
    parseAsTs(code, 'middleware.ts');
  });

  it('middlewareStub returns a valid JavaScript string (js)', () => {
    const code = middlewareStub('test-project', 'js');
    expect(code).toContain(`Middleware('logger'`);
    expect(code).toContain('next();');
    expect(code).not.toContain('next as Function');
    parseAsTs(code, 'middleware.js');
  });

  it('cronStub returns a valid TypeScript string with 3 positional arguments', () => {
    const code = cronStub('test-project');
    expect(code).toContain(`Cron('daily-cleanup', '0 2 * * *', async () => {`);
    parseAsTs(code, 'cron.ts');
  });

  it('workerStub returns a valid TypeScript string (without redis)', () => {
    const code = workerStub('test-project', false);
    expect(code).toContain(`Worker('process-image', async (job) => {`);
    expect(code).not.toContain('{ concurrency: 5 }');
    parseAsTs(code, 'worker.ts');
  });

  it('workerStub returns a valid TypeScript string (with redis)', () => {
    const code = workerStub('test-project', true);
    expect(code).toContain(`Worker('process-image', async (job) => {`);
    expect(code).toContain(', { concurrency: 5 })');
    parseAsTs(code, 'worker-redis.ts');
  });

  it('gatewayStub returns a valid TypeScript string (without socketio)', () => {
    const code = gatewayStub('test-project', false);
    expect(code).toContain(`Gateway('chat', (socket) => {`);
    expect(code).not.toContain('{ namespace: \'/chat\' }');
    parseAsTs(code, 'gateway.ts');
  });

  it('gatewayStub returns a valid TypeScript string (with socketio)', () => {
    const code = gatewayStub('test-project', true);
    expect(code).toContain(`Gateway('chat', (socket) => {`);
    expect(code).toContain(', { namespace: \'/chat\' })');
    parseAsTs(code, 'gateway-socketio.ts');
  });

  it('generateChannelStubs only includes requested channels with correct extension (ts)', () => {
    const files = generateChannelStubs({
      projectName: 'test',
      language: 'ts',
      channels: ['cron', 'gateway'],
      redis: false,
      socketio: false,
    });

    expect(files['src/channels/cron.ts']).toBeDefined();
    expect(files['src/channels/gateway.ts']).toBeDefined();
    
    // Should NOT include others
    expect(files['src/channels/alias.ts']).toBeUndefined();
    expect(files['src/channels/middleware.ts']).toBeUndefined();
    expect(files['src/channels/worker.ts']).toBeUndefined();
  });

  it('generateChannelStubs only includes requested channels with correct extension (js)', () => {
    const files = generateChannelStubs({
      projectName: 'test',
      language: 'js',
      channels: ['cron', 'gateway'],
      redis: false,
      socketio: false,
    });

    expect(files['src/channels/cron.js']).toBeDefined();
    expect(files['src/channels/gateway.js']).toBeDefined();
    
    // Should NOT include TS files
    expect(files['src/channels/cron.ts']).toBeUndefined();
  });
});
