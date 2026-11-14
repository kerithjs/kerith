import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { KerithError } from '../core/errors.js';
import { assertValidIdentifierName } from '../extension/index.js';

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

export interface AliasDeclarationOptions {
  lazy?: boolean;
  timeout?: number;
  required?: boolean;
  dispose?: (instance: unknown) => void | Promise<void>;
  [key: string]: unknown;
}

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
  declare(declaration: Omit<AliasDeclaration, 'key'> & { key?: string }): void;
  get(key: string): Promise<unknown>;
  registerTableEntry(key: string, filePath: string): void;
  setTable(entries: Record<string, string> | Map<string, string>): void;
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

class DefaultAliasRuntime implements AliasRuntime {
  public table = new Map<string, string>();
  public declarations = new Map<string, AliasDeclaration>();
  public instances = new Map<string, unknown>();
  public promises = new Map<string, Promise<unknown>>();
  public resolutionOrder: string[] = [];
  private resolvingKeys = new Set<string>();

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

  public declare(declInput: Omit<AliasDeclaration, 'key'> & { key?: string }): void {
    assertValidIdentifierName(declInput.name, 'Alias identifier');
    assertValidIdentifierName(declInput.prefix, 'Alias prefix');

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
        ...declInput.options,
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
        const available = Array.from(this.table.keys());
        const similar = findSimilarKeys(key, available);
        const suggestionMsg = similar.length > 0 ? ` Did you mean: ${similar.map((s) => `@${s}`).join(', ')}?` : '';
        throw new KerithError(
          'ALIAS_NOT_FOUND',
          `Alias "@${key}" not found in static alias table.${suggestionMsg}`,
          `Available aliases: ${available.map((a) => `@${a}`).join(', ')}`,
        );
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
        'CIRCULAR_DEPENDENCY',
        `Circular dependency detected while resolving alias "@${key}".`,
        `Resolution path: ${Array.from(this.resolvingKeys).join(' -> ')} -> ${key}`,
      );
    }

    this.resolvingKeys.add(key);

    try {
      const timeoutMs = decl.options.timeout ?? 30000;
      let factoryPromise = Promise.resolve().then(() => decl.factory());

      if (timeoutMs > 0) {
        let timer: NodeJS.Timeout;
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new KerithError(
                'MODULE_LOAD_TIMEOUT',
                `Factory execution timed out after ${timeoutMs}ms for alias "@${key}".`,
                `File: ${decl.filePath}`,
              ),
            );
          }, timeoutMs);
        });

        factoryPromise = Promise.race([
          factoryPromise.finally(() => clearTimeout(timer)),
          timeoutPromise,
        ]);
      }

      const instance = await factoryPromise;
      this.instances.set(key, instance);
      this.resolutionOrder.push(key);
      return instance;
    } catch (err: any) {
      if (decl.options.required === false) {
        console.warn(
          `[Kerith] Warning: Non-required alias "@${key}" factory threw an error. Returning undefined. Error: ${err?.message ?? String(err)}`,
        );
        this.instances.set(key, undefined);
        this.resolutionOrder.push(key);
        return undefined;
      }
      throw err;
    } finally {
      this.resolvingKeys.delete(key);
    }
  }

  public async disposeAll(): Promise<void> {
    // Reverse resolution order (LIFO)
    const order = [...this.resolutionOrder].reverse();

    for (const key of order) {
      const decl = this.declarations.get(key);
      const instance = this.instances.get(key);

      if (decl?.options.dispose && typeof decl.options.dispose === 'function') {
        try {
          await decl.options.dispose(instance);
        } catch (err: any) {
          console.error(`[Kerith] Error disposing alias "@${key}":`, err);
        }
      }
    }

    this._reset();
  }

  public _reset(): void {
    this.table.clear();
    this.declarations.clear();
    this.instances.clear();
    this.promises.clear();
    this.resolutionOrder = [];
    this.resolvingKeys.clear();
  }
}

export function getAliasRuntime(): AliasRuntime {
  const globalObj = globalThis as unknown as Record<symbol, AliasRuntime>;
  if (!globalObj[ALIAS_RUNTIME_KEY]) {
    globalObj[ALIAS_RUNTIME_KEY] = new DefaultAliasRuntime();
  }
  return globalObj[ALIAS_RUNTIME_KEY];
}

