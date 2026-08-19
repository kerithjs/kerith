# 01-minimal-app

Ejercita el arranque mínimo con la plantilla `@kerith/app`:

- Boot limpio con pre-loader (incluye `@kerith/identifiers`)
- Módulo `health` → `GET /health` devuelve `200 { status: "ok" }`
- Módulo `home` → `GET /` devuelve `200` con texto plano
- Parada limpia vía `SIGTERM` (verifica que `onShutdown` se ejecuta)
