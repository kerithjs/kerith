# 02-full-surface-core

Ejercita la superficie completa de identifiers de `@kerith/core` en una sola app:

- Jerarquía `Domain` (`ecommerce`) → `SubModule` (`catalog`) → `Module` (`products`, `orders`)
- Uso de `Controller`, `Service`, `Repository` y `Schema` en el mismo árbol
- Import cruzado entre módulos vía alias `@modules/catalog`
- Consumo de `src/shared/` vía alias `@shared/utils.js` (función `getSharedPrefix`)
- Test del recorrido completo: Controller → Service → Repository → Schema → respuesta HTTP
- Verificación de que los NITS IDs son estables entre dos boots secuenciales (idempotencia)
- Snapshot de `.kerith/registry.json` commiteado como baseline
