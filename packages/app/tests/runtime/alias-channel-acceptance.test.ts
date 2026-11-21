import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const KERITH_APP_SRC = path.resolve(__dirname, '../../src/index.ts')
const KERITH_APP_URL = pathToFileURL(KERITH_APP_SRC).href

describe('5.5 Criterios de aceptación (Canal Alias — Nivel 1)', () => {
  it('cumple los 5 criterios de aceptación de extremo a extremo en Node.js real', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-alias-acceptance-'))

    try {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))
      fs.writeFileSync(path.join(tmpDir, 'kerith.config.js'), 'export default { strict: false };')

      // Junction node_modules
      fs.symlinkSync(
        path.resolve(__dirname, '../../node_modules'),
        path.join(tmpDir, 'node_modules'),
        'junction',
      )

      const writeModule = (relativePath: string, source: string): string => {
        const fullPath = path.join(tmpDir, relativePath)
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, source)
        return fullPath
      }

      // Module core index
      writeModule('src/modules/core/index.ts', `import { Module } from '@kerith/core'; Module('core');`)

      // ── Declarantes SIN export (criterios 1, 2, 3 y 4) ─────────────────────
      const declarants = [
        {
          file: 'src/config/app.config.ts',
          channel: 'Config',
          body: `Config('app', () => ({ port: 3000 }));`,
        },
        {
          file: 'src/infra/db.client.ts',
          channel: 'Client',
          body: `Client('db', () => ({ pool: 'pg-connection-pool' }));`,
        },
        {
          file: 'src/infra/cache.store.ts',
          channel: 'Store',
          body: `Store('cache', () => ({ storeMap: new Map([['initialized', true]]) }));`,
        },
        {
          file: 'src/infra/payment.provider.ts',
          channel: 'Provider',
          body: `Provider('payment', () => ({ gateway: 'stripe' }));`,
        },
        {
          file: 'src/infra/queue.adapter.ts',
          channel: 'Adapter',
          body: `Adapter('queue', () => ({ redisQueue: 'bullmq' }));`,
        },
        {
          file: 'src/infra/singleton.client.ts',
          channel: 'Client',
          body: `let count = 0;
Client('singleton', async () => {
  count++;
  await new Promise((r) => setTimeout(r, 10));
  return { count, token: 'async-token-' + Math.random() };
});`,
        },
      ]

      const declarantPaths = declarants.map(({ file, channel, body }) =>
        writeModule(file, `import { ${channel} } from '${KERITH_APP_URL}';\n${body}\n`),
      )

      // ── Dos importadores independientes para el criterio 3 ─────────────────
      // Deben ser archivos distintos: así la igualdad de referencia no se
      // explica solo por el cache de módulos de Node dentro de un archivo.
      const importerPaths = ['first', 'second'].map((name) =>
        writeModule(
          `src/importers/${name}.ts`,
          `const ns = await import('@client/singleton');
export const instance = ns.default;
export const marker = {};
`,
        ),
      )
      const [firstImporterPath, secondImporterPath] = importerPaths

      const preimportLines = declarantPaths
        .map((filePath) => `await import(${JSON.stringify(pathToFileURL(filePath).href)});`)
        .join('\n')

      // ── E2E Runner script ──────────────────────────────────────────────────
      const runnerScript = path.join(tmpDir, 'runner.mjs')
      fs.writeFileSync(
        runnerScript,
        `import { createApp } from ${JSON.stringify(KERITH_APP_URL)};
import express from 'express';
import assert from 'node:assert/strict';

// Pre-import declaring files (Level 1 prerequisite: imported before/during boot)
${preimportLines}

// Boot application
const app = express();
await createApp(app, { logger: () => {} });

// ── Criterio 1: Config('app', () => ({ port: 3000 })) sin export ───────────
const { default: config } = await import('@config/app');
assert.deepEqual(config, { port: 3000 }, 'Criterio 1 fallido: config mismatch');
process.stdout.write('CHECK 1 PASSED: Config without export\\n');

// ── Criterio 2: Idéntico para Client, Store, Provider y Adapter ──────────────
const { default: db } = await import('@client/db');
assert.equal(db.pool, 'pg-connection-pool', 'Criterio 2 fallido: Client mismatch');

const { default: cache } = await import('@store/cache');
assert.equal(cache.storeMap.get('initialized'), true, 'Criterio 2 fallido: Store mismatch');

const { default: payment } = await import('@provider/payment');
assert.equal(payment.gateway, 'stripe', 'Criterio 2 fallido: Provider mismatch');

const { default: queue } = await import('@adapter/queue');
assert.equal(queue.redisQueue, 'bullmq', 'Criterio 2 fallido: Adapter mismatch');
process.stdout.write('CHECK 2 PASSED: Client, Store, Provider, Adapter without export\\n');

// ── Criterio 3: Dos importadores reciben misma referencia y factory corre 1 vez
const firstImporter = await import(${JSON.stringify(pathToFileURL(firstImporterPath).href)});
const secondImporter = await import(${JSON.stringify(pathToFileURL(secondImporterPath).href)});
const instA = firstImporter.instance;
const instB = secondImporter.instance;

assert.notEqual(
  firstImporter.marker,
  secondImporter.marker,
  'Criterio 3 fallido: los dos importadores no son módulos distintos',
);
assert.equal(instA, instB, 'Criterio 3 fallido: instA !== instB (referencia no idéntica entre importadores)');

// The cached runtime instance must be the very same object exposed by both imports
const runtime = globalThis[Symbol.for('kerith.alias-runtime')];
assert.notEqual(runtime, undefined, 'Criterio 3 fallido: alias runtime no inicializado');
const runtimeInstance = await runtime.get('client/singleton');
assert.equal(instA, runtimeInstance, 'Criterio 3 fallido: el runtime devolvió otra instancia');
assert.equal(instA.count, 1, 'Criterio 3 fallido: factory ejecutada más de una vez');
process.stdout.write('CHECK 3 PASSED: Singleton reference across importers and single execution\\n');

// ── Criterio 4: Factory async entrega valor ya resuelto ──────────────────────
assert.equal(typeof instA.token, 'string', 'Criterio 4 fallido: valor async no resuelto');
assert.equal(instA instanceof Promise, false, 'Criterio 4 fallido: se devolvió una promesa sin resolver');
process.stdout.write('CHECK 4 PASSED: Async factory unwrapped directly\\n');

// ── Criterio 5: Alias inexistente lanza ALIAS_NOT_FOUND, no ERR_MODULE_NOT_FOUND
let caught = null;
try {
  await import('@client/nonexistent');
} catch (err) {
  caught = err;
}
assert.notEqual(caught, null, 'Criterio 5 fallido: no lanzó error al importar alias inexistente');
const errString = String(caught?.message || caught);
assert(
  errString.includes('ALIAS_NOT_FOUND') || caught?.code === 'ALIAS_NOT_FOUND',
  'Criterio 5 fallido: se esperaba ALIAS_NOT_FOUND pero se recibió: ' + errString,
);
assert(
  !errString.includes('ERR_MODULE_NOT_FOUND'),
  'Criterio 5 fallido: se lanzó ERR_MODULE_NOT_FOUND genérico en lugar de ALIAS_NOT_FOUND',
);
process.stdout.write('CHECK 5 PASSED: ALIAS_NOT_FOUND for nonexistent alias\\n');

process.stdout.write('ALL 5 ACCEPTANCE CRITERIA PASSED!\\n');
`,
      )

      // Execute with local tsx
      const tsxBin = path.resolve(__dirname, '../../node_modules/.bin/tsx')
      const tsxCmd = process.platform === 'win32' ? `${tsxBin}.cmd` : tsxBin
      const out = execSync(`"${tsxCmd}" "${runnerScript}"`, {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 30_000,
      })

      expect(out).toContain('CHECK 1 PASSED')
      expect(out).toContain('CHECK 2 PASSED')
      expect(out).toContain('CHECK 3 PASSED')
      expect(out).toContain('CHECK 4 PASSED')
      expect(out).toContain('CHECK 5 PASSED')
      expect(out).toContain('ALL 5 ACCEPTANCE CRITERIA PASSED!')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 30_000)
})
