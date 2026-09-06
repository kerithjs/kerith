# 05-decorators/basic

This fixture validates Kerith's support for `@Controller` class decorators (Phase 6.1).

**Note on "purely decorated" vs mixed mode:**
The roadmap explicitly required validating a fixture with a purely decorated controller (no `Controller()` function calls). The `home` module in this fixture fulfills this requirement: it has no `Controller()` function call anywhere.

Additionally, to validate the mixed-mode scenario (Phase 6.0 findings), a `legacy` module is included which uses the traditional `Controller()` function. This proves that a project can safely mix both styles and boot successfully without friction.
