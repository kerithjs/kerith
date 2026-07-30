// tests/events-message.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetAllChannels, getBindingPlugins } from '../src/channels/index.js'

vi.mock('@kerith/core', () => ({
  getFileCallerInfo: (_name: string) => ({ filePath: '/mock/test-file.ts' }),
}))

const { Message } = await import('../src/events/message.js')

beforeEach(() => {
  _resetAllChannels()
})

describe('Message() — Binding channel', () => {
  it('registers exactly one BindingPlugin', () => {
    Message('user.created', () => {})
    expect(getBindingPlugins()).toHaveLength(1)
  })

  it('sets the correct name and kind: "message"', () => {
    Message('user.created', () => {})
    const plugin = getBindingPlugins()[0]
    expect(plugin.name).toBe('user.created')
    expect(plugin.kind).toBe('message')
  })

  it('stores handler and options in opaque bind data', () => {
    const fn = vi.fn()
    const options = { group: 'notifications', retries: 3 }
    
    Message('user.created', fn, options)
    
    const plugin = getBindingPlugins()[0]
    const bindData = plugin.bind as { handler: (...args: any[]) => any, options: any }
    
    expect(bindData.handler).toBe(fn)
    expect(bindData.options).toEqual(options)
  })

  it('accepts call without options argument', () => {
    expect(() => Message('user.created', () => {})).not.toThrow()
    
    const plugin = getBindingPlugins()[0]
    const bindData = plugin.bind as { handler: (...args: any[]) => any, options: any }
    expect(bindData.options).toEqual({}) // Defaults to {}
  })

  it('registers multiple independent messages', () => {
    Message('user.created', () => {})
    Message('order.placed', () => {})
    expect(getBindingPlugins()).toHaveLength(2)
  })
})
