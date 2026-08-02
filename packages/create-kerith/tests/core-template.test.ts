import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCoreTemplate } from '../src/generators/core-template.js';
import * as cli from '@kerith/core/cli';

vi.mock('@kerith/core/cli', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kerith/core/cli')>();
  return {
    ...actual,
    validateDirectoryGuard: vi.fn(),
    // We keep generateProjectStructure real to test the snapshot
  };
});

describe('core-template', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to generateProjectStructure (validateDirectoryGuard is NOT called here — it lives in writeProject)', () => {
    // We spy on the real function
    const generateSpy = vi.spyOn(cli, 'generateProjectStructure');

    buildCoreTemplate({
      outDir: '/fake/dir',
      projectName: 'my-test-project',
      language: 'ts',
      port: 8080,
      routePrefix: '/api',
      yes: true,
    });

    // The generator must NOT call validateDirectoryGuard — that's writeProject's job.
    expect(cli.validateDirectoryGuard).not.toHaveBeenCalled();

    expect(generateSpy).toHaveBeenCalledWith(
      'my-test-project',
      'ts',
      '8080',
      '/api',
      expect.any(String), // CORE_VERSION
    );
  });

  it('snapshot: output matches expected core project structure', () => {
    const result = buildCoreTemplate({
      outDir: '/fake/dir',
      projectName: 'my-test-project',
      language: 'ts',
      port: 3000,
      routePrefix: '',
      yes: true,
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
