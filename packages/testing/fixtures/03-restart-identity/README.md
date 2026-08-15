# 03-restart-identity

Verifica la **idempotencia de NITS IDs** entre reinicios independientes del proceso:

- App con `Domain` (`commerce`) → `SubModule` (`catalog`) + `Module` directo (`store`)
- Módulo `health`
- Dos boots secuenciales como procesos Node separados (no reutiliza el mismo proceso)
- Test: `dom_*` y `mod_*` IDs son idénticos entre ambos boots (`createdAt` y `hash` estables)
- Test: los IDs del registry de dominio también son estables entre boots
- El snapshot de `.kerith/registry.json` se commitea como línea base
