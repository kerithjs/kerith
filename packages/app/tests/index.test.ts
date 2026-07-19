// tests/index.test.ts
import { describe, it, expect } from 'vitest'

describe('@kerith/app entry point', () => {
  it('registers the full catalog without throwing', async () => {
    await import('../src/index.js')
    const { getRegisteredIdentifierMetadata } = await import('@kerith/core/extension')
    expect(getRegisteredIdentifierMetadata().length).toBeGreaterThan(0)
  })
})
