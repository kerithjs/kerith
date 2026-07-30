// tests/workers-cron.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetAllChannels, getSchedulePlugins } from '../src/channels/index.js'

vi.mock('@kerith/core', () => ({
  getFileCallerInfo: (_name: string) => ({ filePath: '/mock/test-file.ts' }),
}))

const { Cron } = await import('../src/workers/cron.js')

beforeEach(() => {
  _resetAllChannels()
})

describe('Cron() — Schedule channel', () => {
  it('registers exactly one SchedulePlugin', () => {
    Cron('daily', '0 0 * * *', () => {})
    expect(getSchedulePlugins()).toHaveLength(1)
  })

  it('prefixes the name with "cron:"', () => {
    Cron('daily', '0 0 * * *', () => {})
    expect(getSchedulePlugins()[0].name).toBe('cron:daily')
  })

  it('sets timing to "after-bootstrap"', () => {
    Cron('daily', '0 0 * * *', () => {})
    expect(getSchedulePlugins()[0].timing).toBe('after-bootstrap')
  })

  it('passes the expression string verbatim', () => {
    Cron('daily', '*/5 * * * *', () => {})
    expect(getSchedulePlugins()[0].expression).toBe('*/5 * * * *')
  })

  it('keeps exact reference to the execution function', () => {
    const fn = vi.fn()
    Cron('daily', '0 0 * * *', fn)
    expect(getSchedulePlugins()[0].execute).toBe(fn)
  })

  it('does not throw when an invalid expression is provided (validation deferred to app)', () => {
    expect(() => Cron('invalid', 'this is not a cron', () => {})).not.toThrow()
    expect(getSchedulePlugins()[0].expression).toBe('this is not a cron')
  })

  it('accepts options argument', () => {
    expect(() => Cron('daily', '0 0 * * *', () => {}, { runOnInit: true })).not.toThrow()
  })

  it('registers multiple independent crons', () => {
    Cron('a', '* * * * *', () => {})
    Cron('b', '* * * * *', () => {})
    expect(getSchedulePlugins()).toHaveLength(2)
  })
})
