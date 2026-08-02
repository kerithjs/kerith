# create-kerith

> Scaffold a new [Kerith](https://kerith.dev) project in seconds.

```bash
npm create kerith@latest
# or
npx create-kerith
```

## Usage

```
create-kerith [project-name] [options]

Options:
  --template <core|app>   Project template (default: prompted interactively)
  --no-install            Skip npm install after scaffolding
  -h, --help              Display help
```

## Templates

| Template | Description |
|---|---|
| `core` | Bare Kerith setup — router, channels, preload hook |
| `app` | Extends `core` with `@kerith/app` and `@kerith/identifiers` |

## How it works

`create-kerith` is intentionally thin:

1. Asks (or reads from flags) your project decisions.
2. Delegates skeleton generation to `@kerith/core/cli`.
3. If template is `app`, patches the result with the app layer — it does **not** run a second independent generator.
4. Writes files to disk and runs `npm install`.
5. Runs `kerith sync-preload` + `kerith sync-tsconfig` inside the new project.
