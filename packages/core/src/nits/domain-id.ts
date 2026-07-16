import { randomBytes } from 'node:crypto';

/**
 * Generates a stable and unique identifier for a domain.
 * Format: dom_[8 random hex chars]
 *
 * Unlike generateModuleId(), this takes no existingIds parameter — domains
 * are created one at a time (kerith create-domain, or bootstrap discovery of
 * a single Domain() without a registry yet), never in a batch reconciliation
 * cycle, so there is no risk of in-batch collision to guard against.
 */
export function generateDomainId(): string {
  return `dom_${randomBytes(4).toString('hex')}`;
}

/**
 * Validates if a string is a valid domain ID.
 */
export function isValidDomainId(id: string): boolean {
  return /^dom_[0-9a-f]{8}$/.test(id);
}
