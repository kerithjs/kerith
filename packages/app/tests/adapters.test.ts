// tests/adapters.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('loadBullMQ()', () => {
  it('throws MISSING_PEER_DEPENDENCY if bullmq is not installed', async () => {
    vi.doMock('bullmq', () => { throw new Error('not found') })
    const { loadBullMQ } = await import('../src/adapters/bullmq.js')
    await expect(loadBullMQ()).rejects.toThrow(/bullmq/i)
  })
})

describe('loadNodeCron()', () => {
  it('throws MISSING_PEER_DEPENDENCY if node-cron is not installed', async () => {
    vi.doMock('node-cron', () => { throw new Error('not found') })
    const { loadNodeCron } = await import('../src/adapters/node-cron.js')
    await expect(loadNodeCron()).rejects.toThrow(/node-cron/i)
  })
})
