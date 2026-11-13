// src/structural/store.ts

import type { StructuralEntry } from './types.js';

// ─── Internal Storage ─────────────────────────────────────────────────────────

const structuralEntries: StructuralEntry[] = [];

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerStructuralEntry(entry: StructuralEntry): void {
  structuralEntries.push(entry);
}

// ─── Getters ──────────────────────────────────────────────────────────────────

export function getStructuralEntries(): StructuralEntry[] {
  return [...structuralEntries];
}

export function getStructuralEntriesByType(type: string): StructuralEntry[] {
  return structuralEntries.filter((entry) => entry.type === type);
}

export function getStructuralEntriesByCategory(category: string): StructuralEntry[] {
  return structuralEntries.filter((entry) => entry.category === category);
}

// ─── Reset (tests only) ───────────────────────────────────────────────────────

export function _resetStructuralStore(): void {
  structuralEntries.length = 0;
}

