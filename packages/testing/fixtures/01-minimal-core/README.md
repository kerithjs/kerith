# 01-minimal-core

Ejercita el arranque mínimo con la plantilla `@kerith/core`:

- Boot limpio con pre-loader
- Módulo `health` → `GET /health` devuelve `200 { status: "ok" }`
- Módulo `home` → `GET /` devuelve `200` con texto plano
- Parada limpia vía `SIGTERM` (verifica que `onShutdown` se ejecuta)
