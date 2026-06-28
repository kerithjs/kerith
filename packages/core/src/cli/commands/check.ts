import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import pc from 'picocolors';
import { loadConfig } from '../../core/config.js';
import { buildModuleGraph } from '../lib/graph-builder.js';
import { detectViolations, ViolationType, detectCouplingWarnings, isHardViolation } from '../lib/violations.js';
import { printCheckReport, AYU, type CheckReportData } from '../lib/check-reporter.js';
import { loadNitsRegistry, saveNitsRegistry, initNitsRegistry, inferProjectName, scanShadowFiles } from '../../nits/nits-store.js';
import { createLogger, defaultLogHandler } from '../../core/logger.js';
import { reconcile, buildUpdatedNitsRegistry, buildNitsIdMap } from '../../nits/nits-reconciler.js';
import { computeModuleHash } from '../../nits/nits-hash.js';
import type { DiscoveredModule, NitsModuleRecord } from '../../types/nits.js';
import { checkSharedAccess } from '../lib/shared-checker.js';
import { createRegistry, registryContext } from '../../core/registry.js';
import { registerEntitiesFromScan } from '../../bootstrap/register-from-scan.js';
import { scanFromConfig } from '../../bootstrap/scanner.js';

function resolveCorePkgVersion(): string | null {
  const depths = [
    '../../package.json',      // dist/cli/ → packages/core/ (dev/local link)
    '../../../package.json',   // dist/cli/ → node_modules/@vlynk-studios/Kerith-core/ (prod)
    '../../../../package.json',
  ];
  for (const depth of depths) {
    try {
      const url = new URL(depth, import.meta.url);
      if (fs.existsSync(url)) {
        const pkg = JSON.parse(fs.readFileSync(url, 'utf8'));
        if (pkg.name?.includes('kerith')) return pkg.version;
      }
    } catch {
      // Ignore error and try the next depth
    }
  }
  return null;
}

export function checkCommand(): Command {
  const check = new Command('check');

  check
    .description('Analyzes the project structural integrity to detect architectural violations')
    .option('--strict', 'Exit with code 1 if any violation is found', false)
    .option('--module <moduleName>', 'Filter analysis by a specific module')
    .option('--level <level>', 'Filter output section: domain | module | submodule | flat')
    .option('--format <format>', 'Output format: text or json', 'text')
    .option('--no-circular', 'Skip circular dependency detection')
    .option('--verbose', 'Show verbose output including internal NITS IDs')
    .action(async (options) => {
        const cwd = process.cwd();
        const config = await loadConfig();

        const logger = createLogger(defaultLogHandler, 'info', 'check');

        // Pre-loader verification
        const preloadPath = path.join(cwd, '.kerith', 'preload.js');
        if (!fs.existsSync(preloadPath)) {
            console.log(`\n  ${AYU.orange}⚠  Pre-loader not detected. Run "npx kerith sync-preload" to optimize alias resolution.\x1b[0m\n`);
        } else {
            try {
                const content = fs.readFileSync(preloadPath, 'utf8');
                const versionMatch = content.match(/_version:\s*'([^']+)'/);
                if (versionMatch) {
                    const preloadVersion = versionMatch[1];
                    const currentVersion = resolveCorePkgVersion();
                    
                    if (currentVersion && preloadVersion !== currentVersion) {
                        console.log(`\n  ${AYU.orange}⚠  Pre-loader version mismatch (found v${preloadVersion}, core is v${currentVersion}). Run "npx kerith sync-preload" to update.\x1b[0m\n`);
                    }
                }
            } catch (err: any) {
                console.log(`\n  ${AYU.orange}⚠  Failed to read pre-loader: ${err.message}\x1b[0m\n`);
            }
        }
        
        const graph = await buildModuleGraph(config, cwd);
        let nitsResult: any = null;

        // NITS Reconciliation (Identity Tracking)
        if (config.nits.enabled) {
          try {
            // Read-only shadow file scan — same migration-safe approach as createApp.
            const shadowFileMap = scanShadowFiles(graph.modules.map(n => ({ name: n.name, dirPath: n.dirPath })));

            const discovered: DiscoveredModule[] = [];
            for (const node of graph.modules) {
              const { hash, identifiers } = await computeModuleHash(node.dirPath);
              discovered.push({
                name: node.name,
                dirPath: node.dirPath,
                domain: node.domain,
                identifiers,
                hash,
                shadowFile: shadowFileMap.get(node.dirPath),
              });
            }

            const oldRegistry = await loadNitsRegistry(cwd) || initNitsRegistry(inferProjectName(cwd));

            let modulesRoots: string[] = [];
            if (config.origin) {
              modulesRoots = [path.resolve(cwd, config.origin).replace(/\\/g, '/')];
            } else if (config.modules) {
              const rawGlobs = Array.isArray(config.modules) ? config.modules : 
                (typeof config.modules === 'string' && config.modules.startsWith('{') && config.modules.endsWith('}')) 
                  ? config.modules.slice(1, -1).split(',') 
                  : [config.modules];
                  
              modulesRoots = rawGlobs.map(g => path.resolve(cwd, g.split('*')[0]).replace(/\\/g, '/'));
            }
            
            for (const [id, mod] of Object.entries(oldRegistry.modules)) {
              const absPath = path.resolve(cwd, mod.path).replace(/\\/g, '/');
              const isWithinRoots = modulesRoots.some(root => absPath.startsWith(root));
              if (!isWithinRoots) {
                logger.warn(`[NITS] Purging artifact from registry: ${mod.path}`);
                delete oldRegistry.modules[id];
              }
            }

            const result = reconcile(discovered, oldRegistry, cwd, {
              similarityThreshold: config.nits.similarityThreshold
            });
            nitsResult = result;
            const updatedRegistry = buildUpdatedNitsRegistry(result, oldRegistry.project);
            
            await saveNitsRegistry(updatedRegistry, cwd);
            
            const idMap = buildNitsIdMap(result, cwd);

            // Build a lookup from dirPath -> full reconciliation record
            // to populate resolvedBy on the graph nodes.
            const allRecords: NitsModuleRecord[] = [
              ...result.confirmed,
              ...result.moved.map(m => m.record),
              ...result.candidates.map(m => m.record),
              ...result.newModules,
            ];
            const recordByAbsPath = new Map<string, NitsModuleRecord>();
            for (const rec of allRecords) {
              const absPath = path.isAbsolute(rec.path)
                ? rec.path
                : path.resolve(cwd, rec.path);
              recordByAbsPath.set(absPath, rec);
            }

            // Map IDs and resolvedBy back to the graph nodes for reporting
            for (const node of graph.modules) {
              const absPath = path.resolve(node.dirPath);
              node.id = idMap.get(absPath);
              node.resolvedBy = recordByAbsPath.get(absPath)?.resolvedBy;
            }


          } catch (err: any) {
            logger.warn(`NITS reconciliation failed: ${err.message}. Analysis will continue...`);
          }
        }

        let nodes = graph.modules;

        if (options.module) {
          graph.modules = graph.modules.filter(n => n.name === options.module);
          nodes = graph.modules;
          if (nodes.length === 0) {
            throw new Error(pc.red(`✗ Error: Module "${options.module}" does not exist.`));
          }
        }

        // Build registry for shared checking
        const registry = createRegistry();
        const scanResult = await scanFromConfig(config, cwd);
        registryContext.run(registry, () => {
          registerEntitiesFromScan(registry, scanResult);
        });

        let violations = detectViolations(graph, cwd);
        
        // Add shared access violations
        const sharedViolations = await checkSharedAccess(graph, registry, cwd);
        violations.push(...sharedViolations);

        // Add coupling warnings
        const { warnings: couplingWarnings, fanInMap, fanOutMap } = detectCouplingWarnings(graph, config);
        let allViolations = [...violations, ...couplingWarnings];

        // Build sharedInfo: alias → module names that declare it in shared[]
        const sharedInfo: Record<string, string[]> = {};
        for (const entry of registry.getAllShared()) {
          sharedInfo[entry.alias] = [];
        }
        for (const mod of graph.modules) {
          const rawMod = registry.getRawModule(mod.name, mod.domain);
          for (const sharedAlias of rawMod?.shared ?? []) {
            if (sharedInfo[sharedAlias] !== undefined) {
              sharedInfo[sharedAlias].push(mod.name);
            }
          }
        }

        if (options.circular === false) { 
          allViolations = allViolations.filter(v => v.type !== ViolationType.CIRCULAR_DEPENDENCY);
        }

        // In normal mode: only hard errors (severity: 'error') block.
        // In --strict mode: hard errors + warnings block.
        const hasBlockingViolations = options.strict
          ? allViolations.some(v => v.severity === 'error' || v.severity === 'warn')
          : allViolations.some(v => isHardViolation(v));

        if (options.format === 'json') {
          const couplingJson: Record<string, { fanOut: number; fanIn: number }> = {};
          for (const node of graph.modules) {
            couplingJson[node.name] = {
              fanOut: fanOutMap.get(node.name) ?? 0,
              fanIn:  (fanInMap.get(node.name) ?? []).length,
            };
          }
          console.log(JSON.stringify({ 
            domains: graph.domains, 
            modules: nodes, 
            violations: allViolations,
            coupling: couplingJson
          }, null, 2));
          if (hasBlockingViolations) {
            throw new Error('Structural integrity violations found (JSON format)');
          }
          return;
        }

        const reportData: CheckReportData = {
          version:     resolveCorePkgVersion() ?? 'unknown',
          projectName: inferProjectName(cwd),
          domains:     graph.domains,
          modules:     nodes,
          submodules:  graph.submodules || [],
          violations:  allViolations,
          nitsResult,
          sharedInfo,
          coupling: { fanInMap, fanOutMap },
          options: {
            verbose:      options.verbose ?? false,
            strict:       options.strict  ?? false,
            moduleFilter: options.module,
            levelFilter:  options.level,
          },
        };

        printCheckReport(reportData);

        if (nitsResult) {
          const staleCount = nitsResult.stale?.length || 0;
          const deletedCount = nitsResult.deleted?.length || 0;
          if (staleCount > 0 || deletedCount > 0) {
            process.exitCode = 1;
          }
        }

        if (hasBlockingViolations) {
          throw new Error('Structural integrity violations found.');
        }
    });

  return check;
}
