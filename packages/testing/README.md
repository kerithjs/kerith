# @kerith/testing

E2E testing harness and fixture suite for Kerith projects.

## Overview

This package provides a subprocess-based testing harness used to verify that generated Kerith projects boot, route, and shut down correctly.

It operates by spawning fixtures in a real Node.js process (via `tsx`) and asserting on their HTTP responses and exit codes.

## Architecture

Because Kerith makes extensive use of decorators and dynamic imports during bootstrap, it is critical that fixtures are run in isolated processes rather than imported directly into the test runner. This prevents Node's ESM cache from masking issues in repeated boots.

### Components

- **Harness (`src/`)**: Subprocess management, health-gating, and HTTP client factory.
- **Fixtures (`fixtures/`)**: Static Kerith projects (`01`-`05`) used for baseline tests.
- **Dynamic Fixtures (`06-create-kerith-e2e`)**: Unlike `01`-`05` which are committed to the repo, the `06-create-kerith-e2e` suite dynamically generates its fixtures at runtime using the `create-kerith` CLI to verify all channel combinations.
- **Tests (`tests/`)**: Vitest suites that use the harness to drive the fixtures.
