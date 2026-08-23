# @kerith/app Changelog

All notable changes to this project will be documented in this file.


## [2.0.0-alpha.2] - Unreleased

### Changed
- **BREAKING**: minimum supported Node version raised to 24 LTS



### Added
- Added `infrastructure` option to `AppCreateAppOptions` in `createApp()` to allow injecting Redis configurations (`host`, `port`, `password`, etc.) programmatically, bypassing environment variables. This simplifies testing and isolated environments.
- Implemented global `infrastructure-context` to correctly propagate these options down to Redis connection adapters, `Worker`, `Message` and `Stream` channels.
- **Controller Decorators (Fase 1)**: Added class-based controller decorators (`@Controller`, `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`) as an alternative to the traditional `Controller()` function approach. Decorators support middleware configuration and metadata for Extension API integration (e.g., `Guard()`, `RateLimit()`).
- Added `experimentalDecorators: true` to `tsconfig.json` to support legacy Stage 2 decorator signature.
- Added internal symbols (`KERITH_CONTROLLER`, `KERITH_ROUTES`) for decorator metadata storage.
- Added routing types (`HttpMethod`, `RouteDefinition`, `AppControllerOptions`, `AppControllerMeta`).
- **Parameter Decorators (Fase 2)**: Added `@Body()`, `@Param(key?)`, `@Query(key?)`, `@Headers(key?)`, `@Req()`, `@Res()` parameter decorators for class-based controllers. Decorators are pure extractors — no validation, transformation, or cloning. The raw Express value is passed by reference.
- Added `KERITH_PARAMS` symbol (`Symbol.for('kerith:params')`) for parameter metadata storage, following the same global registry convention as `KERITH_CONTROLLER`/`KERITH_ROUTES`.
- Added `ParamSource` union type and `ParamDefinition` interface to `types/routing.ts`. Extended `RouteDefinition` with optional `params?: ParamDefinition[]` — fully backwards-compatible (field is omitted, not set to `undefined` or `[]`, for routes without param decorators).
- `@Controller` now reads `KERITH_PARAMS` from the prototype and propagates per-handler `ParamDefinition[]` into the `AppControllerMeta.routes` array at class decoration time.


### Fixed
- Fixed memory exhaustion (OOM) and tight loop issues when `ioredis` background consumption loops are tested with instant-resolve mocks. Tests now use controlled promises.
- Enforced strict fail-fast error `INVALID_ENV_CONFIG` for invalid cron schedules or misconfigured Redis parameters during the bootstrap phase rather than at runtime.
- Added proper cleanup and state-reset routines (`_resetAllChannels`) in tests to ensure independent test runs don't leak background event loops.
