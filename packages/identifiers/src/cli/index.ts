// src/cli/index.ts

import { createStructuralIdentifier } from '../structural/index.js';
import type { BaseStructuralOptions } from '../structural/types.js';

export interface CommandOptions extends BaseStructuralOptions {
  alias?: string;
  usage?: string;
}

export interface SubcommandOptions extends BaseStructuralOptions {
  parent?: string;
}

export interface OptionOptions extends BaseStructuralOptions {
  flag?: string;
  type?: 'string' | 'boolean' | 'number';
  required?: boolean;
}

export interface ArgumentOptions extends BaseStructuralOptions {
  position?: number;
  required?: boolean;
}

export interface PromptOptions extends BaseStructuralOptions {
  type?: 'input' | 'select' | 'confirm';
}

export interface ScriptOptions extends BaseStructuralOptions {
  runtime?: 'node' | 'bash';
}

export interface HookOptions extends BaseStructuralOptions {
  event?: 'pre-run' | 'post-run' | 'error';
}

export const Command = createStructuralIdentifier<CommandOptions>('Command', 'cli', true);
export const Subcommand = createStructuralIdentifier<SubcommandOptions>('Subcommand', 'cli', true);
export const Option = createStructuralIdentifier<OptionOptions>('Option', 'cli', true);
export const Argument = createStructuralIdentifier<ArgumentOptions>('Argument', 'cli', true);
export const Prompt = createStructuralIdentifier<PromptOptions>('Prompt', 'cli', true);
export const Script = createStructuralIdentifier<ScriptOptions>('Script', 'cli', true);
export const Hook = createStructuralIdentifier<HookOptions>('Hook', 'cli', true);
