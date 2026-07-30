// tests/observability-health-check.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetAllChannels, getSchedulePlugins } from '../src/channels/index.js'

vi.mock('@kerith/core', () => ({
  getFileCallerInfo: (_name: string) => ({ filePath: '/mock/test-file.ts' }),
}))

const { HealthCheck } = await import('../src/observability/health-check.js')

beforeEach(() => {
  _resetAllChannels()
})

describe('HealthCheck() — Schedule channel', () => {
  it('registers exactly one SchedulePlugin', () => {
    HealthCheck('db', () => ({ status: 'healthy' }))
    expect(getSchedulePlugins()).toHaveLength(1)
  })

  it('prefixes the name with "health-check:"', () => {
    HealthCheck('db', () => ({ status: 'healthy' }))
    expect(getSchedulePlugins()[0].name).toBe('health-check:db')
  })

  it('sets timing to "after-bootstrap"', () => {
    HealthCheck('db', () => ({ status: 'healthy' }))
    expect(getSchedulePlugins()[0].timing).toBe('after-bootstrap')
  })

  it('execute() invokes the provided check function', async () => {
    const checkFn = vi.fn().mockResolvedValue({ status: 'healthy' })
    HealthCheck('db', checkFn)

    const plugin = getSchedulePlugins()[0]
    await plugin.execute()

    expect(checkFn).toHaveBeenCalledOnce()
  })

  it('registers multiple independent health checks', () => {
    HealthCheck('db', () => ({ status: 'healthy' }))
    HealthCheck('redis', () => ({ status: 'healthy' }))
    expect(getSchedulePlugins()).toHaveLength(2)
  })
})
