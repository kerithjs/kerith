# Migrating to Kerith 2.0.0

Kerith 2.0.0 introduces **Domain-Driven Architecture**. Instead of a single flat list of modules, Kerith now infers a `Domain → Module → SubModule` hierarchy entirely from your filesystem structure.

The good news: **v1.x projects work perfectly without any changes.**

You do not need to rewrite your entire application to upgrade. Kerith 2.0.0 is 100% backward compatible with the v1.x `modules:` configuration and flat structure. You can upgrade today and adopt domains incrementally.

---

## 1. Upgrading without changes (v1.x mode)

If your `kerith.config.js` looks like this:

```js
export default {
  modules: 'src/modules/*',
  // other config...
}
```

Simply update your package versions:

```bash
npm install @kerith/core@latest
npm install -D @kerith/eslint-plugin@latest
```

That's it. Kerith will continue to discover your modules exactly as before. The new `kerith check` output will skip the Domain sections and show a flat list of modules, identical to v1.x behavior.

---

## 2. Adopting Domain Hierarchy (Incremental)

When you are ready to organize your app into domains, follow these steps. You can move one module at a time thanks to **NITS**, which will preserve your module identities during the migration.

### Step 1: Switch to `origin` configuration

In `kerith.config.js`, replace `modules` with `origin`. This tells Kerith to scan the entire `src` folder for structural identifiers, rather than just one folder.

```diff
 export default {
-  modules: 'src/modules/*',
+  origin: 'src',
 }
```

### Step 2: Create a Domain folder

Create a folder for your first domain (e.g., `billing`) and add an `index.ts` with the `Domain()` identifier.

```ts
// src/billing/index.ts
import { Domain } from '@kerith/core'

Domain('billing')
```

### Step 3: Move modules into the Domain

Move an existing module from `src/modules/` into your new domain folder.

```bash
mv src/modules/payments src/billing/payments
```

**Important:** Do NOT change the `Module('payments', ...)` call inside the module's `index.ts`. Kerith infers the domain membership automatically from the folder location.

### Step 4: Sync your aliases

Run the `sync-tsconfig` command to update your IDE paths.

```bash
npx kerith sync-tsconfig
```

Your module is now available under its new domain-scoped alias! Update your imports from `@modules/payments` to `@billing/payments`.

_Tip: Use your IDE's Find and Replace to update the imports across your codebase._

### Step 5: Verify the architecture

Run the architecture linter to ensure everything is wired correctly and NITS has tracked the move.

```bash
npx kerith check
```

You should see output grouped by Domains and Modules. NITS will output a message confirming that it tracked the `payments` module moving to its new location.

---

## FAQ

### Do I need to change my `Module()` calls?
No. `Module('payments')` works exactly the same. The `Module` function does not accept a `domain` argument because Kerith enforces the filesystem as the single source of truth.

### What happens to the `@modules` alias?
If you still have a `modules:` key in your config, `@modules/*` aliases are generated for those modules.
If you switch to `origin: 'src'`, Kerith stops generating the catch-all `@modules` alias and instead generates strict domain aliases like `@billing/*` and `@workspace/*`. Modules at the root of `src/` (flat modules) will be aliased directly by their name (e.g., `@users`).

### Can I have two modules with the same name?
Yes! In v1.x, module names had to be globally unique. In v2.0.0, module names only need to be unique *within their domain*.
You can have `src/billing/api` and `src/workspace/api` without any conflicts.
