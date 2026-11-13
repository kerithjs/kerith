// src/i18n/index.ts

import { createStructuralIdentifier } from '../structural/index.js';
import type { BaseStructuralOptions } from '../structural/types.js';

export interface LocaleOptions extends BaseStructuralOptions {
  code?: string;
  isDefault?: boolean;
}

export interface TranslationOptions extends BaseStructuralOptions {
  namespace?: string;
}

export interface FormatterOptions extends BaseStructuralOptions {
  type?: 'currency' | 'date' | 'number';
}

export interface TimezoneOptions extends BaseStructuralOptions {
  iana?: string;
  offset?: string;
}

export const Locale = createStructuralIdentifier<LocaleOptions>('Locale', 'i18n', true);
export const Translation = createStructuralIdentifier<TranslationOptions>('Translation', 'i18n', true);
export const Formatter = createStructuralIdentifier<FormatterOptions>('Formatter', 'i18n', true);
export const Timezone = createStructuralIdentifier<TimezoneOptions>('Timezone', 'i18n', true);

