import { Command } from 'commander';
import { createModuleCommand } from './create-module.js';
import { createDomainCommand } from './create-domain.js';
import { createSubModuleCommand } from './create-submodule.js';
import { createSharedCommand } from './create-shared.js';

// ─── Command ──────────────────────────────────────────────────────────────
//
// `kerith generate <schematic> <name>` (alias: `kerith g <schematic> <name>`)
//
// Nest/Angular style entry point for scaffolding. It reuses exactly the
// same logic as the standalone `create-module` / `create-domain`
// / `create-submodule` / `create-shared` commands — each factory returns a
// new `Command` instance, so we just rename it and add short
// aliases before nesting it here. Nothing is duplicated.
//
// The standalone `create-*` commands remain registered at the
// root level as well (compatibility with existing scripts/habits) — `generate`
// is an additional, more discoverable entry point, not a replacement.

export function generateCommand(): Command {
  const generate = new Command('generate');

  generate
    .alias('g')
    .description('Generate a Kerith architectural artifact (module, domain, submodule, shared)');

  generate.addCommand(createModuleCommand().name('module').aliases(['mo']));
  generate.addCommand(createDomainCommand().name('domain').aliases(['d']));
  generate.addCommand(createSubModuleCommand().name('submodule').aliases(['sm']));
  generate.addCommand(createSharedCommand().name('shared').aliases(['sh']));

  return generate;
}
