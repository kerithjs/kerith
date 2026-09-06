import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../../src/bootstrap/createApp.js";
import { hashSimilarity } from "../../src/nits/nits-hash.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/nits-app");
const sourceUrl = import("node:url").then(m => m.pathToFileURL(path.resolve(__dirname, "../../src/index.ts")).href);

// Mock the hash matcher so we don't have to guess the exact hash of the fixture modules
vi.mock("../../src/nits/nits-hash.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/nits/nits-hash.js")>();
  return {
    ...actual,
    hashSimilarity: vi.fn().mockReturnValue(1.0), // Always match Jaccard perfectly
  };
});

function makeMockApp() {
  return { use: vi.fn() };
}

function rewriteImportsSync(dir: string, srcUrl: string) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      rewriteImportsSync(fullPath, srcUrl);
    } else if (file.name.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      content = content.replace(/from\s+['"](?:.*?src\/index\.js|@vlynk-studios\/Kerith-core|@kerith\/core)['"]/g, `from '${srcUrl}'`);
      fs.writeFileSync(fullPath, content);
    }
  }
}

describe("NITS App Lifecycle (Shadow File Integration)", () => {
  let tmpDirs: string[] = [];
  let cwdSpy: any;
  let srcUrl: string;

  beforeEach(async () => {
    srcUrl = await sourceUrl;
    vi.mocked(hashSimilarity).mockReturnValue(1.0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs = [];
  });

  // Helper to create a fresh dir for a new boot cycle (to avoid ESM cache)
  function createCycleDir(sourceDir?: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kerith-lifecycle-"));
    tmpDirs.push(dir);
    if (sourceDir) {
      fs.cpSync(sourceDir, dir, { recursive: true });
    } else {
      fs.cpSync(FIXTURE_DIR, dir, { recursive: true });
      rewriteImportsSync(dir, srcUrl);
    }
    return dir;
  }

  it("Full cycle with Shadow File", async () => {
    // 1. Bootstrap limpio sobre nits-app
    const dir1 = createCycleDir();
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(dir1);
    
    let result = await createApp(makeMockApp() as any);
    
    const usersMod = result.modules.find(m => m.name === "users");
    expect(usersMod).toBeDefined();
    expect(usersMod!.id).toBe("mod_a1b2c3d4");

    // 2. Prepare Cycle 2
    const dir2 = createCycleDir(dir1);
    cwdSpy.mockReturnValue(dir2);

    // 3. Simular movimiento de users/ a domains/auth/users/
    const usersPath = path.join(dir2, "src/modules/users");
    const newUsersPath = path.join(dir2, "src/domains/auth/users");
    fs.mkdirSync(path.dirname(newUsersPath), { recursive: true });
    fs.renameSync(usersPath, newUsersPath);
    
    // Update config to scan the new path
    const configPath = path.join(dir2, "kerith.config.js");
    fs.writeFileSync(configPath, `export default { modules: '{src/modules/*,src/domains/auth/*}', strict: false };`);

    // 4. Reconciliar (second bootstrap)
    result = await createApp(makeMockApp() as any);

    // 5. Verificar ID y movimiento
    const movedUsers = result.modules.find(m => m.name === "users");
    expect(movedUsers).toBeDefined();
    expect(movedUsers!.id).toBe("mod_a1b2c3d4"); // Preserved ID
    
    // Check it was resolved by shadow file
    const registryContent = JSON.parse(fs.readFileSync(path.join(dir2, ".kerith", "registry.json"), "utf8"));
    const record = registryContent.modules["mod_a1b2c3d4"];
    expect(record.status).toBe("moved");
    expect(record.path).toBe("src/domains/auth/users");
  });

  it("Cycle without Shadow File (backward compatibility)", async () => {
    // 1. Completely fresh app
    const dir1 = createCycleDir();
    fs.rmSync(path.join(dir1, "src/modules/users/.kerith"), { force: true });
    fs.rmSync(path.join(dir1, "src/modules/orders/.kerith"), { force: true });
    fs.rmSync(path.join(dir1, ".kerith", "registry.json"), { force: true });
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(dir1);

    await createApp(makeMockApp() as any);
    const generatedRegistry = JSON.parse(fs.readFileSync(path.join(dir1, ".kerith", "registry.json"), "utf8"));
    const realUsersMod = Object.values(generatedRegistry.modules).find((m: any) => m.name === 'users') as any;
    const realOrdersMod = Object.values(generatedRegistry.modules).find((m: any) => m.name === 'orders') as any;

    // 2. Create a "legacy" registry utilizing the actual hashes, missing .kerith files
    const legacyRegistry = {
      project: "nits-app",
      version: "1.0.0",
      lastCheck: new Date().toISOString(),
      modules: {
        "mod_a1b2c3d4": {
          id: "mod_a1b2c3d4",
          name: "users",
          path: "src/modules/users",
          hash: realUsersMod.hash,
          status: "active",
          createdAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          identifiers: realUsersMod.identifiers
        },
        "mod_e5f6a7b8": {
          id: "mod_e5f6a7b8",
          name: "orders",
          path: "src/modules/orders",
          hash: realOrdersMod.hash,
          status: "active",
          createdAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          identifiers: realOrdersMod.identifiers
        }
      }
    };
    fs.writeFileSync(path.join(dir1, ".kerith", "registry.json"), JSON.stringify(legacyRegistry, null, 2));

    // Also remove the shadow files generated by the first boot to simulate legacy state
    fs.rmSync(path.join(dir1, "src/modules/users/.kerith"), { force: true });
    fs.rmSync(path.join(dir1, "src/modules/orders/.kerith"), { force: true });

    // 3. Second boot -> should upgrade legacy registry and generate new shadow files with preserved IDs
    const dir2 = createCycleDir(dir1);
    cwdSpy.mockReturnValue(dir2);
    await createApp(makeMockApp() as any);

    const registryContentStr = fs.readFileSync(path.join(dir2, ".kerith", "registry.json"), "utf8");

    const usersShadowContent = JSON.parse(fs.readFileSync(path.join(dir2, "src/modules/users/.kerith"), "utf8"));
    expect(usersShadowContent.id).toBe("mod_a1b2c3d4"); // Preserved!
    expect(usersShadowContent.id).toMatch(/^mod_[0-9a-f]{8}$/);

    const registryContent = JSON.parse(registryContentStr);
    expect(registryContent.modules["mod_a1b2c3d4"].status).toBe("active");
  });

  it("Cloning", async () => {
    // Use a custom logger handler so we can capture framework-level warnings.
    // The "Duplicate module identity detected" warning is emitted via
    // options.log.warn() (not console.warn), so we must intercept it here.
    const loggerHandler = vi.fn();

    // Bootstrap first to establish baseline
    const dir1 = createCycleDir();
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(dir1);
    await createApp(makeMockApp() as any, { logger: loggerHandler });

    // 1. Duplicar carpeta users/ como users-copy/ (mismo .kerith)
    const dir2 = createCycleDir(dir1);
    cwdSpy.mockReturnValue(dir2);
    const usersPath = path.join(dir2, "src/modules/users");
    const copyPath = path.join(dir2, "src/modules/users-copy");
    fs.cpSync(usersPath, copyPath, { recursive: true });
    
    // Fix Module() call in copy to match directory name
    const copyIndexPath = path.join(copyPath, "index.ts");
    let copyIndexContent = fs.readFileSync(copyIndexPath, 'utf8');
    copyIndexContent = copyIndexContent.replace(/Module\('users'/g, "Module('users-copy'");
    fs.writeFileSync(copyIndexPath, copyIndexContent);

    // Fix Service name clash
    const copySvcPath = path.join(copyPath, "users.service.ts");
    let copySvcContent = fs.readFileSync(copySvcPath, 'utf8');
    copySvcContent = copySvcContent.replace(/UserService/g, "UserServiceCopy").replace(/module:\s*'users'/g, "module: 'users-copy'");
    fs.writeFileSync(copySvcPath, copySvcContent);

    // 2. Reconciliar
    try {
      await createApp(makeMockApp() as any, { logger: loggerHandler });
    } catch (e: any) {
      console.error(e.details);
      throw e;
    }

    // 3. Verify users in confirmed, users-copy in newModules with a different ID
    const registryContent = JSON.parse(fs.readFileSync(path.join(dir2, ".kerith", "registry.json"), "utf8"));
    const usersRecord = Object.values(registryContent.modules).find((m: any) => m.path === "src/modules/users") as any;
    const copyRecord = Object.values(registryContent.modules).find((m: any) => m.path === "src/modules/users-copy") as any;

    expect(usersRecord).toBeDefined();
    expect(usersRecord.id).toBe("mod_a1b2c3d4");

    expect(copyRecord).toBeDefined();
    expect(copyRecord.id).toMatch(/^mod_[0-9a-f]{8}$/);
    expect(copyRecord.id).not.toBe("mod_a1b2c3d4");

    // Verify shadow file in copy was updated
    const copyShadowContent = JSON.parse(fs.readFileSync(path.join(copyPath, ".kerith"), "utf8"));
    expect(copyShadowContent.id).toBe(copyRecord.id);

    // Verify cloning warning. The reconciler emits this via options.log.warn(),
    // which calls the LogHandler as: handler('warn', message, { _module: 'nits' })
    expect(loggerHandler).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining("Duplicate module identity detected"),
      expect.objectContaining({ _module: 'nits' })
    );
  });
});
