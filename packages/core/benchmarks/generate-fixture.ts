import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixture');
const SRC_DIR = path.join(FIXTURE_DIR, 'src');

// Simple LCG (Linear Congruential Generator) for deterministic random numbers
export class SeededRandom {
  private seed: number;

  constructor(seed: string) {
    // Convert string seed to numeric seed
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    this.seed = Math.abs(hash);
  }

  // Returns a random number between 0 and 1
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  // Returns a random integer between min (inclusive) and max (exclusive)
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  // Shuffle array in place using Fisher-Yates algorithm
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

const baseLayer = [
  'users', 'auth', 'config', 'database', 'logger', 'mailer',
  'redis', 'storage', 'crypto', 'i18n', 'health', 'metrics',
  'rate-limiter', 'session', 'audit'
];

const midLayer = [
  'orders', 'payments', 'notifications', 'products', 'inventory',
  'billing', 'shipping', 'cart', 'promotions', 'reviews',
  'subscriptions', 'invoices', 'refunds', 'analytics', 'reports',
  'search', 'recommendations', 'wishlist', 'address', 'tax'
];

const topLayer = [
  'dashboard', 'admin', 'checkout', 'customer-portal', 'vendor-portal',
  'reporting', 'integrations', 'webhooks', 'api-gateway', 'backoffice',
  'ops', 'compliance', 'support', 'crm', 'onboarding'
];

// Modules that will have submodules
const modulesWithSubmodules = ['orders', 'payments', 'products', 'inventory', 'analytics'];

function getRandomElements(rng: SeededRandom, arr: string[], count: number) {
  const shuffled = rng.shuffle([...arr]);
  return shuffled.slice(0, count);
}

function generateModule(name: string, imports: string[], hasSubmodules: boolean = false) {
  const modDir = path.join(SRC_DIR, name);
  fs.mkdirSync(modDir, { recursive: true });

  // index.ts
  const importStmts = imports.map(imp => `import { ${capitalize(imp)}Service } from '@modules/${imp}';`).join('\n');
  
  const indexContent = `
import { Module } from '../../../../src/index.js';
${importStmts}

Module('${name}', {
  imports: ${JSON.stringify(imports)},
  exports: ['${capitalize(name)}Service']
});

export * from './${name}.service.js';
export * from './${name}.repository.js';
export * from './${name}.schema.js';
  `.trim();
  fs.writeFileSync(path.join(modDir, 'index.ts'), indexContent);

  // {name}.service.ts
  const serviceContent = `
import { Service } from '../../../../src/index.js';
${importStmts}

Service('${capitalize(name)}Service');
export class ${capitalize(name)}Service {
  execute() { return true; }
}
  `.trim();
  fs.writeFileSync(path.join(modDir, `${name}.service.ts`), serviceContent);

  // {name}.repository.ts
  const repoContent = `
import { Repository } from '../../../../src/index.js';

Repository('${capitalize(name)}Repository');
export class ${capitalize(name)}Repository {
  find() { return []; }
}
  `.trim();
  fs.writeFileSync(path.join(modDir, `${name}.repository.ts`), repoContent);

  // {name}.schema.ts
  const schemaContent = `
import { Schema } from '../../../../src/index.js';

Schema('${capitalize(name)}Schema');
export const ${capitalize(name)}Schema = { type: 'object' };
  `.trim();
  fs.writeFileSync(path.join(modDir, `${name}.schema.ts`), schemaContent);

  // {name}.routes.ts
  const routesContent = `
import { Controller } from '../../../../src/index.js';
import { Router } from 'express';

Controller('/${name}');
const router = Router();
router.get('/', (req, res) => res.json({ status: 'ok' }));
export default router;
  `.trim();
  fs.writeFileSync(path.join(modDir, `${name}.routes.ts`), routesContent);

  // Generate submodules if needed
  if (hasSubmodules) {
    // Temporarily disable submodules to fix import path issues
    // generateSubmodules(modDir, name);
  }
}

function generateSubmodules(modDir: string, parentModule: string) {
  const submodulesDir = path.join(modDir, 'submodules');
  fs.mkdirSync(submodulesDir, { recursive: true });

  const submoduleNames = ['create-order', 'process-payment', 'ship-item'];

  for (const subName of submoduleNames) {
    const subDir = path.join(submodulesDir, subName);
    fs.mkdirSync(subDir, { recursive: true });

    const subIndexContent = `
import { SubModule } from '../../../../../src/index.js';

SubModule('${capitalize(subName.replace(/-/g, ''))}');

export function execute() {
  return true;
}
    `.trim();
    fs.writeFileSync(path.join(subDir, 'index.ts'), subIndexContent);
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-([a-z])/g, g => g[1].toUpperCase());
}

function generateShared() {
  const sharedDir = path.join(SRC_DIR, 'shared');
  fs.mkdirSync(sharedDir, { recursive: true });

  const sharedFiles = [
    { name: 'utils.ts', content: `export function formatDate(date: Date): string {\n  return date.toISOString();\n}\n\nexport function parseJson<T>(json: string): T | null {\n  try {\n    return JSON.parse(json) as T;\n  } catch {\n    return null;\n  }\n}` },
    { name: 'constants.ts', content: `export const API_VERSION = '1.0.0';\nexport const MAX_RETRY_ATTEMPTS = 3;\nexport const DEFAULT_TIMEOUT = 5000;` },
    { name: 'types.ts', content: `export interface User {\n  id: string;\n  name: string;\n  email: string;\n}\n\nexport interface Product {\n  id: string;\n  name: string;\n  price: number;\n}` }
  ];

  for (const file of sharedFiles) {
    fs.writeFileSync(path.join(sharedDir, file.name), file.content);
  }
}

/**
 * Robustly removes a directory on Windows.
 *
 * On Windows, rmSync can throw EPERM when:
 *  - A previous benchmark run was interrupted and left node.exe child processes
 *    with the fixture dir as their CWD (parent kill doesn't kill children on Windows)
 *  - Windows Defender is scanning the directory
 *  - Windows Search Indexer has a file handle open
 *
 * Strategy:
 *  1. Standard rmSync (fast path)
 *  2. Kill lingering node.exe processes whose command-line references the fixture path
 *  3. Robocopy /MIR trick: mirror an empty dir over fixture, then delete the empty shell
 *  4. cmd.exe rmdir /s /q
 *  5. Throw a clear, actionable error
 */
function forceRemoveDir(dirPath: string): void {
  // Helper: synchronous sleep via Atomics (avoids async)
  const sleep = (ms: number) =>
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

  // Strategy 1: standard rmSync
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return;
  } catch (e1: any) {
    if (e1.code !== 'EPERM' && e1.code !== 'EBUSY' && e1.code !== 'ENOTEMPTY') throw e1;
  }

  if (process.platform === 'win32') {
    // Strategy 2: kill node.exe processes whose CommandLine references this fixture
    try {
      const escaped = dirPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      execSync(
        `powershell -NoProfile -Command "` +
          `Get-CimInstance Win32_Process -Filter \\"Name = 'node.exe'\\" | ` +
          `Where-Object { $_.CommandLine -like '*benchmarks*fixture*' } | ` +
          `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
        { stdio: 'ignore', timeout: 5000 }
      );
      sleep(400); // give Windows time to release handles
    } catch { /* ignore */ }

    // Retry rmSync after killing lockers
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch { /* ignore */ }

    // Strategy 3: robocopy /MIR trick — mirror an empty dir into fixture (clears all files),
    // then remove the now-empty fixture dir
    try {
      const emptyDir = path.join(path.dirname(dirPath), '.kerith-bench-empty');
      fs.mkdirSync(emptyDir, { recursive: true });
      execSync(`robocopy "${emptyDir}" "${dirPath}" /MIR /NFL /NDL /NJH /NJS`, {
        stdio: 'ignore',
        timeout: 10_000
      });
      fs.rmSync(emptyDir, { recursive: true, force: true });
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch { /* ignore */ }

    // Strategy 4: cmd.exe rmdir
    try {
      execSync(`cmd /c rmdir /s /q "${dirPath}"`, { stdio: 'ignore', timeout: 10_000 });
      if (!fs.existsSync(dirPath)) return;
    } catch { /* ignore */ }
  }

  throw new Error(
    `[fixture] EPERM: Cannot delete '${dirPath}'.\n` +
    `A previous benchmark run may have left orphaned Node.js processes.\n` +
    `Fix: Run this in PowerShell then retry:\n` +
    `  Stop-Process -Name node -Force\n` +
    `Or manually delete the fixture directory.`
  );
}

function resolveTotalModules(size: 'small' | 'large' | number): number {
  if (typeof size === 'number') {
    if (size < 1 || !Number.isInteger(size)) {
      throw new Error(`Size must be a positive integer, got: ${size}`);
    }
    return size;
  }
  return size === 'large' ? 100 : 50;
}

function splitLayers(total: number) {
  const baseCount = Math.max(1, Math.round(total * 0.30));
  const midCount  = Math.max(1, Math.round(total * 0.40));
  const topCount  = Math.max(0, total - baseCount - midCount);
  return { baseCount, midCount, topCount };
}

export function generateFixture(size: 'small' | 'large' | number = 'small') {
  if (fs.existsSync(FIXTURE_DIR)) {
    forceRemoveDir(FIXTURE_DIR);
  }
  fs.mkdirSync(SRC_DIR, { recursive: true });

  const totalRequested = resolveTotalModules(size);

  // Use deterministic seed based on fixture size
  const rng = new SeededRandom(`kerith-bench-n${totalRequested}`);

  // Add kerith.config.ts
  fs.writeFileSync(path.join(FIXTURE_DIR, 'kerith.config.ts'), `
export default {
  origin: 'src',
  strict: false,
  logLevel: 'fatal'
};
  `.trim());

  // Package json
  fs.writeFileSync(path.join(FIXTURE_DIR, 'package.json'), JSON.stringify({ type: 'module' }));

  // Generate shared directory
  generateShared();

  // Determine module count based on size
  const { baseCount, midCount, topCount } = splitLayers(totalRequested);

  // Generate Base Layer
  for (let i = 0; i < baseCount; i++) {
    const modName = baseLayer[i % baseLayer.length] + (i >= baseLayer.length ? `-${i}` : '');
    generateModule(modName, [], modulesWithSubmodules.includes(modName));
  }

  // Generate Mid Layer
  for (let i = 0; i < midCount; i++) {
    const modName = midLayer[i % midLayer.length] + (i >= midLayer.length ? `-${i}` : '');
    const imports = getRandomElements(rng, baseLayer, 4);
    generateModule(modName, imports, modulesWithSubmodules.includes(modName));
  }

  // Generate Top Layer
  for (let i = 0; i < topCount; i++) {
    const modName = topLayer[i % topLayer.length] + (i >= topLayer.length ? `-${i}` : '');
    const imports = getRandomElements(rng, midLayer, 4);
    generateModule(modName, imports, modulesWithSubmodules.includes(modName));
  }

  const totalModules = baseCount + midCount + topCount;
  console.log(`[generator] Fixture created with ${totalModules} modules (n${totalRequested}).`);
}

if (process.argv[1] === __filename) {
  const arg = process.argv[2];
  let size: 'small' | 'large' | number = 'small';
  if (arg === 'large') {
    size = 'large';
  } else if (arg && !isNaN(Number(arg))) {
    size = Number(arg);
  }
  generateFixture(size);
}
