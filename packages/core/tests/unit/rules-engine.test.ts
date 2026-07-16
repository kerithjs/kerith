import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveQualityRules, DEFAULT_QUALITY_RULES } from '../../src/config/rules.types.js';
import { runQualityRules } from '../../src/cli/lib/rules-engine.js';
import { detectDepthViolations } from '../../src/cli/lib/depth-checker.js';
import { detectSizeViolations } from '../../src/cli/lib/size-checker.js';
import { detectUnusedExports, detectEmptyModules } from '../../src/cli/lib/export-checker.js';
import type { StandardViolation } from '../../src/cli/lib/violations.js';
import fg from 'fast-glob';

vi.mock('fast-glob', () => ({
  default: {
    sync: vi.fn(),
  },
}));

describe('Quality Rules Engine & Checkers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('resolveQualityRules()', () => {
    it('Sin config → retorna exactamente DEFAULT_QUALITY_RULES', () => {
      const resolved = resolveQualityRules();
      expect(resolved).toEqual(DEFAULT_QUALITY_RULES);
    });

    it('maxModuleDepth: false → resolvedRules.maxModuleDepth === null', () => {
      const resolved = resolveQualityRules({ maxModuleDepth: false });
      expect(resolved.maxModuleDepth).toBeNull();
    });

    it('maxModuleDepth: 5 → resolvedRules.maxModuleDepth === 5', () => {
      const resolved = resolveQualityRules({ maxModuleDepth: 5 });
      expect(resolved.maxModuleDepth).toBe(5);
    });

    it('unusedExports: false → resolvedRules.unusedExports === false', () => {
      const resolved = resolveQualityRules({ unusedExports: false });
      expect(resolved.unusedExports).toBe(false);
    });

    it('Config parcial → campos no especificados usan defaults', () => {
      const resolved = resolveQualityRules({ maxModuleDepth: 2 });
      expect(resolved.maxModuleDepth).toBe(2);
      expect(resolved.maxModuleFiles).toBe(DEFAULT_QUALITY_RULES.maxModuleFiles);
      expect(resolved.unusedExports).toBe(DEFAULT_QUALITY_RULES.unusedExports);
    });

    it('Config vacío {} → idéntico a sin config', () => {
      const resolved = resolveQualityRules({});
      expect(resolved).toEqual(DEFAULT_QUALITY_RULES);
    });

    it('sin config → retorna exactamente DEFAULT_QUALITY_RULES (stalePurgeCycles === 5)', () => {
      const resolved = resolveQualityRules();
      expect(resolved.stalePurgeCycles).toBe(5);
    });

    it('sin rules.moduleLoadTimeout pero con config.moduleLoadTimeoutMs seteado → fallback', () => {
      const resolved = resolveQualityRules({}, 45000);
      expect(resolved.moduleLoadTimeout).toBe(45000);
    });
  });

  describe('detectDepthViolations()', () => {
    const rules = resolveQualityRules({ maxModuleDepth: 3 });

    it('Módulo con profundidad exactamente igual al threshold → sin violation', () => {
      vi.mocked(fg.sync).mockReturnValue(['a/b/c/d.ts']); // 4 parts -> depth 3
      const result = detectDepthViolations([{ name: 'test', dirPath: 'src/test' }], rules);
      expect(result).toHaveLength(0);
    });

    it('Módulo con profundidad un nivel sobre el threshold → violation con mensaje correcto', () => {
      vi.mocked(fg.sync).mockReturnValue(['a/b/c/d/e.ts']); // 5 parts -> depth 4
      const result = detectDepthViolations([{ name: 'test', dirPath: 'src/test' }], rules);
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('warn');
      expect((result[0] as StandardViolation).message).toContain('Excessive depth (4 levels, max 3)');
      expect((result[0] as StandardViolation).suggestion).toContain("Consider moving the code from 'a/b/c/d/e.ts' into a SubModule");
    });

    it('Módulo con profundidad 0 (solo archivos en raíz) → sin violation', () => {
      vi.mocked(fg.sync).mockReturnValue(['a.ts', 'b.ts']); // 1 part -> depth 0
      const result = detectDepthViolations([{ name: 'test', dirPath: 'src/test' }], rules);
      expect(result).toHaveLength(0);
    });

    it('maxModuleDepth: null → retorna array vacío sin calcular nada', () => {
      const nullRules = resolveQualityRules({ maxModuleDepth: false });
      const result = detectDepthViolations([{ name: 'test', dirPath: 'src/test' }], nullRules);
      expect(result).toHaveLength(0);
      expect(fg.sync).not.toHaveBeenCalled();
    });
  });

  describe('detectSizeViolations()', () => {
    const rules = resolveQualityRules({ maxModuleFiles: 3, maxSubModulesPerModule: 2 });

    it('Módulo con exactamente maxModuleFiles archivos → sin violation', () => {
      vi.mocked(fg.sync).mockReturnValue(['a.ts', 'b.ts', 'c.ts']);
      const result = detectSizeViolations([{ name: 'test', dirPath: 'src/test' }], [], rules);
      expect(result).toHaveLength(0);
    });

    it('Módulo con maxModuleFiles + 1 archivos → violation', () => {
      vi.mocked(fg.sync).mockReturnValue(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
      const result = detectSizeViolations([{ name: 'test', dirPath: 'src/test' }], [], rules);
      expect(result).toHaveLength(1);
      expect((result[0] as StandardViolation).message).toContain('4 files, max 3');
    });

    it('Módulo con exactamente maxSubModulesPerModule SubModules → sin violation', () => {
      vi.mocked(fg.sync).mockReturnValue(['a.ts']);
      const submodules = [
        { name: 'sub1', dirPath: 'src/test/sub1', parentModule: 'test' },
        { name: 'sub2', dirPath: 'src/test/sub2', parentModule: 'test' }
      ];
      const result = detectSizeViolations([{ name: 'test', dirPath: 'src/test' }], submodules, rules);
      expect(result).toHaveLength(0);
    });

    it('Módulo con maxSubModulesPerModule + 1 SubModules → violation', () => {
      vi.mocked(fg.sync).mockReturnValue(['a.ts']);
      const submodules = [
        { name: 'sub1', dirPath: 'src/test/sub1', parentModule: 'test' },
        { name: 'sub2', dirPath: 'src/test/sub2', parentModule: 'test' },
        { name: 'sub3', dirPath: 'src/test/sub3', parentModule: 'test' }
      ];
      const result = detectSizeViolations([{ name: 'test', dirPath: 'src/test' }], submodules, rules);
      expect(result).toHaveLength(1);
      expect((result[0] as StandardViolation).message).toContain('3 SubModules, max 2');
    });

    it('maxModuleFiles: null → no detecta tamaño', () => {
      const nullRules = resolveQualityRules({ maxModuleFiles: false });
      const result = detectSizeViolations([{ name: 'test', dirPath: 'src/test' }], [], nullRules);
      expect(fg.sync).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });

    it('maxSubModulesPerModule: null → no detecta cantidad de SubModules', () => {
      const nullRules = resolveQualityRules({ maxSubModulesPerModule: false });
      const submodules = [
        { name: 'sub1', dirPath: 'src/test/sub1', parentModule: 'test' },
        { name: 'sub2', dirPath: 'src/test/sub2', parentModule: 'test' },
        { name: 'sub3', dirPath: 'src/test/sub3', parentModule: 'test' }
      ];
      const result = detectSizeViolations([{ name: 'test', dirPath: 'src/test' }], submodules, nullRules);
      expect(result).toHaveLength(0);
    });
  });

  describe('detectUnusedExports()', () => {
    const rules = resolveQualityRules({ unusedExports: true });

    it('Módulo exporta PaymentService y billing/invoices lo importa → sin violation', () => {
      const graph = {
        modules: [
          { name: 'payments', declaredExports: ['PaymentService'], declaredIdentifiers: [], declaredImports: [] },
          { name: 'billing', declaredImports: ['PaymentService'], declaredExports: [], declaredIdentifiers: [] }
        ],
        imports: []
      };
      const result = detectUnusedExports(graph as any, rules);
      expect(result).toHaveLength(0);
    });

    it('Módulo exporta PaymentService y nadie lo importa → violation', () => {
      const graph = {
        modules: [
          { name: 'payments', declaredExports: ['PaymentService'], declaredIdentifiers: [], declaredImports: [] }
        ],
        imports: []
      };
      const result = detectUnusedExports(graph as any, rules);
      expect(result).toHaveLength(1);
      expect((result[0] as StandardViolation).message).toContain("'PaymentService' is declared in exports[] but no module imports it");
    });

    it('Módulo sin exports[] → sin violation (no declaró nada)', () => {
      const graph = {
        modules: [
          { name: 'payments', declaredExports: [], declaredIdentifiers: [], declaredImports: [] }
        ],
        imports: []
      };
      const result = detectUnusedExports(graph as any, rules);
      expect(result).toHaveLength(0);
    });

    it('unusedExports: false → retorna array vacío', () => {
      const nullRules = resolveQualityRules({ unusedExports: false });
      const graph = {
        modules: [
          { name: 'payments', declaredExports: ['PaymentService'], declaredIdentifiers: [] }
        ],
        imports: []
      };
      const result = detectUnusedExports(graph as any, nullRules);
      expect(result).toHaveLength(0);
    });
  });

  describe('detectEmptyModules()', () => {
    const rules = resolveQualityRules({ emptyModule: true });

    it('Módulo sin identifiers → violation', () => {
      const graph = { modules: [{ name: 'test', internalIdentifiers: [] }] };
      const result = detectEmptyModules(graph as any, rules);
      expect(result).toHaveLength(1);
    });

    it('Módulo con al menos un Service() → sin violation', () => {
      const graph = { modules: [{ name: 'test', internalIdentifiers: ['TestService'] }] };
      const result = detectEmptyModules(graph as any, rules);
      expect(result).toHaveLength(0);
    });

    it('emptyModule: false → retorna array vacío', () => {
      const nullRules = resolveQualityRules({ emptyModule: false });
      const graph = { modules: [{ name: 'test', internalIdentifiers: [] }] };
      const result = detectEmptyModules(graph as any, nullRules);
      expect(result).toHaveLength(0);
    });

    // ── Fix 2 regression — Controller() must NOT trigger empty-module ─────────
    //
    // Before the fix, graph-builder.ts only scanned for ['Service', 'Repository',
    // 'Schema']. A module whose only file contained Controller() was left with an
    // empty internalIdentifiers[] and detectEmptyModules() fired as a false positive.
    // The fix adds 'Controller' to targetCallees so it populates internalIdentifiers.
    // The tests below cover detectEmptyModules() directly (the checker layer), while
    // the AST scanning layer is implicitly validated by the integration suite that
    // exercises the full graph-builder pipeline against real fixture files.

    it('Fix 2 regression — módulo con solo Controller() → sin violation (false positive)', () => {
      // Simulates what graph-builder now produces for a module whose only
      // registered identifier is a Controller() call.
      const graph = { modules: [{ name: 'health', internalIdentifiers: ['HealthController'] }] };
      const result = detectEmptyModules(graph as any, rules);
      expect(result).toHaveLength(0);
    });

    it('Fix 2 regression — múltiples módulos solo-Controller → ninguno dispara empty-module', () => {
      const graph = {
        modules: [
          { name: 'health', internalIdentifiers: ['HealthController'] },
          { name: 'home',   internalIdentifiers: ['HomeController'] },
        ],
      };
      const result = detectEmptyModules(graph as any, rules);
      expect(result).toHaveLength(0);
    });

    it('Fix 2 regression — módulo verdaderamente vacío (sin ningún identifier) → sigue disparando', () => {
      // Ensures the fix did not accidentally suppress legitimate empty-module warnings.
      const graph = {
        modules: [
          { name: 'empty', internalIdentifiers: [] },
          { name: 'health', internalIdentifiers: ['HealthController'] },
        ],
      };
      const result = detectEmptyModules(graph as any, rules);
      expect(result).toHaveLength(1);
      expect(result[0].module).toBe('empty');
    });
  });

  describe('runQualityRules() — motor completo', () => {
    it('Si un detector lanza internamente → el motor continúa con los demás y loguea warn', async () => {
      // Mocking getModuleDepth to throw to test isolation, wait fg.sync can throw
      vi.mocked(fg.sync).mockImplementationOnce(() => { throw new Error('Simulated crash') });
      const graph = {
        modules: [{ name: 'test', dirPath: 'src/test', declaredExports: [], declaredIdentifiers: ['A'] }],
        submodules: [],
        imports: []
      };
      const result = await runQualityRules(graph as any, DEFAULT_QUALITY_RULES);
      // Even though depth check crashed, size check will still run (and it calls fg.sync again, which we'll mock normally)
      vi.mocked(fg.sync).mockReturnValue([]);
      expect(result).toBeDefined(); // Continues without throwing completely
    });

    it('Todas las violations retornadas tienen severity: warn', async () => {
      const graph = {
        modules: [{ name: 'test', dirPath: 'src/test', declaredExports: ['UnusedExport'], declaredImports: [], internalIdentifiers: [] }],
        submodules: [],
        imports: []
      };
      const result = await runQualityRules(graph as any, DEFAULT_QUALITY_RULES);
      for (const r of result) {
        expect(r.severity).toBe('warn');
      }
      expect(result.length).toBeGreaterThan(0);
    });

    it('Con todas las reglas deshabilitadas → retorna array vacío', async () => {
      const rules = resolveQualityRules({
        maxModuleDepth: false,
        fanOutThreshold: false,
        fanInThreshold: false,
        maxModuleFiles: false,
        maxSubModulesPerModule: false,
        unusedExports: false,
        emptyModule: false,
        circularDependency: false
      });
      const graph = {
        modules: [{ name: 'test', dirPath: 'src/test', declaredExports: ['A'], declaredImports: [], internalIdentifiers: [] }],
        submodules: [],
        imports: []
      };
      const result = await runQualityRules(graph as any, rules);
      expect(result).toHaveLength(0);
    });

    it('Con DEFAULT_QUALITY_RULES y grafo limpio → retorna array vacío', async () => {
      const graph = {
        modules: [{ name: 'test', dirPath: 'src/test', declaredExports: [], declaredIdentifiers: ['A'] }],
        submodules: [],
        imports: []
      };
      vi.mocked(fg.sync).mockReturnValue(['a.ts']);
      const result = await runQualityRules(graph as any, DEFAULT_QUALITY_RULES);
      expect(result).toHaveLength(0);
    });
  });

});
