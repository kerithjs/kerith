# Contributing to Kerith

Thanks for taking the time to help improve Kerith. At this stage, the project is maintained by a single developer, so the most valuable contribution you can make is a **well-reported issue** — clear, reproducible bug reports save far more time than they cost to write.

This document covers how to report bugs effectively. Code contributions (PRs) are welcome but not yet the primary focus while the `2.0.0-alpha.x` line is under active development — see [Code Contributions](#code-contributions) below before opening a PR.

---

## Before You Open an Issue

1. **Check you're on a supported version.** `2.0.0-alpha.x` is a pre-release — see [SECURITY.md](./SECURITY.md) for what's changed relative to `1.8.x`. If you're not sure which line you're on, run `npm ls @kerith/core`.
2. **Search existing issues first.** It's likely someone already hit the same thing — a 👍 on an existing issue is more useful than a duplicate.
3. **Confirm it's a bug, not a design decision.** Some behavior that looks like a bug is intentional (for example, quality-rule warnings never blocking the exit code outside `--strict`). If you're unsure, open the issue anyway and ask — worst case it gets labeled `by-design` and closed with an explanation.

---

## Reporting a Bug

Use the **Bug Report** issue template — it will be offered automatically when you open a new issue. Please fill in every section:

- **Kerith version** — the exact version string (e.g. `@kerith/core@2.0.0-alpha.1`), not just "latest."
- **Command executed** — the exact CLI command or the relevant `createApp()` call.
- **Expected behavior** — what should have happened.
- **Actual behavior** — what happened instead, including the full output/error message, not a paraphrase.
- **Minimal reproduction** — ideally a small repo or a short list of steps starting from a fresh project. This is the single biggest factor in how fast a bug gets fixed. If you can't produce one, say so and describe your project structure as precisely as you can instead.
- **Environment** — OS, package manager (npm/pnpm/yarn), and whether it's a monorepo.

Issues without enough information to reproduce will be labeled `needs-triage` and may sit until more detail is available — this isn't a rejection, just a signal that the report needs more to act on.

### Severity, from the reporter's side

You don't need to self-label severity — that's done during triage — but it helps to know what we're looking for:

- **Something that silently loses or corrupts data**, or causes `kerith check` to miss a real architectural violation, is the highest priority.
- **Something that's inconvenient, unclear, or a bit off in wording** (a warning message that could be clearer, a quality-rule threshold that feels miscalibrated) is real feedback, but lower priority — feel free to report it, just don't expect same-day turnaround.

---

## Feature Requests / Ideas

Feature requests are welcome, but please open them as a **GitHub Discussion** rather than an Issue if the repository has Discussions enabled. This keeps the Issues list focused on things that are actually broken. If Discussions aren't enabled yet, a regular issue is fine — it'll be labeled accordingly.

Before requesting something, it's worth checking whether it's already planned. Kerith's roadmap is staged deliberately (core → framework → types → DX), so a request like "add TypeScript inference for aliases" may already be planned for a later stage rather than missing.

---

## Security Issues

**Do not open a public issue for a security vulnerability.** See [SECURITY.md](./SECURITY.md) for the correct reporting channel.

---

## Code Contributions

Kerith is currently developed by a single maintainer following a spec-first approach — architectural decisions and invariants are worked out before implementation. Because of that:

- **Small fixes** (typos, incorrect error messages, obviously wrong logic with a clear correct answer) are welcome as PRs directly.
- **Anything larger** (new rules, new identifiers, changes to NITS/reconciliation behavior, new packages) — please open an issue or discussion first to align on approach before investing time in a PR. Large PRs opened without prior discussion may not be mergeable as-is, simply because they might not match a direction already decided elsewhere in the architecture.

If you do open a PR:

- Keep it focused on one change — easier to review, easier to revert if something's wrong.
- Include or update tests for the behavior you're changing.
- Run `pnpm test` and `tsc --noEmit` locally before opening the PR.

---

## Code of Conduct

Participation in this project — issues, discussions, and pull requests — is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). Please read it before participating.

---

Thanks again for your interest in Kerith — during the alpha period especially, every well-written bug report genuinely moves the project forward.
