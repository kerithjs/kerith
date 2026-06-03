import path from 'node:path';
import { KerithError, type KerithErrorCode } from '../errors.js';
import { normalizePath } from '../utils/paths.js';

export function assertNameMatchesFolder(
  name: string,
  dirPath: string,
  errorCode: KerithErrorCode,
  identifierLabel: string,
): void {
  const normalizedDirPath = normalizePath(dirPath);
  if (!normalizedDirPath) return;

  const folderName = path.basename(normalizedDirPath);
  if (folderName && folderName !== name) {
    throw new KerithError(
      errorCode,
      `${identifierLabel} name "${name}" does not match its containing folder "${folderName}".`,
      `The name in ${identifierLabel}() MUST match the folder name exactly.`,
    );
  }
}

export function assertCalledFromIndex(
  indexPath: string,
  errorCode: KerithErrorCode,
  identifierLabel: string,
): void {
  const fileName = path.basename(indexPath);
  const isIndexFile = /^index\.(ts|js|mts|mjs)(\?.*)?$/i.test(fileName);
  if (!isIndexFile) {
    throw new KerithError(
      errorCode,
      `${identifierLabel}() was called from "${fileName}", but it must be called only from the index file.`,
      `File: ${indexPath}`,
    );
  }
}
