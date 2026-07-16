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
const pkgVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")).version;

const runInTmpApp = async (
  files: Record<string, string>,
  tests: (tmpDir: string, app: ReturnType<typeof makeMockApp>) => Promise<void>,
) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "Kerith-integration-"));

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
  return { use: vi.fn() };
}

describe("Bootstrap Cache Integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const fixtureFiles = {
    "kerith.config.js": "export default { strict: true };",
    "src/modules/app/index.ts": `
      import { Module } from '{{SOURCE}}';
      Module('app');
    `,
  };

  it("5.3.1 — Full cache hit: segundo boot retorna mismos módulos que primer boot", async () => {
    await runInTmpApp(fixtureFiles, async (tmpDir, app) => {
      // Create cache manually to simulate a previous boot
      const { CacheManager } = await import("../../src/cache/bootstrap-cache.js");
      const configHash = CacheManager.hashConfig(path.join(tmpDir, "kerith.config.js"));
      const cachePath = path.join(tmpDir, ".kerith", "bootstrap-cache.json");
      
      const indexPath = path.join(tmpDir, "src/modules/app/index.ts");
      const stat = fs.statSync(indexPath);

      fs.mkdirSync(path.join(tmpDir, ".kerith"), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify({
        version: pkgVersion,
        status: "ok",
        savedAt: new Date(Date.now() + 10000).toISOString(), // future so it doesn't trigger mtime rescan
        cwd: tmpDir,
        configHash,
        data: {
          domains: [],
          modules: [{
            name: "app",
            dirPath: path.join(tmpDir, "src/modules/app"),
            indexPath: indexPath,
            imports: [],
            exports: [],
            shared: [],
            options: {},
            id: "mod_abcdef12",
            files: [indexPath],
            identifiers: [],
            aliases: [],
            cachedSize: stat.size
          }],
          submodules: [],
          shared: [],
          identifiers: [],
          aliases: []
        }
      }));

      const res = await createApp(app as any);
      expect(res.modules).toHaveLength(1);
      expect(res.modules[0].name).toBe("app");
    });
  });

  it("5.3.2 — Cache es ignorado en producción (NODE_ENV=production)", async () => {
    await runInTmpApp(fixtureFiles, async (tmpDir, app) => {
      const cachePath = path.join(tmpDir, ".kerith", "bootstrap-cache.json");

      process.env.NODE_ENV = "production";
      await createApp(app as any);
      process.env.NODE_ENV = "test"; // restore

      // The cache should NOT be written
      expect(fs.existsSync(cachePath)).toBe(false);
    });
  });

  it("5.3.3 — Cache es ignorado cuando KERITH_BOOTSTRAP_CACHE=false", async () => {
    await runInTmpApp(fixtureFiles, async (tmpDir, app) => {
      const cachePath = path.join(tmpDir, ".kerith", "bootstrap-cache.json");

      process.env.KERITH_BOOTSTRAP_CACHE = "false";
      await createApp(app as any);
      delete process.env.KERITH_BOOTSTRAP_CACHE;

      // The cache should NOT be written
      expect(fs.existsSync(cachePath)).toBe(false);
    });
  });

  it("5.3.4 — Cache se invalida cuando cambia la versión", async () => {
    await runInTmpApp(fixtureFiles, async (tmpDir, app) => {
      const cachePath = path.join(tmpDir, ".kerith", "bootstrap-cache.json");
      
      fs.mkdirSync(path.join(tmpDir, ".kerith"), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify({
        version: "1.0.0", // old version
        status: "ok",
        savedAt: new Date().toISOString(),
        cwd: tmpDir,
        configHash: "dummy",
        data: { domains: [], modules: [], submodules: [], shared: [], identifiers: [], aliases: [] }
      }));

      await createApp(app as any);
      
      const content = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      expect(content.version).not.toBe("1.0.0");
      expect(content.data.modules).toHaveLength(1); // Real data written
    });
  });

  it("5.3.5 — Cache se invalida cuando cambia el configHash", async () => {
    await runInTmpApp(fixtureFiles, async (tmpDir, app) => {
      const cachePath = path.join(tmpDir, ".kerith", "bootstrap-cache.json");
      
      fs.mkdirSync(path.join(tmpDir, ".kerith"), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify({
        version: pkgVersion,
        status: "ok",
        savedAt: new Date().toISOString(),
        cwd: tmpDir,
        configHash: "invalid_hash_123", // wrong hash
        data: { domains: [], modules: [], submodules: [], shared: [], identifiers: [], aliases: [] }
      }));

      await createApp(app as any);
      const content = JSON.parse(fs.readFileSync(cachePath, "utf-8"));

      expect(content.configHash).not.toBe("invalid_hash_123");
      expect(content.data.modules).toHaveLength(1); // Real data written
    });
  });

  it("5.3.6 — Cache con status: 'pending' fuerza full scan", async () => {
    await runInTmpApp(fixtureFiles, async (tmpDir, app) => {
      const cachePath = path.join(tmpDir, ".kerith", "bootstrap-cache.json");
      
      fs.mkdirSync(path.join(tmpDir, ".kerith"), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify({ status: "pending" }));

      await createApp(app as any);
      
      const content = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      expect(content.status).toBe("ok");
      expect(content.data.modules).toHaveLength(1);
    });
  });

  it("5.3.7 — Error en bootstrap escribe status: 'failed' en el cache", async () => {
    await runInTmpApp({
      "kerith.config.js": "export default { strict: true };",
      "src/modules/bad/index.ts": `
        import { Module } from '{{SOURCE}}';
        Module('bad', { imports: ['nonExistent'] });
      `,
    }, async (tmpDir, app) => {
      const cachePath = path.join(tmpDir, ".kerith", "bootstrap-cache.json");
      
      await expect(createApp(app as any)).rejects.toThrow();
      
      const content = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      expect(content.status).toBe("failed");
      expect(content.error).toContain("A module declared in imports does not exist");
    });
  });

  it("6.2.1-6.2.3 — El primer boot escribe shared[] correctamente en el cache", async () => {
    await runInTmpApp({
      "kerith.config.js": "export default { strict: true };",
      "src/shared/utils.ts": "export const a = 1;",
      "src/modules/app/index.ts": `
        import { Module } from '{{SOURCE}}';
        Module('app', { shared: ['@shared'] });
      `,
    }, async (tmpDir, app) => {
      await createApp(app as any);
      
      const cachePath = path.join(tmpDir, ".kerith", "bootstrap-cache.json");
      expect(fs.existsSync(cachePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      expect(content.data.shared).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'global',
            alias: '@shared',
            path: path.join(tmpDir, 'src/shared')
          })
        ])
      );
    });
  });

  it("6.2.4 — El segundo boot (cache hit) carga shared[] en el registry", async () => {
    await runInTmpApp({
      "kerith.config.js": "export default { strict: true };",
      "src/shared/utils.ts": "export const a = 1;",
      "src/modules/app/index.ts": `
        import { Module } from '{{SOURCE}}';
        Module('app', { shared: ['@shared'] });
      `,
    }, async (tmpDir, app) => {
      // Create cache manually to simulate a previous boot with shared
      const { CacheManager } = await import("../../src/cache/bootstrap-cache.js");
      const configHash = CacheManager.hashConfig(path.join(tmpDir, "kerith.config.js"));
      const cachePath = path.join(tmpDir, ".kerith", "bootstrap-cache.json");
      const indexPath = path.join(tmpDir, "src/modules/app/index.ts");
      const sharedPath = path.join(tmpDir, "src/shared");

      fs.mkdirSync(path.join(tmpDir, ".kerith"), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify({
        version: pkgVersion,
        status: "ok",
        savedAt: new Date(Date.now() + 10000).toISOString(),
        cwd: tmpDir,
        configHash,
        data: {
          domains: [],
          modules: [{
            name: "app",
            dirPath: path.join(tmpDir, "src/modules/app"),
            indexPath: indexPath,
            imports: [],
            exports: [],
            shared: ['@shared'],
            options: {},
            id: "mod_abcdef12",
            files: [indexPath],
            identifiers: [],
            aliases: [],
            cachedSize: fs.statSync(indexPath).size
          }],
          submodules: [],
          shared: [{
            type: 'global',
            alias: '@shared',
            path: normalizePath(sharedPath)
          }],
          identifiers: [],
          aliases: []
        }
      }));

      const res = await createApp(app as any);
      
      const sharedEntry = (res.registry as any).getShared('@shared');
      expect(sharedEntry).toBeDefined();
      expect(sharedEntry?.type).toBe('global');
      expect(normalizePath(sharedEntry?.path as string)).toBe(normalizePath(sharedPath));
    });
  });
});

// Import the normalizePath helper since we use it now
import { normalizePath } from "../../src/core/utils/paths.js";
