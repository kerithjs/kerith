# export-mismatch

**Fixture type:** `core/04-error-paths`  
**Expected outcome:** boot failure — `EXPORT_MISMATCH`

## Scenario

A module declares `exports: ['getValue']` in its `Module()` call, but its `index.ts` never
actually exports a symbol named `getValue`. Kerith checks the real ES module namespace against
the declared exports list during `step-06-imports`, and throws `EXPORT_MISMATCH` when a declared
name is missing from the real namespace.

```
src/modules/provider/index.ts
  Module('provider', { exports: ['getValue'] })
  ↑ declares 'getValue' as an export, but the file only has `export default`
```

## Why it fails without strict

The check in `step-06-imports.ts` (lines ~130–138) runs unconditionally for every module —
it does not require `strict: true`. The `strict`-only block only adds the **reverse** warning
(an actual export that is *not* declared in `exports[]`).

## Relationship to undeclared-shared-import

This fixture covers the original scenario described in the plan for `undeclared-shared-import`:
*"module B imports something not exported by module A"*. The failure now belongs to the provider
side (the module that lies about what it exports), not the consumer side.
