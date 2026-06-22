import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp } from "../../src/bootstrap/createApp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceUrl = pathToFileURL(
  path.resolve(__dirname, "../../src/index.ts"),
).href;

const runInTmpApp = async (
  files: Record<string, string>,
  tests: (tmpDir: string, app: ReturnType<typeof makeMockApp>) => Promise<void>,
) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "Kerith-regression-"));

  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const finalContent = content.replace(/\{\{SOURCE\}\}/g, sourceUrl);
    fs.writeFileSync(fullPath, finalContent);
  }

  // Inject mandatory ESM package.json
  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ type: "module" }),
  );

  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);

  try {
    await tests(tmpDir, makeMockApp());
  } finally {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

function makeMockApp() {
  const fakeApp: any = function() {};
  fakeApp.use = vi.fn();
  return fakeApp;
}

describe("createApp Regression E2E", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const complexFixture = {
    "kerith.config.js": `
      export default {
        strict: true,
        nits: { enabled: true },
        aliases: { "@utils": "./src/shared/utils.ts" }
      };
    `,
    "src/shared/utils.ts": `
      export const helper = () => true;
    `,
    "src/modules/users/index.ts": `
      import { Module } from '{{SOURCE}}';
      Module('users');
    `,
    "src/modules/users/controller.ts": `
      import { Controller } from '{{SOURCE}}';
      Controller('/users');
      const fakeRouter = function() {};
      fakeRouter.use = function() {};
      fakeRouter.stack = [
        { route: { path: '/me', methods: { get: true } } }
      ];
      export default fakeRouter;
    `,
    "src/modules/orders/index.ts": `
      import { Module } from '{{SOURCE}}';
      Module('orders');
    `,
    "src/modules/orders/submodules/payments/index.ts": `
      import { Module } from '{{SOURCE}}';
      Module('payments', { parent: 'orders' });
    `,
    "src/modules/orders/submodules/payments/controller.ts": `
      import { Controller } from '{{SOURCE}}';
      Controller('/payments');
      const fakeRouter = function() {};
      fakeRouter.use = function() {};
      fakeRouter.stack = [
        { route: { path: '/pay', methods: { post: true } } }
      ];
      export default fakeRouter;
    `
  };

  it("should mount all routes, register all modules and generate proper registry.json", async () => {
    await runInTmpApp(complexFixture, async (tmpDir, app) => {
      const KerithApp = await createApp(app as any);

      // Verify the app shape returned
      expect(KerithApp.modules).toHaveLength(3); // users, orders, payments
      expect(KerithApp.modules.map(m => m.name).sort()).toEqual(['orders', 'payments', 'users']);
      
      expect(KerithApp.routes).toHaveLength(2); // users/me, orders/payments/pay
      expect(KerithApp.routes.map(r => r.path).sort()).toEqual(['/payments/pay', '/users/me']);

      expect(app.use).toHaveBeenCalledTimes(2); // one for users controller, one for payments controller

      // Verify registry.json content
      const registryPath = path.join(tmpDir, '.kerith', 'registry.json');
      expect(fs.existsSync(registryPath)).toBe(true);
      
      const registryData = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      
      const registryModules = Object.values(registryData.modules);
      expect(registryModules).toHaveLength(3);
      expect(registryModules.some((m: any) => m.name === 'users')).toBe(true);
      expect(registryModules.some((m: any) => m.name === 'orders')).toBe(true);
      expect(registryModules.some((m: any) => m.name === 'payments')).toBe(true);
    });
  });
});
