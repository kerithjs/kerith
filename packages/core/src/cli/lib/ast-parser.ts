import * as fs from "node:fs";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import * as ts from "typescript";
import type { CallExpression, Literal, ObjectExpression, ArrayExpression } from 'estree';

// Note about TypeScript and acorn parsing:
// Acorn does not support TS syntax natively — if parsing fails, the file falls back to
// the TypeScript compiler API to correctly parse Decorators and TS-specific structures.
export interface IdentifierCall {
  name: string;
  options: Record<string, unknown>;
  type?: string;
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
function extractCallsViaTsCompiler(
  code: string,
  calleeNames: string[],
): Array<{ name: string; options: Record<string, unknown>; type: string }> {
  const found: Array<{ name: string; options: Record<string, unknown>; type: string }> = [];
  const sourceFile = ts.createSourceFile('temp.ts', code, ts.ScriptTarget.Latest, /* setParentNodes */ true, ts.ScriptKind.TS);

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
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && calleeNames.includes(node.expression.text)) {
      const [nameArg, optionsArg] = node.arguments;
      if (nameArg && ts.isStringLiteral(nameArg)) {
        const options = optionsArg && ts.isObjectLiteralExpression(optionsArg)
          ? extractOptionsFromObjectLiteral(optionsArg)
          : {};
        found.push({ name: nameArg.text, options, type: node.expression.text });
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
  calleeNames: string[]
): Promise<IdentifierCall[]> {
  const found: IdentifierCall[] = [];
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
