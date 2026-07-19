// src/adapters/node-cron.ts
import { KerithError } from '@kerith/core'

export async function loadNodeCron(): Promise<typeof import('node-cron')> {
  try {
    return await import('node-cron')
  } catch {
    throw new KerithError(
      'MISSING_PEER_DEPENDENCY',
      `Cron() requires 'node-cron' to be installed.\nRun: pnpm add node-cron`,
    )
  }
}
