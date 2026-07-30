// tests/realtime-stream.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetAllChannels, getBindingPlugins } from '../src/channels/index.js'

vi.mock('@kerith/core', () => ({
  getFileCallerInfo: (_name: string) => ({ filePath: '/mock/test-file.ts' }),
}))

const { Stream } = await import('../src/realtime/stream.js')

beforeEach(() => {
  _resetAllChannels()
})

describe('Stream() — Binding channel', () => {
  it('registers exactly one BindingPlugin', () => {
    Stream('audio-chunks', () => {})
    expect(getBindingPlugins()).toHaveLength(1)
  })

  it('sets the correct name and kind: "stream"', () => {
    Stream('audio-chunks', () => {})
    const plugin = getBindingPlugins()[0]
    expect(plugin.name).toBe('audio-chunks')
    expect(plugin.kind).toBe('stream')
  })

  it('stores handler and options in opaque bind data', () => {
    const fn = vi.fn()
    const options = { backpressure: true }
    
    Stream('audio-chunks', fn, options)
    
    const plugin = getBindingPlugins()[0]
    const bindData = plugin.bind as { handler: (...args: any[]) => any, options: any }
    
    expect(bindData.handler).toBe(fn)
    expect(bindData.options).toEqual(options)
  })

  it('accepts call without options argument', () => {
    expect(() => Stream('audio-chunks', () => {})).not.toThrow()
    
    const plugin = getBindingPlugins()[0]
    const bindData = plugin.bind as { handler: (...args: any[]) => any, options: any }
    expect(bindData.options).toEqual({}) // Defaults to {}
  })

  it('registers multiple independent streams', () => {
    Stream('audio-chunks', () => {})
    Stream('video-frames', () => {})
    expect(getBindingPlugins()).toHaveLength(2)
  })
})
