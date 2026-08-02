# create-kerith

> Scaffold a new [Kerith](https://kerith.dev) project in seconds.

```bash
npm create kerith@alpha
# or
npx create-kerith@alpha
```

> **Note**: During the v2 alpha cycle, use the `@alpha` tag — there is no `latest` dist-tag published yet.

## Usage

```
create-kerith [project-name] [options]

Arguments:
  project-name             Name of the project (will be sanitized to a valid npm name)

Options:
  -y, --yes                Skip all prompts and use defaults
  -t, --template <type>    Project template: core | app  (default: prompted)
  -l, --language <lang>    Language: ts | js             (default: ts)
  -p, --port <number>      Server port (1–65535)         (default: 3000)
      --prefix <prefix>    Route prefix, e.g. /api       (default: none)
  -o, --out-dir <dir>      Output directory              (default: ./<project-name>)
      --no-install         Skip npm install after scaffolding
  -h, --help               Display help
```

### Validation rules

| Flag           | Rule                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `project-name` | Must be a valid npm package name (lowercase, no spaces). Auto-sanitised in `--yes` mode (spaces → hyphens, uppercased → lowercase). |
| `--port`       | Must be an integer between 1 and 65535. Rejected with a clear error if invalid.                                                     |
| `--template`   | Must be `core` or `app`. Any other value exits with a non-zero code.                                                                |
| `--language`   | Must be `ts` or `js`. Any other value exits with a non-zero code.                                                                   |

## Templates

| Template | Description                                               |
| -------- | --------------------------------------------------------- |
| `core`   | Bare Kerith setup — router, preload hook                  |
| `app`    | Extends `core` with `@kerith/app` + `@kerith/identifiers` |

### Channels (template `app` only)

When `--template app` is used interactively, you can choose from these channel types:

| Channel      | Extra dependency added                         |
| ------------ | ---------------------------------------------- |
| `alias`      | —                                              |
| `middleware` | —                                              |
| `cron`       | `node-cron ^3.0.0`                             |
| `worker`     | `bullmq ^5.0.0`                                |
| `gateway`    | `socket.io ^4.7.5` (if Socket.io is confirmed) |

Additionally, selecting `worker` or `cron` prompts for a Redis stub (`ioredis ^5`).

## How it works

`create-kerith` is intentionally thin:

1. Validates CLI flags eagerly (before any prompt).
2. Asks (or reads from flags) your project decisions.
3. Delegates skeleton generation to `@kerith/core/cli`.
4. If template is `app`, patches the result with the app layer — it does **not** run a second independent generator.
5. Writes files to disk and optionally runs `npm install`.
6. Runs `kerith sync-preload` (+ `kerith sync-tsconfig` for TypeScript) inside the new project.
