// src/channels/index.ts

import type { AliasPlugin, MiddlewarePlugin, SchedulePlugin, BindingPlugin } from './types.js'

// ─── Internal Stores ──────────────────────────────────────────────────────────
// Private to the module. Only accessible through exported getters.

const aliasPlugins: AliasPlugin[] = []
const middlewarePlugins: MiddlewarePlugin[] = []
const schedulePlugins: SchedulePlugin[] = []
const bindingPlugins: BindingPlugin[] = []

// ─── Registration ─────────────────────────────────────────────────────────────
// Used internally by each logical identifier.
// NOT exported from src/index.ts.

export function registerAliasPlugin(plugin: AliasPlugin): void {
  aliasPlugins.push(plugin)
}

export function registerMiddlewarePlugin(plugin: MiddlewarePlugin): void {
  // Avoids duplicates — the plugin is registered when importing the identifier module,
  // not every time the user calls the identifier.
  if (!middlewarePlugins.includes(plugin)) {
    middlewarePlugins.push(plugin)
  }
}

export function registerSchedulePlugin(plugin: SchedulePlugin): void {
  schedulePlugins.push(plugin)
}

export function registerBindingPlugin(plugin: BindingPlugin): void {
  bindingPlugins.push(plugin)
}

// ─── Getters ──────────────────────────────────────────────────────────────────
// Used by @kerith/app to read the stores.
// Always returns a copy of the array — never the internal reference.

export function getAliasPlugins(): AliasPlugin[] {
  return [...aliasPlugins]
}

export function getMiddlewarePlugins(): MiddlewarePlugin[] {
  return [...middlewarePlugins]
}

export function getSchedulePlugins(): SchedulePlugin[] {
  return [...schedulePlugins]
}

export function getBindingPlugins(): BindingPlugin[] {
  return [...bindingPlugins]
}

// ─── Reset (tests only) ───────────────────────────────────────────────────────

export function _resetAllChannels(): void {
  aliasPlugins.length = 0
  middlewarePlugins.length = 0
  schedulePlugins.length = 0
  bindingPlugins.length = 0
}
