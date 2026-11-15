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

describe('6.5 Criterios de aceptación (Canal Alias — Nivel 2: ciclo de vida)', () => {
  it('cumple los 5 criterios de aceptación de ciclo de vida en Node.js real', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-alias-lifecycle-'))

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

      // Base core module
      writeModule(
        'src/modules/core/index.ts',
        `import { Module } from '@kerith/core'; Module('core');`,
      )

      // Declarations for criteria 2, 3 and 5 (lifecycle tracking)
      writeModule(
        'src/infra/lifecycle.client.ts',
        `import { Client } from '@kerith/identifiers';

globalThis.__lifecycleCounts = { eager: 0, lazy: 0 };
globalThis.__disposeLog = [];

Client('eager-client', () => {
  globalThis.__lifecycleCounts.eager++;
  return { role: 'eager' };
}, {
  lazy: false,
  dispose: (inst) => {
    globalThis.__disposeLog.push('eager-client');
  },
});

Client('lazy-client', () => {
  globalThis.__lifecycleCounts.lazy++;
  return { role: 'lazy' };
}, {
  lazy: true,
  dispose: (inst) => {
    globalThis.__disposeLog.push('lazy-client');
  },
});

Client('second-eager', () => {
  return { role: 'second' };
}, {
  lazy: false,
  dispose: (inst) => {
    globalThis.__disposeLog.push('second-eager');
  },
});
`,
      )

      // Runner script testing all 5 criteria
      const runnerScript = path.join(tmpDir, 'run-lifecycle-checks.ts')
      fs.writeFileSync(
        runnerScript,
        `import assert from 'node:assert/strict';
import { createApp, getAliasRuntime } from ${JSON.stringify(KERITH_APP_URL)};
import { Client } from '@kerith/identifiers';

// ── Criterio 1: required: true + factory que lanza -> ALIAS_FACTORY_FAILED ──
{
  const runtime = getAliasRuntime();
  runtime._reset();

  runtime.declare({
    prefix: 'client',
    name: 'failing-db',
    filePath: '/infra/db.ts',
    factory: () => {
      throw new Error('Connection failed: database host unreachable');
    },
    options: { required: true, lazy: false },
  });

  let threw = null;
  try {
    await createApp();
  } catch (err) {
    threw = err;
  }

  assert.notEqual(threw, null, 'Criterio 1 fallido: createApp no rechazó cuando la factory falló');
  assert.equal(
    threw.code,
    'ALIAS_FACTORY_FAILED',
    'Criterio 1 fallido: se esperaba ALIAS_FACTORY_FAILED pero se recibió ' + threw.code,
  );
  assert(
    threw.message.includes('Connection failed: database host unreachable'),
    'Criterio 1 fallido: el mensaje no incluye la causa original accionable: ' + threw.message,
  );
  process.stdout.write('CHECK 1 PASSED: required: true + failing factory rejects createApp with ALIAS_FACTORY_FAILED\\n');
}

// ── Criterios 2 y 3: lazy: false ejecuta exactamente una vez tras createApp; lazy: true ejecuta 0 veces ──
{
  const runtime = getAliasRuntime();
  runtime._reset();

  // Reset counters
  globalThis.__lifecycleCounts = { eager: 0, lazy: 0 };
  globalThis.__disposeLog = [];

  // Import the file declaring the identifiers
  await import('./src/infra/lifecycle.client.ts');

  // Before createApp: factories have not run
  assert.equal(globalThis.__lifecycleCounts.eager, 0);
  assert.equal(globalThis.__lifecycleCounts.lazy, 0);

  // Run createApp (which executes Step 06b eager resolution)
  await createApp();

  // Criterio 2: lazy: false corrió exactamente una vez
  assert.equal(
    globalThis.__lifecycleCounts.eager,
    1,
    'Criterio 2 fallido: eager factory no corrió exactamente 1 vez tras createApp (count: ' + globalThis.__lifecycleCounts.eager + ')',
  );

  // Criterio 3: lazy: true corrió 0 veces tras createApp
  assert.equal(
    globalThis.__lifecycleCounts.lazy,
    0,
    'Criterio 3 fallido: lazy factory no debería haber corrido tras createApp (count: ' + globalThis.__lifecycleCounts.lazy + ')',
  );

  // Posterior import de lazy: ejecuta por primera vez
  const { default: lazyInstance } = await import('@client/lazy-client');
  assert.equal(lazyInstance.role, 'lazy');
  assert.equal(
    globalThis.__lifecycleCounts.lazy,
    1,
    'Criterio 3 fallido: lazy factory no corrió tras el primer import (count: ' + globalThis.__lifecycleCounts.lazy + ')',
  );

  // Segundo import de lazy: memoizado, no re-ejecuta
  const { default: lazyInstance2 } = await import('@client/lazy-client');
  assert.equal(lazyInstance2, lazyInstance);
  assert.equal(globalThis.__lifecycleCounts.lazy, 1);

  // Posterior import de eager: memoizado, no re-ejecuta
  const { default: eagerInstance } = await import('@client/eager-client');
  assert.equal(eagerInstance.role, 'eager');
  assert.equal(globalThis.__lifecycleCounts.eager, 1);

  process.stdout.write('CHECK 2 PASSED: lazy: false executes exactly once when createApp finishes\\n');
  process.stdout.write('CHECK 3 PASSED: lazy: true has zero executions after createApp, one after first import\\n');
}

// ── Criterio 4: timeout: 50 con factory de 200ms -> ALIAS_FACTORY_TIMEOUT ──
{
  const runtime = getAliasRuntime();
  runtime._reset();

  runtime.declare({
    prefix: 'client',
    name: 'slow-hang',
    filePath: '/infra/slow.ts',
    factory: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 200)),
    options: { timeout: 50, required: true, lazy: true },
  });

  let timeoutErr = null;
  try {
    await runtime.get('client/slow-hang');
  } catch (err) {
    timeoutErr = err;
  }

  assert.notEqual(timeoutErr, null, 'Criterio 4 fallido: no lanzó timeout');
  assert.equal(
    timeoutErr.code,
    'ALIAS_FACTORY_TIMEOUT',
    'Criterio 4 fallido: se esperaba ALIAS_FACTORY_TIMEOUT pero se recibió ' + timeoutErr.code,
  );
  process.stdout.write('CHECK 4 PASSED: timeout: 50 with 200ms factory produces ALIAS_FACTORY_TIMEOUT\\n');
}

// ── Criterio 5: dispose se llama una vez por alias resuelto en orden inverso, nunca para los no resueltos ──
{
  const runtime = getAliasRuntime();
  runtime._reset();

  const disposeLog = [];

  // Alias 1 resolved first
  runtime.declare({
    prefix: 'client',
    name: 'first-resolved',
    filePath: '/first.ts',
    factory: () => ({ name: 'first' }),
    options: {
      dispose: () => { disposeLog.push('first-resolved'); },
    },
  });

  // Alias 2 resolved second
  runtime.declare({
    prefix: 'client',
    name: 'second-resolved',
    filePath: '/second.ts',
    factory: () => ({ name: 'second' }),
    options: {
      dispose: () => { disposeLog.push('second-resolved'); },
    },
  });

  // Alias 3 never resolved (lazy: true and never called)
  runtime.declare({
    prefix: 'client',
    name: 'never-resolved-lazy',
    filePath: '/never.ts',
    factory: () => ({ name: 'never' }),
    options: {
      lazy: true,
      dispose: () => { disposeLog.push('never-resolved-lazy'); },
    },
  });

  // Alias 4 failed to resolve (required: false)
  runtime.declare({
    prefix: 'client',
    name: 'never-resolved-failed',
    filePath: '/failed.ts',
    factory: () => { throw new Error('failed'); },
    options: {
      required: false,
      dispose: () => { disposeLog.push('never-resolved-failed'); },
    },
  });

  // Resolve 1 then 2
  await runtime.get('client/first-resolved');
  await runtime.get('client/second-resolved');
  await runtime.get('client/never-resolved-failed'); // returns undefined, never resolved

  // Run disposeAll()
  await runtime.disposeAll();

  // Must be LIFO: second-resolved first, then first-resolved
  assert.deepEqual(
    disposeLog,
    ['second-resolved', 'first-resolved'],
    'Criterio 5 fallido: el orden de dispose no fue LIFO inverso o incluyó aliases no resueltos: ' + JSON.stringify(disposeLog),
  );

  // Calling disposeAll() again does not re-dispose (called exactly once)
  await runtime.disposeAll();
  assert.equal(
    disposeLog.length,
    2,
    'Criterio 5 fallido: dispose llamado más de una vez por alias',
  );

  process.stdout.write('CHECK 5 PASSED: dispose called once per resolved alias in reverse order, never for uncompleted ones\\n');
}

process.stdout.write('ALL 5 LIFECYCLE ACCEPTANCE CRITERIA PASSED!\\n');
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
      expect(out).toContain('ALL 5 LIFECYCLE ACCEPTANCE CRITERIA PASSED!')
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // ignore cleanup error
      }
    }
  })
})
