# 🦋 Changesets

Kerith usa [Changesets](https://github.com/changesets/changesets) para versionar y publicar los paquetes del monorepo de forma independiente.

## ¿Cómo agregar un changeset?

Cuando hacés un cambio que afecta uno o más paquetes publicables, corré:

```bash
pnpm changeset
```

Esto abre un wizard que te pregunta:
1. **¿Qué paquetes cambiaron?** — seleccionás con espacio
2. **¿Es un cambio major, minor o patch?** — según semver
3. **Escribís un resumen** del cambio (va al CHANGELOG del paquete)

El wizard genera un archivo `.md` en esta carpeta. Lo commiteás junto con tu PR.

## Paquetes publicables

| Paquete | npm |
|---|---|
| `@kerith/core` | [![npm](https://img.shields.io/npm/v/@kerith/core)](https://npmjs.com/package/@kerith/core) |
| `@kerith/identifiers` | [![npm](https://img.shields.io/npm/v/@kerith/identifiers)](https://npmjs.com/package/@kerith/identifiers) |
| `@kerith/eslint-plugin` | [![npm](https://img.shields.io/npm/v/@kerith/eslint-plugin)](https://npmjs.com/package/@kerith/eslint-plugin) |
| `@kerith/app` | [![npm](https://img.shields.io/npm/v/@kerith/app)](https://npmjs.com/package/@kerith/app) |
| `create-kerith` | [![npm](https://img.shields.io/npm/v/create-kerith)](https://npmjs.com/package/create-kerith) |

> `@kerith/testing` es interno y está ignorado por Changesets.

## Flujo completo

```
develop branch
  ↓  (PR con changeset)
main branch
  ↓  (Changesets Action abre PR automático con versiones bumpeadas)
"Version Packages" PR
  ↓  (merge)
main branch → publica SOLO los paquetes con changesets pendientes
```

## Tipos de bump (semver)

- **patch** `1.0.0 → 1.0.1` — bugfixes, correcciones internas
- **minor** `1.0.0 → 1.1.0` — nuevas features retrocompatibles
- **major** `1.0.0 → 2.0.0` — breaking changes

## Prereleases

Para publicar alphas/betas manualmente desde develop:

```bash
pnpm changeset pre enter alpha
pnpm changeset version
pnpm changeset publish
pnpm changeset pre exit
```

