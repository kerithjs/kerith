// src/runtime/infrastructure-context.ts
import type { InfrastructureOptions } from '../adapters/redis-connection.js'

let currentOptions: InfrastructureOptions | undefined

export function setInfrastructureOptions(options?: InfrastructureOptions) {
  currentOptions = options
}

export function getInfrastructureOptions(): InfrastructureOptions | undefined {
  return currentOptions
}
