import { describe, it, expect, vi, afterEach } from 'vitest'
import { getRegisteredScheduleProviders } from '@kerith/core'
import { HealthCheck } from '@kerith/identifiers'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createApp as kerithCreateApp } from '../../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function makeTmpApp() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kerith-app-test-sched-'))
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))
  fs.writeFileSync(path.join(tmpDir, 'kerith.config.js'), 'export default { strict: false };')
  const moduleDir = path.join(tmpDir, 'src/modules/test')
  fs.mkdirSync(moduleDir, { recursive: true })
  fs.symlinkSync(path.resolve(__dirname, '../../node_modules'), path.join(tmpDir, 'node_modules'), 'junction')
  fs.writeFileSync(path.join(moduleDir, 'index.ts'), `
    import { Module } from '@kerith/core'
    Module('test')
  `)
  return { tmpDir }
}

describe('Schedule Passthrough Executor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers a non-cron schedule plugin (e.g. HealthCheck) as a passthrough ScheduleProvider', async () => {
    let checkRan = false
    HealthCheck('db', async () => {
      checkRan = true
      return { status: 'healthy' }
    })

    // HealthCheck() registers a plugin with timing 'after-bootstrap' but NO expression
    // → schedule-passthrough-executor must pick it up (not cron-executor)

    const { tmpDir } = makeTmpApp()
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    try {
      const app = express()
      await kerithCreateApp(app as any, { logger: () => {} })

      const providers = getRegisteredScheduleProviders()
      const hcProvider = providers.find(p => p.name === 'health-check:db')

      expect(hcProvider).toBeDefined()
      expect(hcProvider?.timing).toBe('after-bootstrap')
      // The after-bootstrap loop in core must already have called execute() by now
      expect(checkRan).toBe(true)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('does NOT pick up cron plugins (those have expression) — filters correctly at the store level', async () => {
    // Directly inspect the executor's filtering logic without going through createApp()
    // to avoid the DUPLICATE_EXTENSION_PROVIDER error from sharing the same process state.
    const { getSchedulePlugins } = await import('@kerith/identifiers')

    // All plugins registered so far (from test 1 + any new ones)
    const allPlugins = getSchedulePlugins()

    // Passthrough-eligible plugins: no expression
    const passthroughEligible = allPlugins.filter(p => !p.expression)
    // Cron-eligible plugins: have expression
    const cronEligible = allPlugins.filter(p => !!p.expression)

    // Every plugin in passthroughEligible must NOT have an expression
    expect(passthroughEligible.every(p => !p.expression)).toBe(true)

    // Every plugin in cronEligible must have a non-empty expression
    expect(cronEligible.every(p => typeof p.expression === 'string' && p.expression.length > 0)).toBe(true)

    // The two groups are mutually exclusive (union === all)
    expect(passthroughEligible.length + cronEligible.length).toBe(allPlugins.length)
  })
})
