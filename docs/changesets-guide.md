# Guía Definitiva de Changesets para el Monorepo Kerith

Esta guía explica en detalle cómo funciona el versionado y la publicación en el monorepo de **KerithJS** utilizando [Changesets](https://github.com/changesets/changesets), cubriendo desde el flujo de trabajo diario de desarrollo hasta releases automatizados, tags, pre-releases (`alpha`, `beta`) y resolución de incidentes.

---

## 📑 Tabla de Contenidos

1. [¿Por qué Changesets en Kerith?](#1-por-qué-changesets-en-kerith)
2. [Arquitectura de Ramas y Publicación](#2-arquitectura-de-ramas-y-publicación)
3. [Flujo de Trabajo Diario (Paso a Paso)](#3-flujo-de-trabajo-diario-paso-a-paso)
   - [3.1 ¿Cuándo crear un changeset?](#31-cuándo-crear-un-changeset)
   - [3.2 Cómo crear un changeset (`pnpm changeset`)](#32-cómo-crear-un-changeset-pnpm-changeset)
   - [3.3 Anatomía de un archivo `.changeset/*.md`](#33-anatomía-de-un-archivo-changesetmd)
4. [SemVer y Criterios de Bump](#4-semver-y-criterios-de-bump)
5. [Gestión de Pre-releases (`alpha`, `beta`, `rc`)](#5-gestión-de-pre-releases-alpha-beta-rc)
   - [5.1 Estado actual: Modo Alpha](#51-estado-actual-modo-alpha)
   - [5.2 Salir del modo pre-release hacia versión estable](#52-salir-del-modo-pre-release-hacia-versión-estable)
   - [5.3 Volver a entrar a un nuevo ciclo pre-release](#53-volver-a-entrar-a-un-nuevo-ciclo-pre-release)
6. [Automatización en CI/CD (GitHub Actions)](#6-automatización-en-cicd-github-actions)
   - [6.1 ¿Qué pasa al hacer merge en `develop`?](#61-qué-pasa-al-hacer-merge-en-develop)
   - [6.2 ¿Qué pasa al hacer merge en `main`? (PR automático)](#62-qué-pasa-al-hacer-merge-en-main-pr-automático)
   - [6.3 La publicación real a NPM con Provenance](#63-la-publicación-real-a-npm-con-provenance)
7. [Referencia de Comandos CLI](#7-referencia-de-comandos-cli)
8. [Preguntas Frecuentes y Solución de Problemas](#8-preguntas-frecuentes-y-solución-de-problemas)

---

## 1. ¿Por qué Changesets en Kerith?

En un monorepo como Kerith, coexisten varios paquetes con historias y ciclos de vida diferentes:
- `@kerith/core` (línea `2.x`)
- `@kerith/identifiers` (línea `1.x`)
- `@kerith/eslint-plugin` (línea `2.x`)
- `@kerith/app` (línea `1.x`)
- `create-kerith` (línea `1.x`)
- `@kerith/testing` (privado / herramientas internas de test)

Si intentáramos atar todo a un único tag global de Git (ej. `v2.0.0`), tendríamos que forzar versiones idénticas o publicar paquetes sin cambios.

Con Changesets logramos:
1. **Publicación atómica e independiente**: Si un commit solo modifica `@kerith/core`, únicamente se incrementa y publica `@kerith/core`.
2. **Historial y changelogs trazables**: Cada pull request aporta una intención documentada. Los changelogs individuales de cada paquete se generan de forma automática.
3. **Control total de pre-releases**: Facilidad para mantener sufijos como `-alpha.X` o `-beta.X` mientras el framework está en fase experimental.

---

## 2. Arquitectura de Ramas y Publicación

El ciclo de publicación de Kerith sigue una regla estricta de dos niveles:

```
[ Rama feature / fix ]  ──>  pnpm changeset  (genera archivo .changeset/xxx.md)
          │
          ▼ PR
[ Rama develop ]        ──>  Integración, validación y testing exhaustivo.
          │                  NUNCA publica automáticamente a NPM.
          ▼ PR
[ Rama main ]           ──>  Rama protegida de producción.
          │                  GitHub Actions detecta changesets y genera un PR:
          │                  "chore(release): version packages"
          ▼ Merge del PR
[ Publicación NPM ]     ──>  Changesets publica a NPM con tags y provenance.
```

---

## 3. Flujo de Trabajo Diario (Paso a Paso)

### 3.1 ¿Cuándo crear un changeset?
Debes crear un changeset **siempre que realices un cambio en el código que un consumidor de los paquetes de Kerith vaya a notar o recibir**:
- Corrección de bugs en el runtime (`patch`).
- Nuevos métodos, identifiers, flags de CLI o mejoras retrocompatibles (`minor`).
- Breaking changes o cambios de arquitectura incompatibles (`major`).

> **No es necesario crear changeset si:**
> Solo estás cambiando documentación interna, tests en `@kerith/testing`, tareas de CI internas o refactors que no alteran el comportamiento exportado.

---

### 3.2 Cómo crear un changeset (`pnpm changeset`)

1. Desde tu rama de trabajo (por ejemplo `feat/algo-nuevo`), ejecuta:
   ```bash
   pnpm changeset
   ```

2. **Paso 1: Seleccionar paquetes afectados**
   Usa las flechas del teclado y la barra espaciadora (`Space`) para marcar qué paquetes se modificaron:
   ```text
   ? Which packages would you like to include?
     ◯ @kerith/app
   ❯ ◉ @kerith/core
     ◯ @kerith/eslint-plugin
     ◯ @kerith/identifiers
     ◯ create-kerith
   ```
   Presiona `Enter` tras seleccionarlos.

3. **Paso 2: Elegir nivel de SemVer (major / minor / patch)**
   El asistente te preguntará si alguno de esos paquetes requiere un bump `major`. Si respondes que no, te preguntará por `minor`. Si también es no, asumirá `patch`.

4. **Paso 3: Escribir el resumen del cambio**
   Escribe un resumen claro en lenguaje natural (ej. `Fix route matching when trailing slashes are present`). Este texto es el que aparecerá en el `CHANGELOG.md` del paquete.

5. **Paso 4: Guardar y commitear**
   Se generará un archivo markdown aleatorio dentro de `.changeset/` (ejemplo: `.changeset/heavy-frogs-sing.md`). Haz git add y commit:
   ```bash
   git add .changeset/
   git commit -m "feat(core): add trailing slash tolerance and changeset"
   ```

---

### 3.3 Anatomía de un archivo `.changeset/*.md`

El archivo generado tiene un formato de Frontmatter YAML + descripción:

```markdown
---
"@kerith/core": patch
"@kerith/app": patch
---

Fix context propagation when using nested async handlers.
```

Puedes editar este archivo a mano si necesitas ajustar la redacción o agregar más paquetes antes de enviarlo.

---

## 4. SemVer y Criterios de Bump

| Tipo | Cuándo elegirlo | Ejemplo de impacto |
| :--- | :--- | :--- |
| **`patch`** | Bugfixes, optimizaciones internas, parches de seguridad, sin cambios en las APIs públicas. | `1.0.0` → `1.0.1`<br>*(en alpha: `1.0.0-alpha.1` → `1.0.0-alpha.2`)* |
| **`minor`** | Nuevas características, nuevos identifiers, flags adicionales de CLI compatibles hacia atrás. | `1.0.0` → `1.1.0`<br>*(en alpha: incrementa y actualiza versión pre-release)* |
| **`major`** | Breaking changes, eliminación de APIs deprecadas, cambio en firmas de funciones o decorators. | `1.0.0` → `2.0.0` |

---

## 5. Gestión de Pre-releases (`alpha`, `beta`, `rc`)

### 5.1 Estado actual: Modo Alpha
El monorepo cuenta con el archivo [`.changeset/pre.json`](file:///home/kevin/Projects/KerithJS/kerith/.changeset/pre.json):

```json
{
  "mode": "pre",
  "tag": "alpha"
}
```

Esto garantiza que:
1. Cualquier bump futuro se mantendrá como `-alpha.N` (ej. `2.0.0-alpha.2`, `1.0.0-alpha.2`).
2. La publicación en NPM se etiquetará automáticamente bajo `--tag alpha`, evitando que se instale por error con `npm install @kerith/core` (requiere `npm install @kerith/core@alpha`).

---

### 5.2 Salir del modo pre-release hacia versión estable
Cuando el framework esté listo para su lanzamiento oficial estable (ej. `2.0.0` y `1.0.0` oficiales):

1. En la rama `develop`, ejecuta:
   ```bash
   pnpm changeset pre exit
   ```
2. Esto eliminará el archivo `.changeset/pre.json`.
3. Haz commit y push hacia `develop`:
   ```bash
   git add .changeset/
   git commit -m "chore(release): exit alpha pre-release mode"
   git push origin develop
   ```
4. Al hacer merge a `main`, el siguiente PR de versionado convertirá las versiones alpha en versiones estables listas para npm con tag `latest`.

---

### 5.3 Volver a entrar a un nuevo ciclo pre-release
Si más adelante quieres comenzar un ciclo de betas o candidatas a release:
```bash
# Para ciclo beta:
pnpm changeset pre enter beta

# Para ciclo release candidate:
pnpm changeset pre enter rc
```

---

## 6. Automatización en CI/CD (GitHub Actions)

El workflow [`.github/workflows/publish.yml`](file:///home/kevin/Projects/KerithJS/kerith/.github/workflows/publish.yml) administra todo el ciclo de entrega.

### 6.1 ¿Qué pasa al hacer merge en `develop`?
- Se ejecutan las suites de CI (`ci.yml`: build, lint, typecheck, tests y E2E).
- **No se dispara ninguna publicación a NPM**. `develop` es exclusivamente un entorno de integración y prueba.

---

### 6.2 ¿Qué pasa al hacer merge en `main`? (PR automático)
Cuando llevas código desde `develop` hacia `main` mediante un Pull Request:

1. El workflow `publish.yml` se ejecuta en `main`.
2. Si detecta archivos `.changeset/*.md` sin procesar:
   - Ejecuta `pnpm run version-packages` internamente.
   - Incrementa las versiones en los `package.json` de los paquetes correspondientes.
   - Actualiza los `CHANGELOG.md` locales.
   - Elimina los archivos `.changeset/*.md` ya consumidos.
   - **Abre automáticamente un Pull Request** en GitHub titulado:
     `chore(release): version packages`.

---

### 6.3 La publicación real a NPM con Provenance
1. El equipo revisa el PR `chore(release): version packages` creado por el bot de Changesets.
2. Al **aprobar y hacer merge** de este PR a `main`:
   - El workflow corre nuevamente en `main`.
   - Al no haber changesets nuevos por procesar, ejecuta `pnpm run publish-packages`.
   - Publica en el registro público de NPM únicamente los paquetes que cambiaron de versión.
   - Utiliza `--provenance` para firmar criptográficamente que el artefacto proviene de este commit de GitHub Actions.
   - Genera automáticamente los tags de Git en el repositorio (ej. `@kerith/core@2.0.0-alpha.2`).

---

## 7. Referencia de Comandos CLI

| Comando | Función |
| :--- | :--- |
| `pnpm changeset` | Abre el asistente interactivo para registrar un nuevo cambio. |
| `pnpm changeset status` | Muestra los changesets pendientes y qué paquetes afectarán. |
| `pnpm run version-packages` | Ejecuta localmente el consumo de changesets, bumping de versiones y actualización de changelogs (`changeset version`). |
| `pnpm run publish-packages` | Publica en NPM los paquetes cuyas versiones aún no existen en el registro (`changeset publish`). |
| `pnpm changeset pre enter <tag>` | Activa el modo pre-release (`alpha`, `beta`, `next`, `rc`). |
| `pnpm changeset pre exit` | Desactiva el modo pre-release y vuelve a versiones estables. |

---

## 8. Preguntas Frecuentes y Solución de Problemas

### ¿Qué pasa si olvidé agregar un changeset a mi PR?
Puedes agregar un commit adicional a la misma rama ejecutando `pnpm changeset`, commitear el archivo generado y volver a pushear.

### ¿Puedo modificar un changeset ya creado?
Sí. Los archivos `.changeset/*.md` son archivos planos en texto markdown. Puedes cambiar el nivel de bump (`patch` ↔ `minor`) o mejorar el texto descriptivo directamente en tu editor de código.

### ¿Se publica todo el monorepo si solo modifico `create-kerith`?
**No**. Changesets revisa paquete por paquete. Si solo `create-kerith` tiene un changeset registrado, solo `create-kerith` recibe un nuevo tag y se publica en NPM. El resto de paquetes no se tocan.

### ¿Qué secreto requiere GitHub Actions para publicar?
Requiere `NPM_TOKEN` configurado en **Settings → Secrets and variables → Actions** del repositorio de GitHub con permisos de publicación para la organización/scope `@kerith` y el paquete `create-kerith`.

