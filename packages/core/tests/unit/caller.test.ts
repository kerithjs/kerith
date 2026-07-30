import { describe, it, expect } from 'vitest';
import { getModuleCallerInfo, getFileCallerInfo } from '../../src/core/caller.js';
// Import via the public entrypoint — this is what @kerith/identifiers will use
import { getFileCallerInfo as getFileCallerInfoPublic } from '../../src/index.js';

describe('Caller Context Resolution', () => {
  it('should resolve caller file correctly using getFileCallerInfo', () => {
    // Wrap to simulate an identifier call depth
    function MockService(_name: string) {
      return getFileCallerInfo('Service');
    }
    
    function mockUserFile() {
      return MockService('UserService');
    }
    
    const info = mockUserFile();
    expect(info.filePath.replace(/\\/g, '/')).toContain('caller.test.ts');
  });

  it('should resolve caller directory correctly using getModuleCallerInfo', () => {
    function MockModule(_name: string) {
      return getModuleCallerInfo('Module');
    }

    function mockIndexFile() {
      return MockModule('users');
    }

    const info = mockIndexFile();
    expect(info.filePath.replace(/\\/g, '/')).toContain('caller.test.ts');
    expect(info.dirPath.replace(/\\/g, '/')).toContain('unit');
  });
});

describe('getFileCallerInfo — public entrypoint (@kerith/core)', () => {
  it('should be importable from the public entrypoint and resolve filePath correctly', () => {
    // Simulates how @kerith/identifiers will call it:
    //   stack[0] resolveCallerFile (internal)
    //   stack[1] getFileCallerInfo (public helper, imported from @kerith/core)
    //   stack[2] identifier function in @kerith/identifiers (e.g. Guard())
    //   stack[3] user's source file  ← this test file
    function MockGuard(_name: string) {
      return getFileCallerInfoPublic('Guard');
    }

    function mockUserDeclarationSite() {
      return MockGuard('AuthGuard');
    }

    const info = mockUserDeclarationSite();
    expect(typeof info.filePath).toBe('string');
    expect(info.filePath.length).toBeGreaterThan(0);
    expect(info.filePath.replace(/\\/g, '/')).toContain('caller.test.ts');
  });

  it('should return an OS-native absolute path (no file:// prefix)', () => {
    function MockPipe(_name: string) {
      return getFileCallerInfoPublic('Pipe');
    }

    function mockUserDeclarationSite() {
      return MockPipe('ValidationPipe');
    }

    const info = mockUserDeclarationSite();
    expect(info.filePath.startsWith('file://')).toBe(false);
    // On Windows, absolute paths start with a drive letter; on POSIX with /
    expect(info.filePath).toMatch(/^(?:[A-Za-z]:[/\\]|\/)/);
  });
});
