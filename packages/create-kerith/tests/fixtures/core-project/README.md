# my-test-project

## Getting Started

To run the development server:
```bash
npm run dev
```

## Architecture

This project is built using [Kerith](https://github.com/kerithjs/kerith).

- `kerith.config.ts`: Central configuration for the framework. It defines where modules are located (`origin`) and custom route prefixes.
- `.kerith/registry.json`: This file tracks all your modules and their identifiers. **It must be checked into Git** to ensure consistency across environments.
- `.kerith/preload.js`: This is automatically generated and must also be checked into Git. It enables fast startup and ESM alias resolution.
