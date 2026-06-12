import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixture');
const SRC_DIR = path.join(FIXTURE_DIR, 'src');

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

function getRandomElements(arr: string[], count: number) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function generateModule(name: string, imports: string[]) {
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
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-([a-z])/g, g => g[1].toUpperCase());
}

export function generateFixture() {
  if (fs.existsSync(FIXTURE_DIR)) {
    fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(SRC_DIR, { recursive: true });

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

  // Generate Base Layer
  for (const mod of baseLayer) {
    generateModule(mod, []);
  }

  // Generate Mid Layer
  for (const mod of midLayer) {
    generateModule(mod, getRandomElements(baseLayer, 4));
  }

  // Generate Top Layer
  for (const mod of topLayer) {
    generateModule(mod, getRandomElements(midLayer, 4));
  }

  console.log('[generator] Fixture created with 50 modules.');
}

if (process.argv[1] === __filename) {
  generateFixture();
}
