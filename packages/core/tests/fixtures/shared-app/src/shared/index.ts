// @shared — recursos compartidos globales del proyecto
// Exportá desde aquí todo lo que los módulos necesiten compartir entre dominios.

/** Formats a value as a string. */
export function format(value: unknown): string {
  return String(value)
}
