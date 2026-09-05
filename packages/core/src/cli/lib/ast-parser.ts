import * as fs from "node:fs";
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import * as ts from "typescript";
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

export function extractOptionsFromTSObject(optionsArg: ts.ObjectLiteralExpression): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const prop of optionsArg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    
    let keyName = '';
    if (ts.isIdentifier(prop.name)) {
      keyName = prop.name.text;
    } else if (ts.isStringLiteral(prop.name)) {
      keyName = prop.name.text;
    }

    if (keyName && ts.isArrayLiteralExpression(prop.initializer)) {
      const arr: string[] = [];
      for (const elem of prop.initializer.elements) {
        if (ts.isStringLiteral(elem)) {
          arr.push(elem.text);
        }
      }
      options[keyName] = arr;
    } else if (keyName && ts.isStringLiteral(prop.initializer)) {
      options[keyName] = prop.initializer.text;
    }
  }
  return options;
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
    // Fallback 1: Try parsing with TypeScript for decorator support
    if (code) {
      try {
        const tsAst = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);
        ts.forEachChild(tsAst, function visit(node: ts.Node) {
          if (found) return;
          let callNode: ts.CallExpression | null = null;
          
          if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
            callNode = node.expression;
          } else if (ts.isCallExpression(node)) {
            callNode = node;
          }
          
          if (callNode && ts.isIdentifier(callNode.expression) && callNode.expression.text === calleeName) {
            const nameArg = callNode.arguments[0];
            if (nameArg && ts.isStringLiteral(nameArg)) {
              const name = nameArg.text;
              let options = {};
              const optionsArg = callNode.arguments[1];
              if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
                options = extractOptionsFromTSObject(optionsArg);
              }
              found = { name, options };
              if (process.env.DEBUG || process.argv.includes('--verbose')) {
                console.log(`[kerith check] INFO: Used TypeScript parser fallback for ${filePath}`);
              }
            }
          }
          if (!found) ts.forEachChild(node, visit);
        });
      } catch (tsError) {
        // Ignore TS parse errors and let the regex fallback operate
      }
    }
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
    // Fallback 1: Try parsing with TypeScript for decorator support
    if (code) {
      try {
        let tsUsed = false;
        const tsAst = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);
        ts.forEachChild(tsAst, function visit(node: ts.Node) {
          let callNode: ts.CallExpression | null = null;
          
          if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
            callNode = node.expression;
          } else if (ts.isCallExpression(node)) {
            callNode = node;
          }
          
          if (callNode && ts.isIdentifier(callNode.expression) && calleeNames.includes(callNode.expression.text)) {
            const nameArg = callNode.arguments[0];
            if (nameArg && ts.isStringLiteral(nameArg)) {
              const name = nameArg.text;
              let options = {};
              const optionsArg = callNode.arguments[1];
              if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
                options = extractOptionsFromTSObject(optionsArg);
              }
              found.push({ name, options, type: callNode.expression.text });
              tsUsed = true;
            }
          }
          ts.forEachChild(node, visit);
        });
        if (tsUsed && (process.env.DEBUG || process.argv.includes('--verbose'))) {
          console.log(`[kerith check] INFO: Used TypeScript parser fallback for ${filePath}`);
        }
      } catch (tsError) {
        // Ignore TS parse errors and let the regex fallback operate
      }
    }
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
    // Fallback 1: Try parsing with TypeScript for decorator support
    if (code) {
      try {
        const tsAst = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);
        ts.forEachChild(tsAst, function visit(node: ts.Node) {
          if (found) return;
          let callNode: ts.CallExpression | null = null;
          
          if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
            callNode = node.expression;
          } else if (ts.isCallExpression(node)) {
            callNode = node;
          }
          
          if (callNode && ts.isIdentifier(callNode.expression)) {
            const calleeName = callNode.expression.text;
            if (KERITH_TOP_LEVEL_CALLEES.includes(calleeName as KerithTopLevelIdentifierType)) {
              const nameArg = callNode.arguments[0];
              if (nameArg && ts.isStringLiteral(nameArg)) {
                let options = {};
                const optionsArg = callNode.arguments[1];
                if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
                  options = extractOptionsFromTSObject(optionsArg);
                }
                found = {
                  type: calleeName as KerithTopLevelIdentifierType,
                  name: nameArg.text,
                  options,
                };
                if (process.env.DEBUG || process.argv.includes('--verbose')) {
                  console.log(`[kerith check] INFO: Used TypeScript parser fallback for ${filePath}`);
                }
              }
            }
          }
          if (!found) ts.forEachChild(node, visit);
        });
      } catch (tsError) {
        // Ignore TS parse errors and let the regex fallback operate
      }
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

