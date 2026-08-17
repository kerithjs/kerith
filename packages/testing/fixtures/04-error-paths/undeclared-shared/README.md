# undeclared-shared

**Fixture type:** `core/04-error-paths`

Two sub-variants of the same scenario — a module with `shared: ['@no-es-shared-valido']` where
the alias is neither `@shared` nor a subpath of `@shared`.

## Variants

| Subfixture | `strict` | Expected outcome |
|---|---|---|
| `strict-on/` | `true` | boot failure — `UNDECLARED_SHARED` (throws) |
| `strict-off/` | `false` | boot success — `UNDECLARED_SHARED` appears as `WARN` in stdout |

## Why the behaviour differs

In `step-07-validations.ts` the local `error()` helper (line ~76) either throws or warns
depending solely on `config.strict`:

```ts
const error = (code, message, details) => {
  if (config.strict) {
    throw new KerithError(code, message, details);
  } else {
    log.warn(message, { _module: 'bootstrap', code, details });
  }
};
```

This is the **only** fixture in this group where the non-strict path is observable in runtime
(the boot completes and the warning appears in stdout). All other UNDECLARED_* / UNUSED_* codes
only throw in strict mode with no fallback log.
