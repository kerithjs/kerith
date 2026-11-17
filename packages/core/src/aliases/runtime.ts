import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { KerithError } from '../core/errors.js';
import { assertValidIdentifierName } from '../extension/index.js';
import type { Logger } from '../types/index.js';

export const ALIAS_RUNTIME_KEY = Symbol.for('kerith.alias-runtime');

export { assertValidIdentifierName };

/**
 * Normalizes any file path or file URL to a canonical file URL string.
 */
export function normalizeCanonicalFileUrl(rawUrlOrPath: string): string {
  let fileUrl = rawUrlOrPath;
  if (!fileUrl.startsWith('file://')) {
    fileUrl = pathToFileURL(path.resolve(rawUrlOrPath)).href;
  }
  const u = new URL(fileUrl);
  u.search = '';
  u.hash = '';
  return u.href;
}

/**
 * Options accepted by alias-channel declarations.
 *
 * | Option    | Type       | Default   | Description                                                     |
 * |-----------|------------|-----------|-----------------------------------------------------------------|
 * | `lazy`    | boolean    | `false`   | When false (default), resolved eagerly during bootstrap (Step 06b). When true, skipped at bootstrap and resolved on first import/access. |
 * | `timeout` | integer≥0  | `30000`   | ms before `ALIAS_FACTORY_TIMEOUT`. `0` = no timeout.           |
 * | `required`| boolean    | `true`    | When `false`, errors are downgraded to a warn and `undefined` is memoized. |
 * | `dispose` | function   | —         | Called once per resolved instance during `disposeAll()`, in reverse resolution order, with a 5000 ms budget per alias. Errors are logged and do not stop the remaining disposals. |
 */
export interface AliasDeclarationOptions {
  lazy?: boolean;
  timeout?: number;
  required?: boolean;
  dispose?: (instance: unknown) => void | Promise<void>;
  [key: string]: unknown;
}

export type AliasIdentifierOptions = AliasDeclarationOptions;

export interface AliasDeclaration {
  prefix: string;
  name: string;
  key: string; // e.g. "client/db"
  filePath: string; // canonical file URL
  factory: () => unknown | Promise<unknown>;
  options: AliasDeclarationOptions;
}

export interface AliasRuntime {
  table: Map<string, string>; // key -> canonical filePath
  declarations: Map<string, AliasDeclaration>; // key -> declaration
  instances: Map<string, unknown>; // key -> resolved instance
  promises: Map<string, Promise<unknown>>; // key -> in-flight resolution promise
  resolutionOrder: string[]; // keys in order of resolution for LIFO disposal
  declare(declaration: Omit<AliasDeclaration, 'key' | 'options'> & { key?: string; options?: AliasDeclarationOptions }): void;
  get(key: string): Promise<unknown>;
  registerTableEntry(key: string, filePath: string): void;
  setTable(entries: Record<string, string> | Map<string, string>): void;
  /** Injects the bootstrap logger so `required: false` warnings and disposal errors use the logger. */
  setLogger(logger: Partial<Pick<Logger, 'warn' | 'error'>> | undefined): void;
  /**
   * Runs every resolved alias's `dispose(instance)` in reverse resolution order
   * (LIFO), awaiting each one with a 5000 ms budget. Failures and timeouts are
   * logged and do not abort the remaining disposals. Aliases that never resolved
   * an instance (lazy, failed, or `required: false` downgraded) are skipped.
   * Resets the runtime afterwards, so a second call is a no-op.
   */
  disposeAll(): Promise<void>;
  _reset(): void;
}

function findSimilarKeys(targetKey: string, availableKeys: string[]): string[] {
  return availableKeys
    .filter((k) => {
      const [tPrefix, tName] = targetKey.split('/');
      const [kPrefix, kName] = k.split('/');
      return tPrefix === kPrefix || (tName && kName && (kName.includes(tName) || tName.includes(kName)));
    })
    .slice(0, 3);
}

/**
 * Builds the canonical `ALIAS_NOT_FOUND` error, including "Did you mean"
 * suggestions. Shared by the runtime resolver and the ESM virtual-alias hook
 * so both entry points report identical errors.
 */
export function createAliasNotFoundError(targetKey: string, availableKeys: string[]): KerithError {
  const similar = findSimilarKeys(targetKey, availableKeys);
  const suggestionMsg =
    similar.length > 0 ? ` Did you mean: ${similar.map((s) => `@${s}`).join(', ')}?` : '';
  return new KerithError(
    'ALIAS_NOT_FOUND',
    `Alias "@${targetKey}" not found in static alias table.${suggestionMsg}`,
    `Available aliases: ${availableKeys.map((a) => `@${a}`).join(', ')}`,
  );
}

// Prefixes whose factory returning null/undefined counts as a failure (6.2).
const NULL_DISALLOWED_PREFIXES = new Set(['config']);

/** Per-alias budget for `dispose()` during `disposeAll()` (6.4). */
const DISPOSE_TIMEOUT_MS = 5000;

class DefaultAliasRuntime implements AliasRuntime {
  public table = new Map<string, string>();
  public declarations = new Map<string, AliasDeclaration>();
  public instances = new Map<string, unknown>();
  public promises = new Map<string, Promise<unknown>>();
  public resolutionOrder: string[] = [];
  private resolvingKeys = new Set<string>();
  /** Keys for which a `required: false` warning has already been emitted. */
  private warnedKeys = new Set<string>();
  /** Bootstrap logger — used for `required: false` warnings and disposal errors when available. */
  private logger?: Partial<Pick<Logger, 'warn' | 'error'>>;

  public setLogger(logger: Partial<Pick<Logger, 'warn' | 'error'>> | undefined): void {
    this.logger = logger;
  }

  public registerTableEntry(key: string, filePath: string): void {
    const canonical = normalizeCanonicalFileUrl(filePath);
    this.table.set(key, canonical);
  }

  public setTable(entries: Record<string, string> | Map<string, string>): void {
    if (entries instanceof Map) {
      for (const [key, filePath] of entries.entries()) {
        this.registerTableEntry(key, filePath);
      }
    } else {
      for (const [key, filePath] of Object.entries(entries)) {
        this.registerTableEntry(key, filePath);
      }
    }
  }

  public declare(
    declInput: Omit<AliasDeclaration, 'key' | 'options'> & { key?: string; options?: AliasDeclarationOptions },
  ): void {
    assertValidIdentifierName(declInput.name, 'Alias identifier');
    assertValidIdentifierName(declInput.prefix, 'Alias prefix');

    // ── 6.1 Option validation ────────────────────────────────────────────────
    const opts = declInput.options;
    if (opts !== undefined) {
      if (opts.timeout !== undefined) {
        if (!Number.isInteger(opts.timeout) || (opts.timeout as number) < 0) {
          throw new KerithError(
            'ALIAS_INVALID',
            `Invalid option "timeout" for alias "${declInput.prefix}/${declInput.name}": must be a non-negative integer (ms).`,
            `Received: ${JSON.stringify(opts.timeout)}`,
          );
        }
      }
      if (opts.lazy !== undefined && typeof opts.lazy !== 'boolean') {
        throw new KerithError(
          'ALIAS_INVALID',
          `Invalid option "lazy" for alias "${declInput.prefix}/${declInput.name}": must be a boolean.`,
          `Received: ${JSON.stringify(opts.lazy)}`,
        );
      }
      if (opts.required !== undefined && typeof opts.required !== 'boolean') {
        throw new KerithError(
          'ALIAS_INVALID',
          `Invalid option "required" for alias "${declInput.prefix}/${declInput.name}": must be a boolean.`,
          `Received: ${JSON.stringify(opts.required)}`,
        );
      }
      if (opts.dispose !== undefined && typeof opts.dispose !== 'function') {
        throw new KerithError(
          'ALIAS_INVALID',
          `Invalid option "dispose" for alias "${declInput.prefix}/${declInput.name}": must be a function.`,
          `Received: ${JSON.stringify(opts.dispose)}`,
        );
      }
    }

    const key = declInput.key ?? `${declInput.prefix}/${declInput.name}`;
    const canonicalFilePath = normalizeCanonicalFileUrl(declInput.filePath);

    const existing = this.declarations.get(key);
    if (existing) {
      if (existing.filePath === canonicalFilePath) {
        throw new KerithError(
          'DUPLICATE_ALIAS_IDENTIFIER',
          `duplicate Alias identifier "${key}" inside the same file`,
          `File: ${canonicalFilePath}`,
        );
      } else {
        throw new KerithError(
          'DUPLICATE_EXTENSION_PROVIDER',
          `duplicate Alias identifier "${key}" across different files`,
          `Conflicts between ${existing.filePath} and ${canonicalFilePath}`,
        );
      }
    }

    const declaration: AliasDeclaration = {
      prefix: declInput.prefix,
      name: declInput.name,
      key,
      filePath: canonicalFilePath,
      factory: declInput.factory,
      options: {
        lazy: false,
        required: true,
        timeout: 30000,
        ...opts,
      },
    };

    this.declarations.set(key, declaration);

    // Register in table if not already present
    if (!this.table.has(key)) {
      this.table.set(key, canonicalFilePath);
    }
  }

  public async get(key: string): Promise<unknown> {
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }

    if (this.promises.has(key)) {
      return this.promises.get(key);
    }

    const promise = this.resolveKey(key);
    this.promises.set(key, promise);
    return promise;
  }

  private async resolveKey(key: string): Promise<unknown> {
    // 1. If not yet declared, check the static table to import the declaring file
    if (!this.declarations.has(key)) {
      const declaringFile = this.table.get(key);
      if (!declaringFile) {
        throw createAliasNotFoundError(key, Array.from(this.table.keys()));
      }

      try {
        await import(declaringFile);
      } catch (err: any) {
        throw new KerithError(
          'ALIAS_NOT_FOUND',
          `Failed to load declaring file for alias "@${key}": ${err?.message ?? String(err)}`,
          `File: ${declaringFile}`,
        );
      }

      if (!this.declarations.has(key)) {
        throw new KerithError(
          'ALIAS_NOT_FOUND',
          `Declaring file loaded for "@${key}" but no matching declaration was registered.`,
          `Expected declaration for "${key}" in ${declaringFile}`,
        );
      }
    }

    const decl = this.declarations.get(key)!;

    if (this.resolvingKeys.has(key)) {
      throw new KerithError(
        'ALIAS_CIRCULAR',
        `Circular dependency detected while resolving alias "@${key}".`,
        `Resolution path: ${Array.from(this.resolvingKeys).join(' -> ')} -> ${key}`,
      );
    }

    this.resolvingKeys.add(key);

    try {
      const timeoutMs = decl.options.timeout ?? 30000;
      let factoryPromise = Promise.resolve().then(() => decl.factory());

      if (timeoutMs > 0) {
        let timer!: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            // 6.2 Cycle hint: if other keys are in-flight while this one times out,
            // it is likely caused by a cycle between aliases via dynamic imports.
            // Use `resolvingKeys` (not `promises`): the latter keeps settled
            // promises cached and would produce false-positive cycle hints.
            const inFlight = Array.from(this.resolvingKeys).filter((k) => k !== key);
            const cycleHint =
              inFlight.length > 0
                ? ` Possible cycle between aliases? In-flight keys: ${inFlight.map((k) => `@${k}`).join(', ')}.`
                : '';
            reject(
              new KerithError(
                'ALIAS_FACTORY_TIMEOUT',
                `Factory for alias "@${key}" timed out after ${timeoutMs}ms.${cycleHint}`,
                `File: ${decl.filePath}`,
              ),
            );
          }, timeoutMs);
        });

        factoryPromise = Promise.race([
          factoryPromise.finally(() => clearTimeout(timer)),
          timeoutPromise,
        ]) as Promise<unknown>;
      }

      const instance = await factoryPromise;

      // 6.2: Config prefix — null/undefined returned from factory counts as failure.
      if (NULL_DISALLOWED_PREFIXES.has(decl.prefix) && (instance === null || instance === undefined)) {
        throw new KerithError(
          'ALIAS_FACTORY_FAILED',
          `Factory for "@${key}" (Config) returned ${JSON.stringify(instance)}. Config factories must return a non-null object.`,
          `File: ${decl.filePath}`,
        );
      }

      this.instances.set(key, instance);
      this.resolutionOrder.push(key);
      return instance;
    } catch (err: any) {
      // 6.2: required: false — downgrade to warn, memoize undefined, warn only once per key.
      if (decl.options.required === false) {
        if (!this.warnedKeys.has(key)) {
          this.warnedKeys.add(key);
          const message =
            `Non-required alias "@${key}" failed — returning undefined. ` +
            `Error: ${err?.message ?? String(err)}`;
          if (this.logger?.warn) {
            this.logger.warn(message, { _module: 'alias' });
          } else {
            console.warn(`[Kerith] ${message}`);
          }
        }
        this.instances.set(key, undefined);
        return undefined;
      }

      // 6.2: Wrap factory errors in ALIAS_FACTORY_FAILED (unless already a KerithError).
      if (err instanceof KerithError) {
        throw err;
      }
      throw new KerithError(
        'ALIAS_FACTORY_FAILED',
        `Factory for alias "@${key}" failed: ${err?.message ?? String(err)}`,
        `File: ${decl.filePath}`,
        { cause: err },
      );
    } finally {
      this.resolvingKeys.delete(key);
    }
  }

  public async disposeAll(): Promise<void> {
    // Reverse resolution order (LIFO). Only aliases that finished resolving an
    // instance are present here; lazy/failed aliases are never disposed.
    const order = [...this.resolutionOrder].reverse();

    try {
      for (const key of order) {
        const decl = this.declarations.get(key);
        const instance = this.instances.get(key);

        if (decl?.options.dispose && typeof decl.options.dispose === 'function') {
          let timer: NodeJS.Timeout | undefined;
          try {
            const disposePromise = Promise.resolve().then(() => decl.options.dispose!(instance));
            const timeoutPromise = new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(
                  new Error(`Dispose timed out after ${DISPOSE_TIMEOUT_MS}ms for alias "@${key}".`),
                );
              }, DISPOSE_TIMEOUT_MS);
            });

            await Promise.race([
              disposePromise.finally(() => {
                if (timer) clearTimeout(timer);
              }),
              timeoutPromise,
            ]);
          } catch (err: unknown) {
            // 6.4: a failing/timing-out dispose is logged and must not abort the
            // remaining disposals. The logger may be partial (tests), so fall
            // back to console.error when `error` is not implemented.
            const message = err instanceof Error ? err.message : String(err);
            if (this.logger?.error) {
              this.logger.error(`Error disposing alias "@${key}": ${message}`, { _module: 'shutdown' });
            } else {
              console.error(`[Kerith] Error disposing alias "@${key}": ${message}`);
            }
          }
        }
      }
    } finally {
      // Clear instances/declarations even if an unexpected error escapes the loop.
      this._reset();
    }
  }

  public _reset(): void {
    this.table.clear();
    this.declarations.clear();
    this.instances.clear();
    this.promises.clear();
    this.resolutionOrder = [];
    this.resolvingKeys.clear();
    this.warnedKeys.clear();
    this.logger = undefined;
  }
}

/**
 * Resets the global AliasRuntime singleton for test isolation.
 * Análogo a `_resetExtensionStore()`.
 */
export function _resetAliasRuntime(): void {
  getAliasRuntime()._reset();
}

export function getAliasRuntime(): AliasRuntime {
  const globalObj = globalThis as unknown as Record<symbol, AliasRuntime>;
  if (!globalObj[ALIAS_RUNTIME_KEY]) {
    globalObj[ALIAS_RUNTIME_KEY] = new DefaultAliasRuntime();
  }
  return globalObj[ALIAS_RUNTIME_KEY];
}
