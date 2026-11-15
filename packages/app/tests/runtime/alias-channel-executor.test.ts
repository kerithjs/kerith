import { describe, it, expect, vi, afterEach } from 'vitest'
import { createApp } from '../../src/index.js'
import { Client } from '@kerith/identifiers'
import { getRegisteredAliasProviders, getAliasRuntime } from '@kerith/core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execSync } from 'node:child_process'
import express from 'express'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Absolute path to @kerith/app source — used by the spawned Node process.
// We resolve it once at module load time so the E2E script can import it.
const KERITH_APP_SRC = path.resolve(__dirname, '../../src/index.ts')

describe('Alias Channel Executor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers Client() alias provider and resolve() returns the factory value', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-app-test-alias-'))

    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))
    fs.writeFileSync(path.join(tmpDir, 'kerith.config.js'), 'export default { strict: false };')

    const moduleDir = path.join(tmpDir, 'src/modules/test')
    fs.mkdirSync(moduleDir, { recursive: true })

    fs.symlinkSync(
      path.resolve(__dirname, '../../node_modules'),
      path.join(tmpDir, 'node_modules'),
      'junction',
    )

    fs.writeFileSync(path.join(moduleDir, 'index.ts'), `
      import { Module } from '@kerith/core'
      Module('test')
    `)

    // Register Client('database', factory) in this test process.
    // executeAliasChannel() will pick this up when createApp() runs.
    const factory = () => ({ connection: 'mock-db-connection' })
    Client('database', factory)

    // lazy: true must NOT be resolved during bootstrap (Step 06b).
    let lazyCalls = 0
    Client('lazy-database', () => { lazyCalls++; return { lazy: true } }, { lazy: true })

    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    try {
      const app = express()
      await createApp(app as any, { logger: () => {} })

      // ── 1. Provider registration check ─────────────────────────────────────
      // After createApp() the executor must have called registerAliasProvider()
      const providers = getRegisteredAliasProviders()
      const dbProvider = providers.find(p => p.prefix === 'client' && p.name === 'database')

      expect(dbProvider).toBeDefined()
      expect(dbProvider?.prefix).toBe('client')
      expect(dbProvider?.name).toBe('database')

      // ── 2. Real resolution check ────────────────────────────────────────────
      // The spec says: "un import real @client/database en otro archivo del mismo boot,
      // confirmando que resuelve al archivo correcto."
      //
      // The resolve() function IS the factory — calling it simulates what Core's
      // alias loader does when another file does `import('@client/database')`.
      // We verify the factory reference passes through unchanged so the loader
      // can invoke it to get the real instance.
      expect(dbProvider?.resolve()).toEqual({ connection: 'mock-db-connection' })
      // Calling resolve() twice must return identical values (factory is pure)
      expect(dbProvider?.resolve()).toEqual(dbProvider?.resolve())

      // ── 3. Step 06b — eager resolution semantics ───────────────────────────
      // lazy defaults to false → createApp() must have resolved the alias
      // during bootstrap, without importing '@client/database'.
      const runtime = getAliasRuntime()
      expect(runtime.instances.get('client/database')).toEqual({
        connection: 'mock-db-connection',
      })
      // lazy: true → skipped during bootstrap; factory not invoked yet.
      expect(runtime.instances.has('client/lazy-database')).toBe(false)
      expect(lazyCalls).toBe(0)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  /**
   * End-to-end test: a REAL `import('@client/database')` inside another file of
   * the same boot resolves to the correct module.
   *
   * Why a spawned process?
   * Vitest intercepts Node's ESM loader, so dynamic imports in the test process
   * bypass the custom resolve hook that Kerith registers via `node:module`
   * `register()`. Spawning a real Node (tsx) process exercises the hook end-to-end.
   *
   * The spawned script self-contains the full boot cycle:
   *   1. A module file registers Client('database', factory).
   *   2. createApp() is called → executeAliasChannel() registers the alias provider
   *      → activateAliasResolver() registers the ESM hook via register().
   *   3. A dynamic import('@client/database') is resolved by the hook → returns
   *      the factory module → resolve() returns { connection: 'mock-db-connection' }.
   */
  it('resolves @client/database via real ESM import in a separate module file (e2e)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-app-test-alias-e2e-'))

    try {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))
      fs.writeFileSync(path.join(tmpDir, 'kerith.config.js'), 'export default { strict: false };')

      const moduleDir = path.join(tmpDir, 'src/modules/test')
      fs.mkdirSync(moduleDir, { recursive: true })

      fs.symlinkSync(
        path.resolve(__dirname, '../../node_modules'),
        path.join(tmpDir, 'node_modules'),
        'junction',
      )

      // Module index — required by Kerith
      fs.writeFileSync(path.join(moduleDir, 'index.ts'), `
        import { Module } from '@kerith/core'
        Module('test')
      `)

      // "Another file in the same boot" — this is the file that calls Client() and
      // will later be imported as @client/database.
      // Notice: It does NOT export dbMock as default! Level 1 virtual module returns
      // the instantiated factory value directly as default export.
      const dbFilePath = path.join(moduleDir, 'database.ts')
      fs.writeFileSync(dbFilePath, `
        import { Client } from '@kerith/identifiers'
        
        const dbMock = { connection: 'mock-db-connection' }
        
        // Declare the alias. No export default!
        Client('database', () => dbMock)
        
        export const otherExport = 'unrelated'
      `)

      // The E2E boot script — runs entirely inside the spawned process.
      // It must NOT import KERITH_APP_SRC from outside; it imports it freshly.
      const e2eScript = path.join(tmpDir, 'e2e.mjs')
      fs.writeFileSync(e2eScript, `
        // tsx handles .ts imports for us
        import { createApp } from ${JSON.stringify(pathToFileURL(KERITH_APP_SRC).href)}
        import express from 'express'

        // Step 1 — import the module that declares Client('database', ...)
        // This is "another file in the same boot" as the spec requires.
        await import(${JSON.stringify(pathToFileURL(dbFilePath).href)})

        // Step 2 — boot the app; this triggers executeAliasChannel() which calls
        // registerAliasProvider() and then activateAliasResolver() (via Core's
        // step-05-aliases) which registers the ESM resolve hook.
        const app = express()
        await createApp(app, { logger: () => {} })

        // Step 3 — real import using the alias specifier.
        // The hook registered in step 2 must intercept '@client/database'
        // and redirect it to the actual file that exported dbMock above.
        const { default: db } = await import('@client/database')

        if (!db || db.connection !== 'mock-db-connection') {
          process.stderr.write('FAIL: resolved value mismatch: ' + JSON.stringify(db) + '\\n')
          process.exit(1)
        }
        process.stdout.write('SUCCESS\\n')
      `)

      // Run with tsx (handles .ts source imports) — use local binary to avoid npx cache overhead
      const tsxBin = path.resolve(__dirname, '../../node_modules/.bin/tsx')
      const tsxCmd = process.platform === 'win32' ? `${tsxBin}.cmd` : tsxBin
      const out = execSync(`"${tsxCmd}" "${e2eScript}"`, {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 30_000,
      })
      expect(out).toContain('SUCCESS')
    } catch (err: any) {
      throw new Error(
        `E2E Alias import failed:\n${err.stderr ?? ''}\n${err.stdout ?? ''}\n${err.message}`,
        { cause: err },
      )
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 30_000)
})
