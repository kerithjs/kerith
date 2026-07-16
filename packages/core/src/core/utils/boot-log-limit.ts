import type { LogLevel } from '../../types/index.js';

/**
 * Hard cap on how many bootstrap "loaded"/"mounted" lines (domains, modules,
 * routes) are printed to the terminal at `info` level before the rest gets
 * collapsed into a single summary line.
 *
 * This is intentionally a fixed constant, not a config option:
 * - Want to see every single line? Run with `logLevel: 'debug'`
 *   (or `KERITH_LOG_LEVEL=debug` / `NODE_DEBUG=kerith`).
 * - Want a full architectural report instead of boot noise? Use `kerith check`.
 *
 * Making this configurable would just let every project quietly raise the
 * limit as it grows, which defeats the point of capping terminal output in
 * the first place. Debug mode and `kerith check` already cover the two real
 * reasons someone would want more than a glance at boot time.
 */
export const BOOT_LOG_LIMIT = 3;

/**
 * Counts "loaded"/"mounted" entities during bootstrap and decides whether an
 * individual line should be printed now or silently rolled into the trailing
 * summary line (`... and N more <thing>(s) (total: X)`).
 *
 * Entirely bypassed (unlimited) when `logLevel` is `'debug'` — debug mode is
 * the intentional escape hatch for seeing every line.
 *
 * Usage:
 * ```ts
 * const gate = new BootLogGate(config.logLevel);
 * for (const domain of domains) {
 *   if (gate.next()) {
 *     log.info(`Domain loaded: ${domain.name}`);
 *   }
 * }
 * if (gate.hasOverflow) {
 *   log.info(`... and ${gate.overflow} more domain(s) loaded (total: ${gate.total})`);
 * }
 * ```
 */
export class BootLogGate {
  private count = 0;
  private readonly unlimited: boolean;

  constructor(logLevel: LogLevel) {
    this.unlimited = logLevel === 'debug';
  }

  /**
   * Call once per entity encontrada (dominio, módulo o ruta).
   * Devuelve `true` si esta entidad puntual debe imprimirse ahora.
   */
  next(): boolean {
    this.count += 1;
    return this.unlimited || this.count <= BOOT_LOG_LIMIT;
  }

  /** Total de entidades vistas hasta ahora. */
  get total(): number {
    return this.count;
  }

  /** Cuántas entidades quedaron por encima del cap (0 si está dentro del límite o es ilimitado). */
  get overflow(): number {
    return this.unlimited ? 0 : Math.max(0, this.count - BOOT_LOG_LIMIT);
  }

  /** Si corresponde imprimir la línea de resumen final. */
  get hasOverflow(): boolean {
    return this.overflow > 0;
  }
}
