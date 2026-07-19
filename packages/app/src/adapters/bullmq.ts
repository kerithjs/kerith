// src/adapters/bullmq.ts
import { KerithError } from '@kerith/core'

export async function loadBullMQ(): Promise<typeof import('bullmq')> {
  try {
    return await import('bullmq')
  } catch {
    throw new KerithError(
      'MISSING_PEER_DEPENDENCY',
      `This identifier requires 'bullmq' to be installed.\nRun: pnpm add bullmq`,
    )
  }
}
