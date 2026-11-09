import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../../src/bootstrap/createApp.js';
import { detectViolations, ViolationType } from '../../src/cli/lib/violations.js';
import { buildModuleGraph } from '../../src/cli/lib/graph-builder.js';
import { KerithError } from '../../src/core/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceUrl = pathToFileURL(path.resolve(__dirname, '../../src/index.ts')).href;

const runInTmpApp = async (
  files: Record<string, string>,
  tests: (tmpDir: string, app: any) => Promise<void>,
) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-bootstrap-domain-test-'));

  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const finalContent = content.replace(/\{\{SOURCE\}\}/g, sourceUrl);
    fs.writeFileSync(fullPath, finalContent);
  }

  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }));

  const mockApp = {
    use: vi.fn(),
  };

  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);

  try {
    await tests(tmpDir, mockApp);
  } finally {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

describe('A2.2 — Bootstrap step-07 domain boundary validations (strict mode)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects cross-domain domain-module import (@shipping/inventory from billing/orders)', async () => {
    const app = {
      'kerith.config.js': 'export default { strict: true };',
      'src/billing/index.ts': `
        import { Domain } from '{{SOURCE}}';
        Domain('billing');
      `,
      'src/billing/orders/index.ts': `
        import { Module } from '{{SOURCE}}';
        Module('orders');
      `,
      'src/billing/orders/service.ts': `
        import '@shipping/inventory';
      `,
      'src/shipping/index.ts': `
        import { Domain } from '{{SOURCE}}';
        Domain('shipping');
      `,
      'src/shipping/inventory/index.ts': `
        import { Module } from '{{SOURCE}}';
        Module('inventory');
      `,
    };

    await runInTmpApp(app, async (_, mockApp) => {
      await expect(createApp(mockApp as any)).rejects.toMatchObject({
        code: 'DOMAIN_BOUNDARY_VIOLATION',
      });
    });
  });

  it('rejects cross-domain domain-root import (@shipping from billing/orders)', async () => {
    const app = {
      'kerith.config.js': 'export default { strict: true };',
      'src/billing/index.ts': `
        import { Domain } from '{{SOURCE}}';
        Domain('billing');
      `,
      'src/billing/orders/index.ts': `
        import { Module } from '{{SOURCE}}';
        Module('orders');
      `,
      'src/billing/orders/service.ts': `
        import '@shipping';
      `,
      'src/shipping/index.ts': `
        import { Domain } from '{{SOURCE}}';
        Domain('shipping');
      `,
      'src/shipping/inventory/index.ts': `
        import { Module } from '{{SOURCE}}';
        Module('inventory');
      `,
    };

    await runInTmpApp(app, async (_, mockApp) => {
      await expect(createApp(mockApp as any)).rejects.toMatchObject({
        code: 'DOMAIN_BOUNDARY_VIOLATION',
      });
    });
  });

  it('rejects cross-domain @modules/ alias import when target belongs to another domain', async () => {
    const app = {
      'kerith.config.js': 'export default { strict: true };',
      'src/billing/index.ts': `
        import { Domain } from '{{SOURCE}}';
        Domain('billing');
      `,
      'src/billing/orders/index.ts': `
        import { Module } from '{{SOURCE}}';
        Module('orders');
      `,
      'src/billing/orders/service.ts': `
        import '@modules/inventory';
      `,
      'src/shipping/index.ts': `
        import { Domain } from '{{SOURCE}}';
        Domain('shipping');
      `,
      'src/shipping/inventory/index.ts': `
        import { Module } from '{{SOURCE}}';
        Module('inventory');
      `,
    };

    await runInTmpApp(app, async (_, mockApp) => {
      await expect(createApp(mockApp as any)).rejects.toMatchObject({
        code: 'DOMAIN_BOUNDARY_VIOLATION',
      });
    });
  });

  it('allows same-domain auto-import (@shipping/orders from shipping/orders)', async () => {
    const app = {
      'kerith.config.js': 'export default { strict: true };',
      'src/shipping/index.ts': `
        import { Domain } from '{{SOURCE}}';
        Domain('shipping');
      `,
      'src/shipping/orders/index.ts': `
        import { Module } from '{{SOURCE}}';
        Module('orders');
      `,
      'src/shipping/orders/service.ts': `
        import '@shipping/orders';
      `,
    };

    await runInTmpApp(app, async (_, mockApp) => {
      const kerithApp = await createApp(mockApp as any);
      expect(kerithApp).toBeDefined();
    });
  });

  it('allows same-domain sibling import declared in imports[] (@shipping/inventory from shipping/orders)', async () => {
    const app = {
      'kerith.config.js': 'export default { strict: true };',
      'src/shipping/index.ts': `
        import { Domain } from '{{SOURCE}}';
        Domain('shipping');
      `,
      'src/shipping/orders/index.ts': `
        import { Module } from '{{SOURCE}}';
        Module('orders', { imports: ['inventory'] });
      `,
      'src/shipping/orders/service.ts': `
        import '@shipping/inventory';
      `,
      'src/shipping/inventory/index.ts': `
        import { Module } from '{{SOURCE}}';
        Module('inventory');
      `,
    };

    await runInTmpApp(app, async (_, mockApp) => {
      const kerithApp = await createApp(mockApp as any);
      expect(kerithApp).toBeDefined();
    });
  });

  it('distinguishes homonymous modules between domains: @billing/orders from shipping/orders is cross-domain', async () => {
    const app = {
      'kerith.config.js': 'export default { strict: true };',
      'src/shipping/index.ts': `
        import { Domain } from '{{SOURCE}}';
        Domain('shipping');
      `,
      'src/shipping/orders/index.ts': `
        import { Module } from '{{SOURCE}}';
        Module('orders');
      `,
      'src/shipping/orders/service.ts': `
        import '@billing/orders';
      `,
      'src/billing/index.ts': `
        import { Domain } from '{{SOURCE}}';
        Domain('billing');
      `,
      'src/billing/orders/index.ts': `
        import { Module } from '{{SOURCE}}';
        Module('orders');
      `,
    };

    await runInTmpApp(app, async (_, mockApp) => {
      await expect(createApp(mockApp as any)).rejects.toMatchObject({
        code: 'DOMAIN_BOUNDARY_VIOLATION',
      });
    });
  });

  it('V-1: confirms cross-domain import in index.ts is bypassed by bootstrap (H6 verification)', async () => {
    // V-1 (H6 verification):
    // Audit hypothesis H6 investigated whether a cross-domain import in index.ts
    // behaves differently between bootstrap and CLI check.
    //
    // Findings:
    // 1. Bootstrap Step 7.5 (step-07-validations.ts) filters out index.* files:
    //    `!base.startsWith("index.")`, so bootstrap never validates imports in index.ts.
    // 2. CLI check (graph-builder.ts l.99) ALSO filters out index.* files:
    //    `!rel.match(/^index\./)`, so check does not report it in module actualImports either.
    // 3. The raw scanner `extractModuleImportsAsync` / `extractModuleImports` DOES parse it.
    //
    // Documented as a known exclusion in both bootstrap and CLI graph builder.
    const app = {
      'kerith.config.js': 'export default { strict: true };',
      'src/billing/index.ts': `
        import { Domain } from '{{SOURCE}}';
        Domain('billing');
      `,
      'src/billing/orders/index.ts': `
        import { Module } from '{{SOURCE}}';
        export async function useInventory() {
          await import('@shipping/inventory');
        }
        Module('orders');
      `,
      'src/shipping/index.ts': `
        import { Domain } from '{{SOURCE}}';
        Domain('shipping');
      `,
      'src/shipping/inventory/index.ts': `
        import { Module } from '{{SOURCE}}';
        Module('inventory');
      `,
    };

    await runInTmpApp(app, async (tmpDir, mockApp) => {
      // 1. Bootstrap does not throw DOMAIN_BOUNDARY_VIOLATION because index.* is excluded from Step 7.5
      const kerithApp = await createApp(mockApp as any);
      expect(kerithApp).toBeDefined();

      // 2. CLI check graph builder also excludes index.* from actualImports
      const graph = await buildModuleGraph({ origin: 'src', strict: true }, tmpDir);
      const ordersMod = graph.modules.find((m) => m.name === 'orders');
      expect(ordersMod?.actualImports).toHaveLength(0);

      const violations = detectViolations(graph, tmpDir);
      expect(violations.filter((v) => v.type === ViolationType.DOMAIN_BOUNDARY_VIOLATION)).toHaveLength(0);
    });
  });
});
