import fs from 'node:fs';
import type { BootstrapCache } from './bootstrap-cache.js';

export interface MtimeValidationResult {
  toRescan: string[];        // domain IDs that need to be rescanned
}

export function getModuleSignature(files: string[]): { maxMtime: number; totalSize: number } {
  let maxMtime = 0;
  let totalSize = 0;

  for (const file of files) {
    try {
      const stats = fs.statSync(file);
      if (stats.mtimeMs > maxMtime) {
        maxMtime = stats.mtimeMs;
      }
      totalSize += stats.size;
    } catch (e) {
      // If a file does not exist or cannot be accessed, mark as dirty immediately
      return { maxMtime: Infinity, totalSize: -1 };
    }
  }

  return { maxMtime, totalSize };
}

export const MtimeValidator = {
  validate(cache: BootstrapCache): MtimeValidationResult {
    const toRescanSet = new Set<string>();

    // First pass: identify all dirty domains
    // Nota (PT3-2): Los submodules no se iteran directamente aquí. Esto es intencional.
    // Los archivos físicos de los submodules están dentro del directorio del módulo padre.
    // En createApp.ts, el agrupador de `filesByModulePath` asigna por prefijo de ruta,
    // por lo que los archivos del submodule quedan incluidos en `module.files` del padre.
    // Un cambio en un submodule invalidará correctamente al padre y a su dominio.
    for (const module of cache.data!.modules) {
      const { maxMtime, totalSize } = getModuleSignature(module.files);
      const domainKey = module.domain || '__flat__';

      if (maxMtime !== module.cachedMtime || totalSize !== module.cachedSize) {
        toRescanSet.add(domainKey);
      }
    }

    return {
      toRescan: Array.from(toRescanSet),
    };
  },
};
