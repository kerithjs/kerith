// tests/channels.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerAliasPlugin,
  registerMiddlewarePlugin,
  registerSchedulePlugin,
  registerBindingPlugin,
  getAliasPlugins,
  getMiddlewarePlugins,
  getSchedulePlugins,
  getBindingPlugins,
  _resetAllChannels,
} from '../src/channels/index.js'

beforeEach(() => {
  _resetAllChannels()
})

describe('alias channel', () => {
  it('registers and returns plugins', () => {
    const plugin = { prefix: 'client', name: 'db', filePath: '/x.ts', resolve: () => ({}) }
    registerAliasPlugin(plugin)
    expect(getAliasPlugins()).toHaveLength(1)
    expect(getAliasPlugins()[0].name).toBe('db')
  })

  it('returns copy — not the internal reference', () => {
    registerAliasPlugin({ prefix: 'client', name: 'x', filePath: '/x.ts', resolve: () => ({}) })
    const a = getAliasPlugins()
    const b = getAliasPlugins()
    expect(a).not.toBe(b)
  })
})

describe('middleware channel', () => {
  it('avoids duplicates of the same object', () => {
    const plugin = { phase: 'pre' as const, priority: 1, getHandlers: () => [] }
    registerMiddlewarePlugin(plugin)
    registerMiddlewarePlugin(plugin) // same object
    expect(getMiddlewarePlugins()).toHaveLength(1)
  })

  it('allows multiple distinct plugins', () => {
    registerMiddlewarePlugin({ phase: 'pre', priority: 1, getHandlers: () => [] })
    registerMiddlewarePlugin({ phase: 'pre', priority: 2, getHandlers: () => [] })
    expect(getMiddlewarePlugins()).toHaveLength(2)
  })
})

describe('schedule channel', () => {
  it('registers multiple independent schedules', () => {
    registerSchedulePlugin({ name: 'a', timing: 'after-bootstrap', execute: () => {} })
    registerSchedulePlugin({ name: 'b', timing: 'after-bootstrap', execute: () => {} })
    expect(getSchedulePlugins()).toHaveLength(2)
  })
})

describe('binding channel', () => {
  it('registers binding plugins', () => {
    registerBindingPlugin({ name: 'my-worker', kind: 'worker', bind: {} })
    expect(getBindingPlugins()).toHaveLength(1)
    expect(getBindingPlugins()[0].kind).toBe('worker')
  })
})
