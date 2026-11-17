import * as fs from "node:fs";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import * as ts from "typescript";
import type { CallExpression, Literal, ObjectExpression, ArrayExpression } from 'estree';
import { KerithError } from '../../core/errors.js';

// Note about TypeScript and acorn parsing:
// Acorn does not support TS syntax natively — if parsing fails, the file falls back to
// the TypeScript compiler API to correctly parse Decorators and TS-specific structures.
export interface IdentifierCall {
  name: string;
  options: Record<string, unknown>;
  type?: string;
  callee?: string;
  prefix?: string;
  line?: number;
}

export interface ExtractMultipleOptions {
  /** If provided, only identifiers imported from one of these packages are returned. */
  validSources?: string[];
  /** If true, non-literal name throws ALIAS_INVALID with file and line. */
  strictLiteralName?: boolean;
  /** Optional warn callback for non-fatal issues (e.g. renamed imports). */
  warn?: (msg: string) => void;
}

export interface ModuleDeclaration {
  name: string;
  imports: string[];
}

export type KerithTopLevelIdentifierType = 'Domain' | 'Module' | 'SubModule';

export interface TopLevelIdentifier {
  type: KerithTopLevelIdentifierType;
  name: string;
  options: Record<string, unknown>;
}

const KERITH_TOP_LEVEL_CALLEES: KerithTopLevelIdentifierType[] = [
  'Domain',
  'Module',
  'SubModule',
];

export function extractOptionsFromSource(src: string): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  if (!src) return options;

  // Extract strings: module: 'subscriptions'
  const stringRegex = /([a-zA-Z0-9_]+)\s*:\s*['"]([^'"]+)['"]/g;
  let strMatch;
  while ((strMatch = stringRegex.exec(src)) !== null) {
    options[strMatch[1]] = strMatch[2];
  }

  // Extract simple arrays: imports: ['a', 'b']
  const arrayRegex = /([a-zA-Z0-9_]+)\s*:\s*\[([^\]]+)\]/g;
  let arrMatch;
  while ((arrMatch = arrayRegex.exec(src)) !== null) {
    const key = arrMatch[1];
    const elementsStr = arrMatch[2];
    const elements = elementsStr.split(',').map(e => {
      const trimmed = e.trim();
      const match = trimmed.match(/^['"]([^'"]+)['"]$/);
      return match ? match[1] : undefined;
    }).filter(e => e !== undefined) as string[];
    
    if (elements.length > 0) {
      options[key] = elements;
    }
  }

  return options;
}

/**
 * Internal TS-compiler-based extractor shared by all three public extractors.
 *
 * Uses `ts.createSourceFile` with `setParentNodes: true` so callers can walk
 * upward in the tree if needed in the future (no cost for current callers).
 *
 * `visit` uses `ts.forEachChild` which naturally descends into decorator
 * expressions — no special-casing per node kind is needed because the TS
 * compiler represents `@Foo(...)` as a `Decorator` node whose `.expression`
 * is a regular `CallExpression`; `forEachChild` visits it on the way down.
 *
 * Supported option value types (mirrors `extractOptionsFromSource`):
 *   - string literals
 *   - numeric literals (coerced to string, same as acorn path)
 *   - arrays of string literals
 *   - nested object literals (recursive — fixes the brace-truncation bug of
 *     the regex path confirmed in Fase 5.0)
 *
 * NOT supported (same limits as today, intentional — out of scope for Fase 5):
 *   - spread elements (`...obj`)
 *   - template literals (`` `foo` ``)
 *   - references to variables (`schema: createUserSchema`)
 */
const ALIAS_CALLEE_NAMES = new Set(['Config', 'Client', 'Store', 'Provider', 'Adapter']);
const DEFAULT_KERITH_SOURCES = new Set(['@kerith/app', '@kerith/identifiers']);

function extractCallsViaTsCompiler(
  code: string,
  calleeNames: string[],
  filePath = 'temp.ts',
  options?: ExtractMultipleOptions,
): IdentifierCall[] {
  const found: IdentifierCall[] = [];
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    filePath.endsWith('.js') || filePath.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );

  const importMap = new Map<string, { original: string; fromKerith: boolean; renamed: boolean }>();
  const validSources = options?.validSources ? new Set(options.validSources) : DEFAULT_KERITH_SOURCES;

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const src = node.moduleSpecifier.text;
      const isKerith = validSources.has(src);
      const clause = node.importClause;
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          const original = el.propertyName?.text ?? el.name.text;
          const local = el.name.text;
          importMap.set(local, { original, fromKerith: isKerith, renamed: local !== original });
        }
      }
    }
  });

  function extractOptionsFromObjectLiteral(obj: ts.ObjectLiteralExpression): Record<string, unknown> {
    const options: Record<string, unknown> = {};
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = ts.isIdentifier(prop.name) ? prop.name.text
        : ts.isStringLiteral(prop.name) ? prop.name.text
        : undefined;
      if (!key) continue;

      if (ts.isStringLiteral(prop.initializer) || ts.isNumericLiteral(prop.initializer)) {
        options[key] = prop.initializer.text;
      } else if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        options[key] = true;
      } else if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
        options[key] = false;
      } else if (ts.isArrayLiteralExpression(prop.initializer)) {
        options[key] = prop.initializer.elements
          .filter(ts.isStringLiteral)
          .map(el => el.text);
      } else if (ts.isObjectLiteralExpression(prop.initializer)) {
        // Recursive — unlike the current regex, this correctly handles nested
        // objects like { metadata: { guards: ['jwt'] } } without truncation.
        options[key] = extractOptionsFromObjectLiteral(prop.initializer);
      }
    }
    return options;
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const localName = node.expression.text;
      const importInfo = importMap.get(localName);
      const callee = importInfo?.original ?? localName;

      if (calleeNames.includes(callee)) {
        const isAlias = ALIAS_CALLEE_NAMES.has(callee) || Boolean(options?.validSources);
        const { line } = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart());
        const lineNum = line + 1;

        if (isAlias) {
          if (importInfo?.renamed) {
            (options?.warn ?? console.warn)(
              `Renamed import of "${callee}" in ${filePath}:${lineNum} is not supported by the static alias scanner in v1. Use "import { ${callee} } from '@kerith/identifiers'" directly.`
            );
            ts.forEachChild(node, visit);
            return;
          }

          if (!importInfo?.fromKerith) {
            // Not imported from @kerith/app or @kerith/identifiers — skip user function with same name
            ts.forEachChild(node, visit);
            return;
          }

          const nameArg = node.arguments[0];
          if (!nameArg || !ts.isStringLiteral(nameArg)) {
            throw new KerithError(
              'ALIAS_INVALID',
              `Alias identifier call "${callee}" in ${filePath}:${lineNum} has a non-literal name. Alias names must be string literals.`
            );
          }

          const optionsArg = node.arguments.find(
            (arg, idx) => idx > 0 && ts.isObjectLiteralExpression(arg),
          ) as ts.ObjectLiteralExpression | undefined;

          const optObj = optionsArg
            ? extractOptionsFromObjectLiteral(optionsArg)
            : {};

          found.push({
            name: nameArg.text,
            options: optObj,
            type: callee,
            callee,
            prefix: callee.toLowerCase(),
            line: lineNum,
          });
          ts.forEachChild(node, visit);
          return;
        }

        // Non-alias callee (Domain, Module, Controller, etc.)
        const [nameArg, optionsArg] = node.arguments;
        if (nameArg && ts.isStringLiteral(nameArg)) {
          const optObj = optionsArg && ts.isObjectLiteralExpression(optionsArg)
            ? extractOptionsFromObjectLiteral(optionsArg)
            : {};
          found.push({
            name: nameArg.text,
            options: optObj,
            type: callee,
            callee,
            prefix: callee.toLowerCase(),
            line: lineNum,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

export async function extractIdentifierCall(
  filePath: string,
  calleeName: string
): Promise<IdentifierCall | null> {
  let found: IdentifierCall | null = null;
  let code = "";

  try {
    code = await fs.promises.readFile(filePath, "utf-8");
    const ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });

    walk.simple(ast, {
      CallExpression(node) {
        const call = node as unknown as CallExpression;
        if (call.callee.type === 'Identifier' && call.callee.name === calleeName) {
          const nameArg = call.arguments[0] as Literal;
          if (nameArg && nameArg.type === "Literal") {
            const name = nameArg.value as string;
            const options: Record<string, unknown> = {};

            const optionsArg = call.arguments[1] as ObjectExpression;
            if (optionsArg && optionsArg.type === "ObjectExpression") {
              for (const prop of optionsArg.properties) {
                if (prop.type !== 'Property') continue;
                
                let keyName = '';
                if (prop.key.type === "Identifier") {
                  keyName = prop.key.name;
                } else if (prop.key.type === "Literal") {
                  keyName = String(prop.key.value);
                }

                if (keyName && prop.value.type === "ArrayExpression") {
                  const arr: string[] = [];
                  const arrayVal = prop.value as ArrayExpression;
                  for (const elem of arrayVal.elements) {
                    if (elem && elem.type === "Literal") {
                      arr.push(String(elem.value));
                    }
                  }
                  options[keyName] = arr;
                } else if (keyName && prop.value.type === "Literal") {
                  options[keyName] = prop.value.value;
                }
              }
            }

            found = { name, options };
          }
        }
      },
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    // Fallback 1: acorn failed (e.g. decorator syntax) — try TypeScript compiler.
    if (code) {
      try {
        const results = extractCallsViaTsCompiler(code, [calleeName]);
        if (results.length > 0) {
          const { name, options } = results[0];
          found = { name, options };
          if (process.env.DEBUG || process.argv.includes('--verbose')) {
            console.log(`[kerith check] INFO: Used TypeScript parser fallback for ${filePath}`);
          }
        }
      } catch {
        // TS compiler also failed — fall through to regex last resort below.
      }
    }
  }

  // Last-resort fallback: Acorn does not parse TypeScript natively (interfaces,
  // types, strong typings). Regex support is explicitly documented and centralized
  // here as the final safety net.
  if (!found && code) {
    const regex = new RegExp(`${calleeName}\\s*\\(\\s*['"]([^'"]+)['"](?:\\s*,\\s*(\\{[^}]+\\}))?`, "g");
    let match;
    while ((match = regex.exec(code)) !== null) {
      found = { 
        name: match[1], 
        options: extractOptionsFromSource(match[2] ?? '')
      };
    }
  }

  return found;
}

export async function extractMultipleIdentifierCalls(
  filePath: string,
  calleeNames: string[],
  options?: ExtractMultipleOptions,
): Promise<IdentifierCall[]> {
  const found: IdentifierCall[] = [];
  let code = "";

  try {
    code = await fs.promises.readFile(filePath, "utf-8");
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  // If scanning for alias identifiers or custom valid sources, use the TS compiler directly
  // so decorators, type annotations, and import tracking are fully supported.
  if (calleeNames.some((c) => ALIAS_CALLEE_NAMES.has(c)) || options?.validSources) {
    return extractCallsViaTsCompiler(code, calleeNames, filePath, options);
  }

  try {
    const ast = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });

    walk.simple(ast, {
      CallExpression(node) {
        const call = node as unknown as CallExpression;
        if (call.callee.type === 'Identifier' && calleeNames.includes(call.callee.name)) {
          const nameArg = call.arguments[0] as Literal;
          if (nameArg && nameArg.type === "Literal") {
            const name = nameArg.value as string;
            const options: Record<string, unknown> = {};

            const optionsArg = call.arguments[1] as ObjectExpression;
            if (optionsArg && optionsArg.type === "ObjectExpression") {
              for (const prop of optionsArg.properties) {
                if (prop.type !== 'Property') continue;
                
                let keyName = '';
                if (prop.key.type === "Identifier") {
                  keyName = prop.key.name;
                } else if (prop.key.type === "Literal") {
                  keyName = String(prop.key.value);
                }

                if (keyName && prop.value.type === "ArrayExpression") {
                  const arr: string[] = [];
                  const arrayVal = prop.value as ArrayExpression;
                  for (const elem of arrayVal.elements) {
                    if (elem && elem.type === "Literal") {
                      arr.push(String(elem.value));
                    }
                  }
                  options[keyName] = arr;
                } else if (keyName && prop.value.type === "Literal") {
                  options[keyName] = prop.value.value;
                }
              }
            }

            found.push({ name, options, type: call.callee.name });
          }
        }
      },
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    // Fallback 1: acorn failed (e.g. decorator syntax) — try TypeScript compiler.
    if (code) {
      try {
        const results = extractCallsViaTsCompiler(code, calleeNames);
        if (results.length > 0) {
          for (const r of results) {
            found.push(r);
          }
          if (process.env.DEBUG || process.argv.includes('--verbose')) {
            console.log(`[kerith check] INFO: Used TypeScript parser fallback for ${filePath}`);
          }
        }
      } catch {
        // TS compiler also failed — fall through to regex last resort below.
      }
    }
  }

  // Last-resort fallback: Acorn does not parse TypeScript natively.
  // Run regex only for any callee not already covered by acorn or TS compiler.
  if (code) {
    const foundCallees = new Set(found.map(f => f.type));
    for (const calleeName of calleeNames) {
      if (foundCallees.has(calleeName)) continue;

      const regex = new RegExp(`${calleeName}\\s*\\(\\s*['"]([^'"]+)['"](?:\\s*,\\s*(\\{[^}]+\\}))?`, "g");
      let match;
      while ((match = regex.exec(code)) !== null) {
        found.push({ 
          name: match[1], 
          options: extractOptionsFromSource(match[2] ?? ''),
          type: calleeName
        });
      }
    }
  }

  return found;
}

export async function extractModuleDeclaration(
  indexPath: string,
): Promise<ModuleDeclaration | null> {
  const result = await extractIdentifierCall(indexPath, 'Module');
  if (!result) return null;

  return {
    name: result.name,
    imports: Array.isArray(result.options.imports) ? (result.options.imports as string[]) : [],
  };
}

/**
 * Returns the first top-level Kerith identifier call in an index file (source order).
 * `null` when the file has no Domain / Module / SubModule call.
 */
export async function extractTopLevelIdentifier(
  filePath: string,
): Promise<TopLevelIdentifier | null> {
  let found: TopLevelIdentifier | null = null;
  let code = '';

  try {
    code = await fs.promises.readFile(filePath, 'utf-8');
    const ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    });

    walk.simple(ast, {
      CallExpression(node) {
        if (found) return;
        const call = node as unknown as CallExpression;
        if (call.callee.type !== 'Identifier') return;
        const calleeName = call.callee.name;
        if (!KERITH_TOP_LEVEL_CALLEES.includes(calleeName as KerithTopLevelIdentifierType)) {
          return;
        }

        const nameArg = call.arguments[0] as Literal;
        if (!nameArg || nameArg.type !== 'Literal' || typeof nameArg.value !== 'string') {
          return;
        }

        const options: Record<string, unknown> = {};
        const optionsArg = call.arguments[1] as ObjectExpression;
        if (optionsArg && optionsArg.type === 'ObjectExpression') {
          for (const prop of optionsArg.properties) {
            if (prop.type !== 'Property') continue;

            let keyName = '';
            if (prop.key.type === 'Identifier') {
              keyName = prop.key.name;
            } else if (prop.key.type === 'Literal') {
              keyName = String(prop.key.value);
            }

            if (keyName && prop.value.type === 'ArrayExpression') {
              const arr: string[] = [];
              const arrayVal = prop.value as ArrayExpression;
              for (const elem of arrayVal.elements) {
                if (elem && elem.type === 'Literal') {
                  arr.push(String(elem.value));
                }
              }
              options[keyName] = arr;
            } else if (keyName && prop.value.type === 'Literal') {
              options[keyName] = prop.value.value;
            }
          }
        }

        found = {
          type: calleeName as KerithTopLevelIdentifierType,
          name: nameArg.value,
          options,
        };
      },
    });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'ENOENT') {
      return null;
    }
    // Fallback 1: acorn failed (e.g. decorator syntax) — try TypeScript compiler.
    if (code) {
      try {
        const results = extractCallsViaTsCompiler(code, [...KERITH_TOP_LEVEL_CALLEES]);
        if (results.length > 0) {
          // Honour source order: pick the result whose callee appears earliest.
          // extractCallsViaTsCompiler visits in source order via forEachChild,
          // so the first result is already the earliest.
          const first = results[0];
          found = {
            type: first.type as KerithTopLevelIdentifierType,
            name: first.name,
            options: first.options,
          };
          if (process.env.DEBUG || process.argv.includes('--verbose')) {
            console.log(`[kerith check] INFO: Used TypeScript parser fallback for ${filePath}`);
          }
        }
      } catch {
        // TS compiler also failed — fall through to regex last resort below.
      }
    }
  }

  // Last-resort fallback: regex, preserving earliest-match semantics.
  if (!found && code) {
    let earliest: { index: number; type: KerithTopLevelIdentifierType; name: string; optionsSrc: string } | null = null;
    for (const calleeName of KERITH_TOP_LEVEL_CALLEES) {
      const regex = new RegExp(
        `${calleeName}\\s*\\(\\s*['"]([^'"]+)['"](?:\\s*,\\s*(\\{[^}]+\\}))?`,
        'g',
      );
      let match: RegExpExecArray | null;
      while ((match = regex.exec(code)) !== null) {
        if (!earliest || match.index < earliest.index) {
          earliest = {
            index: match.index,
            type: calleeName,
            name: match[1],
            optionsSrc: match[2] ?? '',
          };
        }
      }
    }
    if (earliest) {
      found = {
        type: earliest.type,
        name: earliest.name,
        options: extractOptionsFromSource(earliest.optionsSrc),
      };
    }
  }

  return found;
}
