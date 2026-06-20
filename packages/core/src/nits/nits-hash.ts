import { createHash } from 'node:crypto';
import path from 'node:path';
import fg from 'fast-glob';
import { DEFAULT_SIMILARITY_THRESHOLD, MINIMUM_SIMILARITY_THRESHOLD } from './constants.js';
import { extractIdentifierCall, extractMultipleIdentifierCalls } from '../cli/lib/ast-parser.js';

/**
 * Calculates the Jaccard Similarity between two sets of strings.
 * Jaccard Index = (Set A ∩ Set B) / (Set A ∪ Set B)
 */
export function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  
  // O(min(N,M)) allocation-free intersection
  let intersectionSize = 0;
  const [smaller, larger] = setA.size < setB.size ? [setA, setB] : [setB, setA];
  
  for (const item of smaller) {
    if (larger.has(item)) {
      intersectionSize++;
    }
  }
  
  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Computes the similarity between two arrays (or precomputed Sets) of identifiers.
 * returns a number between 0 and 1.
 */
export function hashSimilarity(
  idsA: string[] | Set<string>,
  idsB: string[] | Set<string>
): number {
  const setA = idsA instanceof Set ? idsA : new Set(idsA);
  const setB = idsB instanceof Set ? idsB : new Set(idsB);
  return calculateJaccardSimilarity(setA, setB);
}

/**
 * Returns a dynamic threshold based on the number of identifiers.
 */
export function getDynamicThreshold(identifierCount: number): number {
  if (identifierCount <= 0) return DEFAULT_SIMILARITY_THRESHOLD;
  
  const formulaValue = 1 - (1 / identifierCount);
  return Math.min(
    DEFAULT_SIMILARITY_THRESHOLD,
    Math.max(MINIMUM_SIMILARITY_THRESHOLD, formulaValue)
  );
}

/**
 * Checks if two sets of identifiers are similar enough to be considered
 * the same identity.
 */
export function areIdentitiesSimilar(
  oldIdentifiers: string[],
  newIdentifiers: string[],
  configThreshold?: number
): { isSimilar: boolean; similarity: number; thresholdUsed: number } {
  if (oldIdentifiers.length === 0 && newIdentifiers.length === 0) {
    return { isSimilar: false, similarity: 1, thresholdUsed: configThreshold ?? getDynamicThreshold(0) };
  }

  const oldSet = new Set(oldIdentifiers);
  const newSet = new Set(newIdentifiers);
  const similarity = calculateJaccardSimilarity(oldSet, newSet);
  
  const thresholdUsed = configThreshold ?? getDynamicThreshold(Math.max(oldSet.size, newSet.size));
  
  return {
    isSimilar: similarity >= thresholdUsed,
    similarity,
    thresholdUsed
  };
}

/**
 * Computes a semantic SHA-1 hash for a module based on its 
 * declared identifiers (Services, Controllers, etc.).
 * 
 * Target keywords: Service, Repository, Schema.
 * 
 * @param dirPath Absolute path to the module directory
 * @returns Object with truncated SHA-1 hash (10 characters) and the list of identifiers
 */
export async function computeModuleHash(
  dirPath: string,
  preloadedFiles?: string[]
): Promise<{ hash: string; identifiers: string[] }> {
  const hash = createHash('sha1');
  
  const files = preloadedFiles ?? await fg('**/*.{ts,js,mts,mjs}', {
    cwd: dirPath,
    absolute: true,
    ignore: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts', 'index.*']
  });
  
  // NOTE: 'Controller' is intentionally excluded — its first argument is an HTTP route
  // path (e.g. '/users'), not a semantic domain name. Including it would store route
  // strings as module identifiers, causing false-positive Jaccard matches between any
  // two modules sharing the same prefix (BUG-1).
  const targetCallees = ['Service', 'Repository', 'Schema'];
  const allIdentifiers: string[] = [];
  
  for (const file of files) {
    const results = extractMultipleIdentifierCalls(file, targetCallees);
    for (const result of results) {
      allIdentifiers.push(result.name);
    }
  }
  
  // Deterministic sorting and unique values for a semantic signature
  const uniqueIdentifiers = Array.from(new Set(allIdentifiers)).sort();
  const signature = uniqueIdentifiers.join(',');
  
  // Fallback: If no identifiers are found in the entire module, 
  // hash the relative file structure to detect changes.
  if (signature === '') {
    const fileStructure = files.map(f => path.relative(dirPath, f)).sort().join(',');
    hash.update(fileStructure);
  } else {
    hash.update(signature);
  }
  
  return {
    hash: hash.digest('hex').substring(0, 10),
    identifiers: uniqueIdentifiers
  };
}
