// tests/workers-worker.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetAllChannels, getBindingPlugins } from '../src/channels/index.js'

vi.mock('@kerith/core', () => ({
  getFileCallerInfo: (_name: string) => ({ filePath: '/mock/test-file.ts' }),
}))

const { Worker } = await import('../src/workers/worker.js')

beforeEach(() => {
  _resetAllChannels()
})

describe('Worker() — Binding channel', () => {
  it('registers exactly one BindingPlugin', () => {
    Worker('email', () => {})
    expect(getBindingPlugins()).toHaveLength(1)
  })

  it('sets the correct name and kind: "worker"', () => {
    Worker('email', () => {})
    const plugin = getBindingPlugins()[0]
    expect(plugin.name).toBe('email')
    expect(plugin.kind).toBe('worker')
  })

  it('stores handler and options in opaque bind data', () => {
    const fn = vi.fn()
    const options = { concurrency: 5, retryOnFail: true }
    
    Worker('email', fn, options)
    
    const plugin = getBindingPlugins()[0]
    const bindData = plugin.bind as { handler: (...args: any[]) => any, options: any }
    
    expect(bindData.handler).toBe(fn)
    expect(bindData.options).toEqual(options)
  })

  it('accepts call without options argument', () => {
    expect(() => Worker('email', () => {})).not.toThrow()
    
    const plugin = getBindingPlugins()[0]
    const bindData = plugin.bind as { handler: (...args: any[]) => any, options: any }
    expect(bindData.options).toEqual({}) // Defaults to {}
  })

  it('registers multiple independent workers', () => {
    Worker('email', () => {})
    Worker('thumbnail', () => {})
    expect(getBindingPlugins()).toHaveLength(2)
  })
})
