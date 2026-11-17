---
"@kerith/core": patch
---

feat(core): complete Fase 3 alias-channel static discovery and `kerith check` rules.

- Static scan under `origin` for `Config()` / `Client()` / `Store()` / `Provider()` / `Adapter()` declarations imported from `@kerith/app` or `@kerith/identifiers`, with duplicate detection and dependency-cycle detection (`ALIAS_CIRCULAR`) before bootstrap Step 06.
- `kerith check` reports undeclared `@prefix/name` imports and alias cycles; alias-channel imports are no longer treated as module/domain boundary violations.
- Fixes: alias-channel imports are visible in the CLI module graph, `resolveAliases: false` disables the alias rules, fatal scan errors become blocking violations instead of crashing the CLI, renamed-import warnings reach the scanner, and `strictLiteralName: false` is honoured.
- Documents the static scan limitations (no transitive modules or computed specifiers; runtime timeout is the fallback).
