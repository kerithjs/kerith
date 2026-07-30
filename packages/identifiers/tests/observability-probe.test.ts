// tests/observability-probe.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetAllChannels, getSchedulePlugins } from '../src/channels/index.js'

vi.mock('@kerith/core', () => ({
  getFileCallerInfo: (_name: string) => ({ filePath: '/mock/test-file.ts' }),
}))

const { Probe } = await import('../src/observability/probe.js')

beforeEach(() => {
  _resetAllChannels()
})

describe('Probe() — Schedule channel', () => {
  it('registers exactly one SchedulePlugin', () => {
    Probe('memory', () => true)
    expect(getSchedulePlugins()).toHaveLength(1)
  })

  it('prefixes the name with "probe:"', () => {
    Probe('memory', () => true)
    expect(getSchedulePlugins()[0].name).toBe('probe:memory')
  })

  it('sets timing to "on-listen" (unlike HealthCheck which is "after-bootstrap")', () => {
    Probe('memory', () => true)
    expect(getSchedulePlugins()[0].timing).toBe('on-listen')
  })

  it('execute() invokes the provided check function', async () => {
    const checkFn = vi.fn().mockResolvedValue(true)
    Probe('memory', checkFn)

    const plugin = getSchedulePlugins()[0]
    await plugin.execute()

    expect(checkFn).toHaveBeenCalledOnce()
  })

  it('registers multiple independent probes', () => {
    Probe('memory', () => true)
    Probe('cpu', () => true)
    expect(getSchedulePlugins()).toHaveLength(2)
  })
})
