import * as fs from "node:fs";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import type { CallExpression, Literal, ObjectExpression, ArrayExpression } from 'estree';

// Note about TypeScript and acorn parsing:
// Acorn does not support TS syntax natively — if parsing fails, the file is silently skipped;
// for compiled TS projects, it is recommended to parse the JS output from the `dist/` folder.
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

export function extractIdentifierCall(
  filePath: string,
  calleeName: string
): IdentifierCall | null {
  let found: IdentifierCall | null = null;
  let code = "";

  try {
    code = fs.readFileSync(filePath, "utf-8");
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
    // Ignore acorn parse errors for now to allow fallback to operate
  }

  // Fallback: Acorn does not parse TypeScript natively (interfaces, types, strong typings).
  // Regex support is explicitly documented and centralized here as a fallback.
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

export function extractMultipleIdentifierCalls(
  filePath: string,
  calleeNames: string[]
): IdentifierCall[] {
  const found: IdentifierCall[] = [];
  let code = "";

  try {
    code = fs.readFileSync(filePath, "utf-8");
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
    // Ignore acorn parse errors for now to allow fallback to operate
  }

  // Fallback: Acorn does not parse TypeScript natively.
  // Run regex for any callee that wasn't found by the AST traversal
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

export function extractModuleDeclaration(
  indexPath: string,
): ModuleDeclaration | null {
  const result = extractIdentifierCall(indexPath, 'Module');
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
export function extractTopLevelIdentifier(
  filePath: string,
): TopLevelIdentifier | null {
  let found: TopLevelIdentifier | null = null;
  let code = '';

  try {
    code = fs.readFileSync(filePath, 'utf-8');
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
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
  }

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

