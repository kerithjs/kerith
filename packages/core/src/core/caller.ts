import path from "node:path";
import { fileURLToPath } from "node:url";
import { KerithError } from "./errors.js";

/**
 * Internal helper — walks the V8 call stack to find the user's file that
 * invoked a Kerith identifier function.
 *
 * Expected stack layout (depth is stable across both in-package and
 * cross-package call sites):
 *
 *   0 — resolveCallerFile             (this function)
 *   1 — getFileCallerInfo /
 *       getModuleCallerInfo            (the public helper)
 *   2 — identifier function            (e.g. Service(), Guard() — may live
 *                                       in @kerith/core OR @kerith/identifiers)
 *   3 — user's source file             (the path we return)
 *
 * Depth 3 is correct whether the identifier belongs to `@kerith/core` or to
 * `@kerith/identifiers` — the wrapper layer count is identical in both cases.
 */
function resolveCallerFile(identifierName: string): string {
  const originalFunc = Error.prepareStackTrace;
  let callerFile: string | null = null;

  try {
    const err = new Error();
    Error.prepareStackTrace = (_, stack) => stack;
    const stack = err.stack as unknown as NodeJS.CallSite[];
    // stack[0]=resolveCallerFile, [1]=getFileCallerInfo/getModuleCallerInfo, [2]=identifier fn, [3]=user file
    if (stack && stack.length > 3) {
      callerFile = stack[3].getFileName() || null;
    }
  } catch {
    // getFileName() is unavailable in this environment;
    // the null-check below will throw a descriptive KerithError.
  } finally {
    Error.prepareStackTrace = originalFunc;
  }

  if (!callerFile) {
    throw new KerithError(
      "INVALID_MODULE_DECLARATION",
      `${identifierName} could not determine caller path. Stack trace unavailable.`,
      "Ensure you are using Node.js >= 20.6 with ESM and no bundler obfuscation.",
    );
  }

  // Normalise ESM file:// URLs to OS-native paths
  if (callerFile.startsWith("file://")) {
    callerFile = fileURLToPath(callerFile);
  }

  return callerFile;
}

/**
 * Returns the caller's file path and its containing directory.
 * Used by `Module()`, which needs both pieces to enforce naming rules.
 */
export function getModuleCallerInfo(identifierName: string): {
  filePath: string;
  dirPath: string;
} {
  const filePath = resolveCallerFile(identifierName);
  return { filePath, dirPath: path.dirname(filePath) };
}

/**
 * Returns the absolute file path of the source file that called a Kerith
 * identifier function.
 *
 * **Public API** — exported from `@kerith/core` for use by identifier
 * packages (e.g. `@kerith/identifiers`). Every non-Module identifier that
 * needs to know its declaration site should call this function directly.
 *
 * @param identifierName - Human-readable name shown in error messages
 *   (e.g. `"Service"`, `"Guard"`).
 * @returns An object with `filePath` — the OS-native absolute path of the
 *   user's source file.
 */
export function getFileCallerInfo(identifierName: string): {
  filePath: string;
} {
  return { filePath: resolveCallerFile(identifierName) };
}
