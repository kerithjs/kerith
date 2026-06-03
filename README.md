<div align="center">

<img src="./public/logo.svg" alt="Kerith" width="200" height="200" />

# KerithJS

**The architectural standard for Node.js and TypeScript.**

[![npm](https://img.shields.io/npm/v/@kerith/core?color=e4f222&label=%40kerith%2Fcore&style=flat-square)](https://www.npmjs.com/package/@kerith/core)
[![npm](https://img.shields.io/npm/v/@kerith/identifiers?color=e4f222&label=%40kerith%2Fidentifiers&style=flat-square)](https://www.npmjs.com/package/@kerith/identifiers)
[![npm](https://img.shields.io/npm/v/@kerith/eslint-plugin?color=e4f222&label=%40kerith%2Feslint-plugin&style=flat-square)](https://www.npmjs.com/package/@kerith/eslint-plugin)
[![npm](https://img.shields.io/npm/v/create-kerith?color=e4f222&label=create-kerith&style=flat-square)](https://www.npmjs.com/package/create-kerith)
[![License: MIT](https://img.shields.io/badge/license-MIT-e4f222?style=flat-square)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.6-e4f222?style=flat-square)](https://nodejs.org/)
[![kerith.dev](https://img.shields.io/badge/docs-kerith.dev-e4f222?style=flat-square)](https://docs.kerith.dev)

> **Node.js ≥ 20.6** · **Express 5.x** · **ESM Only** · **TypeScript included**

</div>

---

This repository is the monorepo for the KerithJS ecosystem. All packages are versioned in lockstep and published independently to npm under the `@kerith` scope.

---

## Packages

| Package                                             | Description                                                                                      | Version                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`@kerith/core`](./packages/core)                   | The engine — deterministic bootstrap, module discovery, NITS identity tracking, HTTP logger, CLI | [![npm](https://img.shields.io/npm/v/@kerith/core?style=flat-square)](https://www.npmjs.com/package/@kerith/core)                   |
| [`@kerith/identifiers`](./packages/identifiers)     | Structural and logical identifiers for every backend entity type                                 | [![npm](https://img.shields.io/npm/v/@kerith/identifiers?style=flat-square)](https://www.npmjs.com/package/@kerith/identifiers)     |
| [`@kerith/eslint-plugin`](./packages/eslint-plugin) | Architectural rules enforced at edit time — before the server runs                               | [![npm](https://img.shields.io/npm/v/@kerith/eslint-plugin?style=flat-square)](https://www.npmjs.com/package/@kerith/eslint-plugin) |
| [`create-kerith`](./packages/create)                | `npm create kerith@latest` — correct structure from the first commit                             | [![npm](https://img.shields.io/npm/v/create-kerith?color=e4f222&style=flat-square)](https://www.npmjs.com/package/create-kerith)    |

All packages are independent installs. `@kerith/eslint-plugin` and `create-kerith` are companions — not dependencies of the core.

---

## Repository Structure

```
kerith/
├── packages/
│   ├── core/                        # @kerith/core
│   │   ├── src/
│   │   │   ├── bootstrap/           # createApp() — 17-step deterministic pipeline
│   │   │   ├── identifiers/         # Module(), Controller(), Service(), ...
│   │   │   ├── aliases/             # ESM hook — runtime alias resolution
│   │   │   ├── nits/                # NITS — Node Identity Tracking System
│   │   │   ├── cli/                 # kerith check, create-module, sync-*
│   │   │   ├── core/                # Registry, state, logger, http-logger, errors
│   │   │   ├── preload/             # Runtime pre-loader hook
│   │   │   └── types/               # Public TypeScript types
│   │   └── tests/
│   │       ├── unit/                # Isolated unit tests
│   │       ├── integration/         # End-to-end bootstrap tests
│   │       └── fixtures/            # Test application stubs
│   │
│   ├── identifiers/                 # @kerith/identifiers
│   │   └── src/
│   │       └── ...
│   │
│   ├── eslint-plugin/               # @kerith/eslint-plugin
│   │   └── src/
│   │       └── rules/               # no-private-imports, no-undeclared-imports
│   │
│   └── create/                      # create-kerith
│       └── src/
│           └── ...
│
├── package.json                     # Workspace root
└── tsconfig.json                    # Shared TypeScript base config
```

---

## Development Setup

**Prerequisites:** Node.js ≥ 20.6, npm ≥ 10

```bash
git clone https://github.com/kerithjs/kerith.git
cd kerith
npm install
```

### Common commands

```bash
# Build all packages
npm run build

# Run all tests across the workspace
npm test

# Type-check all packages
npm run typecheck

# Lint all source and test files
npm run lint
npm run lint:fix
```

To run commands for a specific package, use the `-w` flag:

```bash
npm test -w @kerith/core
npm run build -w @kerith/eslint-plugin
```

---

## Quick Start

```bash
npm create kerith@latest
```

Or install manually:

```bash
npm install @kerith/core express
```

```ts
// kerith.config.ts
import { defineConfig } from "@kerith/core";

export default defineConfig({
  modules: "src/modules/*",
  prefix: "/api/v1",
  aliases: {
    "@config": "./src/config",
    "@middleware": "./src/middleware",
  },
});
```

```ts
// src/app.ts
import express from "express";
import { createApp, useLogger, useHttpLogger } from "@kerith/core";

const app = express();
const log = useLogger("app");
const httpLog = useHttpLogger({ ignore: ["/health"] });

app.use(express.json());
app.use(httpLog.requests());

const Kerith = await createApp(app);

log.info(`Mounted ${Kerith.routes.length} route(s)`);

const server = app.listen(3000, () => {
  log.info("Server running on http://localhost:3000");
});

Kerith.listen(server);

// Error handler — must be last
app.use(httpLog.errors());
```

Each module declares itself through its `index.ts`:

```ts
// src/modules/users/index.ts
import { Module } from "@kerith/core";

Module("users", {
  imports: ["auth"],
  exports: ["UserService"],
});

export { UserService } from "./users.service.js";
```

For the full API reference, configuration options, and CLI documentation, see [docs.kerith.dev](https://docs.kerith.dev).

---

## ESLint Plugin

```bash
npm install --save-dev @kerith/eslint-plugin
```

```js
// eslint.config.js
import kerith from "@kerith/eslint-plugin";

export default [kerith.configs.recommended];
```

Ships two rules: `no-private-imports` (error) and `no-undeclared-imports` (warn). For full configuration details, see the [`@kerith/eslint-plugin` README](./packages/eslint-plugin/README.md).

---

## Versioning and Releases

All packages follow [Semantic Versioning](https://semver.org/) and are released in lockstep from this repository. Changes are documented in the `CHANGELOG.md` of each package.

> **Why does `@kerith/core` start at v1.8.2?**
> Kerith is the direct evolution of [Nodulus](https://www.npmjs.com/package/@vlynk-studios/nodulus-core), published under Vlynk Studios. The versioning was intentionally continued from where Nodulus left off — rather than resetting to v1.0.0 — to preserve the lineage and reflect the true maturity of the framework. The v1.0.0–v1.8.1 history is fully documented in [CHANGELOG.md](./CHANGELOG.md).

---

## Contributing

Contributions, bug reports, and feature requests are welcome. Please open an issue before submitting a pull request for non-trivial changes.

Contribution guidelines, style standards, and design principles will be formally documented at the V2.0.0 release.

---

## License

MIT — see [LICENSE](./packages/core/LICENSE).

---

<div align="center">

Built and maintained by **[Vlynk Studios](https://github.com/vlynk-studios)** — Porto Alegre, Brasil.

[npm](https://www.npmjs.com/org/kerith) · [docs.kerith.dev](https://docs.kerith.dev) · [github.com/KerithJS](https://github.com/KerithJS)

</div>
