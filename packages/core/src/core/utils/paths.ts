import path from 'node:path';

/**
 * Normalizes a file path to be consistent across different environments (especially Windows).
 * 
 * - Normalizes slashes to the OS default.
 * - Forces Windows drive letters to Uppercase (e.g., C:\ instead of c:\).
 * - Resolves relative segments.
 */
export function normalizePath(filePath: string): string {
  if (!filePath) return filePath;
  
  // 1. Basic path normalization
  let normalized = path.normalize(filePath).replace(/\\/g, '/');
  
  // 2. Handle Windows drive letter casing
  if (process.platform === 'win32' && /^[a-z]:/i.test(normalized)) {
    normalized = normalized[0].toUpperCase() + normalized.slice(1);
  }
  
  // 3. Ensure we use the standard path.sep (handled by path.normalize mostly, but just in case)
  // We actually prefer sticking to what Node uses internally for consistency.
  
  return normalized;
}

/**
 * Groups an array of absolute file paths into their closest matching module directories.
 * It automatically sorts module paths by length descending to ensure nested sub-modules match correctly.
 * 
 * @param files Array of absolute file paths
 * @param modulePaths Array of absolute module directory paths
 * @returns A Map linking each module path to the array of files that fall under it
 */
export function groupFilesByModulePath(files: string[], modulePaths: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  
  // Sort paths by length descending so that 'src/modules/users/orders' matches before 'src/modules/users'
  const sortedModPaths = [...modulePaths].map(normalizePath).sort((a, b) => b.length - a.length);

  for (const modPath of sortedModPaths) {
    result.set(modPath, []);
  }

  for (const file of files) {
    const normalizedFile = normalizePath(file);
    for (const modPath of sortedModPaths) {
      if (normalizedFile.startsWith(modPath + '/')) {
        result.get(modPath)!.push(file);
        break;
      }
    }
  }

  return result;
}
