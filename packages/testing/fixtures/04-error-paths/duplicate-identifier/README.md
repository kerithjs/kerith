# duplicate-identifier

**Fixture type:** `core/04-error-paths`  
**Expected outcome:** boot failure — `DUPLICATE_MODULE`

## Scenario

Two separate module folders (`src/modules/module-a/` and `src/modules/nested/module-a/`)
both call `Module('module-a', ...)`. The Kerith registry detects that the name `module-a`
is already taken when the second registration attempt occurs, and throws `DUPLICATE_MODULE`
during the module-loading phase (before validation steps).

```
src/modules/
├── module-a/         ← Module('module-a')
│   └── index.ts
└── nested/
    └── module-a/     ← Module('module-a')  ← DUPLICATE
        └── index.ts
```

## Why it fails

`DUPLICATE_MODULE` is thrown synchronously by the registry in `registry.ts` when it detects
that `modulesByName` already contains the key for the module being registered. This happens
during the module-loading phase, **regardless of whether `strict` mode is enabled** —
`strict` only affects the later validation steps in `step-07-validations.ts`.

## Note on other DUPLICATE_* codes

Other codes like `DUPLICATE_ALIAS_IDENTIFIER`, `DUPLICATE_MIDDLEWARE_IDENTIFIER`,
`DUPLICATE_SCHEDULE_IDENTIFIER`, and `DUPLICATE_BINDING_IDENTIFIER` belong to the
Extension API (`@kerith/identifiers`). If coverage is needed, those fixtures go in
`app/04-error-paths/`, not here.
