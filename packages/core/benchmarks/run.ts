import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execSync, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { run, bench, group } from 'mitata';
import { createApp } from '../src/index.js';
import { generateFixture } from './generate-fixture.js';
import express from 'express';

const execFileAsync = promisify(execFile);

// Track all spawned child processes so we can kill them on Ctrl+C.
// On Windows, killing the parent tsx process does NOT kill its children,
// which leaves orphaned node.exe processes locking the fixture directory.
const activeChildren = new Set<ChildProcess>();

function spawnBench(
  execPath: string,
  args: string[],
  options: Parameters<typeof execFile>[2]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(execPath, args, { ...(options ?? {}), encoding: 'utf-8' }, (err, stdout, stderr) => {
      activeChildren.delete(child);
      if (err) reject(err); else resolve({ stdout, stderr });
    });
    activeChildren.add(child);
  });
}

function cleanupChildren() {
  for (const child of activeChildren) {
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }
  activeChildren.clear();
}

process.on('SIGINT', () => { cleanupChildren(); process.exit(130); });
process.on('SIGTERM', () => { cleanupChildren(); process.exit(143); });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixture');
const RESULTS_FILE = path.join(__dirname, 'results.json');
const BOOTSTRAP_SCRIPT = path.join(__dirname, 'bootstrap.ts');
const BOOTSTRAP_NO_EXPRESS_SCRIPT = path.join(__dirname, 'bootstrap-no-express.ts');
const CACHE_FILE = path.join(FIXTURE_DIR, '.kerith', 'bootstrap-cache.json');

// Capture environment metadata
function getGitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getPlatform(): string {
  return `${process.platform}-${process.arch}`;
}

interface BenchmarkResult {
  date: string;
  gitHash: string;
  nodeVersion: string;
  platform: string;
  fixtureSize: string;
  scenarios: Record<string, {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p75: number;
    p99: number;
    scanMs?: number;
    importMs?: number;
    memoryBefore?: number;
    memoryAfter?: number;
    memoryDelta?: number;
  }>;
}

interface HistoricalResults {
  history: BenchmarkResult[];
}

// Custom logger to intercept scan/import times
class BenchmarkLogger {
  private scanMs: number | null = null;
  private importMs: number | null = null;
  private logs: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];

  // LogHandler function signature
  handler = (level: string, message: string, meta?: Record<string, unknown>) => {
    this.logs.push({ level, message, meta });
    // Extract scan/import times from debug logs
    if (message.includes('[perf] scan=')) {
      const match = message.match(/scan=(\d+)ms imports=(\d+)ms/);
      if (match) {
        this.scanMs = parseInt(match[1], 10);
        this.importMs = parseInt(match[2], 10);
      }
    }
  };

  getMetrics() {
    return {
      scanMs: this.scanMs,
      importMs: this.importMs
    };
  }

  clear() {
    this.scanMs = null;
    this.importMs = null;
    this.logs = [];
  }
}

interface BenchmarkOptions {
  fixture: 'small' | 'large';
  scenario: 'cold' | 'cache' | 'partial' | 'all';
  save: boolean;
  compare?: string;
}

function parseArgs(): BenchmarkOptions {
  const args = process.argv.slice(2);
  
  const options: BenchmarkOptions = {
    fixture: 'small',
    scenario: 'all',
    save: true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      console.log(`
Kerith Benchmark Runner

Usage: npm run bench [options]

Options:
  --fixture <small|large>    Fixture size (default: small)
  --scenario <cold|cache|partial|all>  Which scenarios to run (default: all)
  --save                     Save results to history (default: true)
  --no-save                  Don't save results to history
  --compare <baseline>       Compare against historical baseline (date or gitHash)
  --help, -h                 Show this help message

Scenarios:
  cold       Full bootstrap (no cache)
  cache      Valid cache scenarios
  partial    Partial cache scenarios
  all        Run all scenarios (default)

Examples:
  npm run bench                              # Run all scenarios with small fixture
  npm run bench -- --fixture large          # Run all scenarios with large fixture
  npm run bench -- --scenario cold          # Run only cold start scenarios
  npm run bench -- --compare abc1234         # Compare against git hash abc1234
      `);
      process.exit(0);
    }
    
    if (arg === '--fixture=large') {
      options.fixture = 'large';
    } else if (arg === '--fixture=small') {
      options.fixture = 'small';
    } else if (arg.startsWith('--scenario=')) {
      const scenario = arg.split('=')[1];
      if (['cold', 'cache', 'partial', 'all'].includes(scenario)) {
        options.scenario = scenario as any;
      }
    } else if (arg === '--no-save') {
      options.save = false;
    } else if (arg === '--save') {
      options.save = true;
    } else if (arg.startsWith('--compare=')) {
      options.compare = arg.split('=')[1];
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  
  console.log(`Generating ${options.fixture} fixture...`);
  generateFixture(options.fixture);
  process.chdir(FIXTURE_DIR);

  // Clean fixture cache automatically at start
  const cacheDir = path.join(FIXTURE_DIR, '.kerith');
  if (fs.existsSync(cacheDir)) {
    try {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    } catch (err: any) {
      if (process.platform === 'win32' && (err.code === 'EPERM' || err.code === 'EBUSY')) {
        execSync(`rd /s /q "${cacheDir}"`, { stdio: 'ignore' });
      } else {
        throw err;
      }
    }
    console.log('[setup] Cleaned fixture cache');
  }

  const spawnArgs = [...process.execArgv, BOOTSTRAP_SCRIPT];
  const spawnArgsNoExpress = [...process.execArgv, BOOTSTRAP_NO_EXPRESS_SCRIPT];

  // Create benchmark logger for capturing metrics
  const benchmarkLogger = new BenchmarkLogger();

  // Prime the cache before running the benchmarks (only if needed for cache scenarios)
  if (options.scenario === 'cache' || options.scenario === 'partial' || options.scenario === 'all') {
    process.env.KERITH_BOOTSTRAP_CACHE = 'true';
    process.env.NODE_ENV = 'development';
    const primeApp = express();
    await createApp(primeApp, { logger: () => {} });
  }

  // Helper function to get random module files
  function getRandomModuleFiles(count: number): string[] {
    const modulesDir = path.join(FIXTURE_DIR, 'src');
    const allModules = fs.readdirSync(modulesDir).filter(f => 
      fs.statSync(path.join(modulesDir, f)).isDirectory()
    );
    const shuffled = allModules.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count).map(m => path.join(modulesDir, m, `${m}.service.ts`));
  }

  // Helper function to touch files to invalidate cache
  function touchFiles(files: string[]) {
    const stats = files.map(f => {
      if (fs.existsSync(f)) return { f, stat: fs.statSync(f) };
      return null;
    }).filter(Boolean);

    const now = new Date();
    stats.forEach(s => fs.utimesSync(s!.f, now, now));

    return stats;
  }

  // Helper function to restore file timestamps
  function restoreFileTimestamps(stats: Array<{ f: string; stat: fs.Stats } | null>) {
    stats.forEach(s => {
      if (s) fs.utimesSync(s.f, s.stat.atime, s.stat.mtime);
    });
  }

  // Helper function to simulate cache miss (version mismatch)
  function simulateCacheMiss() {
    if (fs.existsSync(CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      cache.version = '0.0.0-invalid'; // Invalid version to trigger cache miss
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    }
  }

  // Helper function to restore cache version
  function restoreCacheVersion(originalVersion: string) {
    if (fs.existsSync(CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      cache.version = originalVersion; // Restore original version
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    }
  }

  // Helper function to disable NITS in config
  function disableNitsInConfig() {
    const configPath = path.join(FIXTURE_DIR, 'kerith.config.ts');
    if (fs.existsSync(configPath)) {
      let content = fs.readFileSync(configPath, 'utf-8');
      // Add nits: { enabled: false } to the config
      if (!content.includes('nits')) {
        content = content.replace('}', ',\n  nits: { enabled: false }\n}');
      } else {
        content = content.replace(/nits:\s*\{[^}]*\}/, 'nits: { enabled: false }');
      }
      fs.writeFileSync(configPath, content, 'utf-8');
    }
  }

  // Helper function to restore NITS in config
  function restoreNitsInConfig() {
    const configPath = path.join(FIXTURE_DIR, 'kerith.config.ts');
    if (fs.existsSync(configPath)) {
      let content = fs.readFileSync(configPath, 'utf-8');
      // Remove nits configuration
      content = content.replace(/,\s*nits:\s*\{\s*enabled:\s*false\s*\}/g, '');
      fs.writeFileSync(configPath, content, 'utf-8');
    }
  }

  group('Kerith Bootstrap Benchmarks', () => {

    // 1. Full bootstrap (Cold start with process isolation)
    if (options.scenario === 'cold' || options.scenario === 'all') {
      bench('Cold Start — Sin cache', async () => {
        await spawnBench(process.execPath, spawnArgs, {
          cwd: FIXTURE_DIR,
          timeout: 60_000,
          env: { ...process.env, KERITH_BOOTSTRAP_CACHE: 'false', NODE_ENV: 'development' }
        });
      });

      // 5. Cold Start without Express (solo registry)
      bench('Cold Start — Sin Express (solo registry)', async () => {
        await spawnBench(process.execPath, spawnArgsNoExpress, {
          cwd: FIXTURE_DIR,
          timeout: 60_000,
          env: { ...process.env, KERITH_BOOTSTRAP_CACHE: 'false', NODE_ENV: 'development' }
        });
      });

      // 9. NITS Off vs NITS On - NITS Disabled
      bench('Cold Start — NITS deshabilitado', async () => {
        disableNitsInConfig();
        await execFileAsync(process.execPath, spawnArgs, {
          cwd: FIXTURE_DIR,
          env: { 
            ...process.env, 
            KERITH_BOOTSTRAP_CACHE: 'false', 
            NODE_ENV: 'development'
          }
        });
        restoreNitsInConfig();
      });
    }

    // 2. Valid cache (0 rescanned)
    if (options.scenario === 'cache' || options.scenario === 'all') {
      bench('Cache Hit — 0 módulos rescaneados', async () => {
        await execFileAsync(process.execPath, spawnArgs, {
          cwd: FIXTURE_DIR,
          env: { ...process.env, KERITH_BOOTSTRAP_CACHE: 'true', NODE_ENV: 'development' }
        });
      });

      // 4. Cache Miss (cache exists but version mismatch)
      bench('Cache Miss — Versión mismatch', async () => {
        const originalVersion = fs.existsSync(CACHE_FILE) 
          ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')).version 
          : 'unknown';
        simulateCacheMiss();
        await execFileAsync(process.execPath, spawnArgs, {
          cwd: FIXTURE_DIR,
          env: { ...process.env, KERITH_BOOTSTRAP_CACHE: 'true', NODE_ENV: 'development' }
        });
        restoreCacheVersion(originalVersion);
      });
    }

    // 3. Partial cache (5 rescanned)
    if (options.scenario === 'partial' || options.scenario === 'all') {
      // Note: Warm process benchmarks intentionally measure the hot path where
      // the Node.js process is already warm and modules are cached in memory.
      // This represents the realistic scenario of a development server restart
      // where the OS and Node.js have already warmed up.
      bench('Cache Parcial — 5 módulos rescaneados', async () => {
        // Touch 5 files to invalidate their cache
        const usersMod = path.join(FIXTURE_DIR, 'src', 'users', 'users.service.ts');
        const authMod = path.join(FIXTURE_DIR, 'src', 'auth', 'auth.service.ts');
        const configMod = path.join(FIXTURE_DIR, 'src', 'config', 'config.service.ts');
        const dbMod = path.join(FIXTURE_DIR, 'src', 'database', 'database.service.ts');
        const loggerMod = path.join(FIXTURE_DIR, 'src', 'logger', 'logger.service.ts');

        const stats = [usersMod, authMod, configMod, dbMod, loggerMod].map(f => {
          if (fs.existsSync(f)) return { f, stat: fs.statSync(f) };
          return null;
        }).filter(Boolean);

        const now = new Date();
        stats.forEach(s => fs.utimesSync(s!.f, now, now));

        benchmarkLogger.clear();
        const memoryBefore = process.memoryUsage().heapUsed;
        const testApp = express();
        await createApp(testApp, { logger: benchmarkLogger.handler });
        const memoryAfter = process.memoryUsage().heapUsed;
        const metrics = benchmarkLogger.getMetrics();

        stats.forEach(s => fs.utimesSync(s!.f, s!.stat.atime, s!.stat.mtime));
      });

      // 6. Partial Cache with variable N - 1 module
      bench('Cache Parcial — 1 módulo rescanado', async () => {
        const files = getRandomModuleFiles(1);
        const stats = touchFiles(files);

        benchmarkLogger.clear();
        const memoryBefore = process.memoryUsage().heapUsed;
        const testApp = express();
        await createApp(testApp, { logger: benchmarkLogger.handler });
        const memoryAfter = process.memoryUsage().heapUsed;

        restoreFileTimestamps(stats);
      });

      // 7. Partial Cache with variable N - 10 modules
      bench('Cache Parcial — 10 módulos rescanados', async () => {
        const files = getRandomModuleFiles(10);
        const stats = touchFiles(files);

        benchmarkLogger.clear();
        const memoryBefore = process.memoryUsage().heapUsed;
        const testApp = express();
        await createApp(testApp, { logger: benchmarkLogger.handler });
        const memoryAfter = process.memoryUsage().heapUsed;

        restoreFileTimestamps(stats);
      });

      // 8. Partial Cache with variable N - 25 modules
      bench('Cache Parcial — 25 módulos rescanados', async () => {
        const files = getRandomModuleFiles(25);
        const stats = touchFiles(files);

        benchmarkLogger.clear();
        const memoryBefore = process.memoryUsage().heapUsed;
        const testApp = express();
        await createApp(testApp, { logger: benchmarkLogger.handler });
        const memoryAfter = process.memoryUsage().heapUsed;

        restoreFileTimestamps(stats);
      });
    }
  });

  // Capture mitata output using JSON format for reliable parsing
  const jsonResultsFile = path.join(__dirname, 'results-temp.json');
  let jsonOutput = '';
  const results = await run({
    colors: false,
    format: 'json',
    print: (data: string) => {
      jsonOutput += data;
    }
  });
  
  // Write the complete accumulated output
  fs.writeFileSync(jsonResultsFile, jsonOutput, 'utf-8');

  // Parse JSON results
  let parsedResults: any;
  try {
    parsedResults = JSON.parse(fs.readFileSync(jsonResultsFile, 'utf-8'));
  } catch (e) {
    console.error('[results] Failed to parse mitata JSON output:', e);
    parsedResults = { benchmarks: [] };
  }

  // Clean up temp file
  if (fs.existsSync(jsonResultsFile)) {
    fs.unlinkSync(jsonResultsFile);
  }

  // Parse mitata console output to extract benchmark results
  const benchmarkResult: BenchmarkResult = {
    date: new Date().toISOString(),
    gitHash: getGitHash(),
    nodeVersion: process.version,
    platform: getPlatform(),
    fixtureSize: options.fixture,
    scenarios: {}
  };

  // Extract results from parsed JSON
  if (parsedResults && parsedResults.benchmarks) {
    for (const bench of parsedResults.benchmarks) {
      // Mitata nests stats in runs[0].stats
      const stats = bench.runs?.[0]?.stats;
      if (!stats) continue;

      // Mitata uses nanoseconds, convert to milliseconds
      const nsToMs = (ns: number) => ns / 1_000_000;

      benchmarkResult.scenarios[bench.alias || bench.name || bench.id || 'unknown'] = {
        avg: nsToMs(stats.avg || 0),
        min: nsToMs(stats.min || 0),
        max: nsToMs(stats.max || 0),
        p50: nsToMs(stats.p50 || 0),
        p75: nsToMs(stats.p75 || 0),
        p99: nsToMs(stats.p99 || 0)
      };
    }
  }

  console.log(`[debug] Captured ${Object.keys(benchmarkResult.scenarios).length} scenarios from mitata JSON`);

  // Handle --save flag
  if (options.save) {
    // Load existing history or create new
    let historicalResults: HistoricalResults;
    if (fs.existsSync(RESULTS_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
        // Ensure the data has the correct structure
        historicalResults = data && Array.isArray(data.history) ? data : { history: [] };
      } catch {
        historicalResults = { history: [] };
      }
    } else {
      historicalResults = { history: [] };
    }

    // Ensure history is an array
    if (!Array.isArray(historicalResults.history)) {
      historicalResults.history = [];
    }

    // Append new result to history
    historicalResults.history.push(benchmarkResult);

    // Keep only last 50 results to prevent file from growing too large
    if (historicalResults.history.length > 50) {
      historicalResults.history = historicalResults.history.slice(-50);
    }

    // Save updated history
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(historicalResults, null, 2), 'utf-8');
    console.log(`\n[results] Saved to ${RESULTS_FILE}`);
    console.log(`[results] Total historical entries: ${historicalResults.history.length}`);
  }

  // Handle --compare flag
  if (options.compare) {
    let historicalResults: HistoricalResults;
    if (fs.existsSync(RESULTS_FILE)) {
      try {
        historicalResults = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
      } catch {
        console.error('[compare] Failed to load historical results');
        return;
      }
    } else {
      console.error('[compare] No historical results found');
      return;
    }

    // Find baseline by gitHash or date
    const baseline = historicalResults.history.find(entry => 
      entry.gitHash === options.compare || (options.compare && entry.date.startsWith(options.compare))
    );

    if (!baseline) {
      console.error(`[compare] Baseline '${options.compare}' not found in history`);
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('COMPARISON AGAINST BASELINE');
    console.log('='.repeat(60));
    console.log(`Baseline: ${baseline.gitHash} (${baseline.date})`);
    console.log(`Current:  ${benchmarkResult.gitHash} (${benchmarkResult.date})`);
    console.log('-'.repeat(60));

    for (const [scenarioName, currentMetrics] of Object.entries(benchmarkResult.scenarios)) {
      const baselineMetrics = baseline.scenarios[scenarioName];
      if (!baselineMetrics) continue;

      const avgDelta = ((currentMetrics.avg - baselineMetrics.avg) / baselineMetrics.avg) * 100;
      const p75Delta = ((currentMetrics.p75 - baselineMetrics.p75) / baselineMetrics.p75) * 100;
      
      const avgSign = avgDelta >= 0 ? '+' : '';
      const p75Sign = p75Delta >= 0 ? '+' : '';
      const avgColor = avgDelta > 10 ? '🔴' : avgDelta < -10 ? '🟢' : '⚪';
      const p75Color = p75Delta > 10 ? '🔴' : p75Delta < -10 ? '🟢' : '⚪';

      console.log(`\n${scenarioName}:`);
      console.log(`  Avg: ${currentMetrics.avg.toFixed(2)}ms vs ${baselineMetrics.avg.toFixed(2)}ms (${avgColor} ${avgSign}${avgDelta.toFixed(1)}%)`);
      console.log(`  P75: ${currentMetrics.p75.toFixed(2)}ms vs ${baselineMetrics.p75.toFixed(2)}ms (${p75Color} ${p75Sign}${p75Delta.toFixed(1)}%)`);
    }

    console.log('\n' + '='.repeat(60));
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('BENCHMARK SUMMARY');
  console.log('='.repeat(60));
  console.log(`Fixture: ${options.fixture} (${Object.keys(benchmarkResult.scenarios).length} scenarios)`);
  console.log(`Git: ${benchmarkResult.gitHash}`);
  console.log(`Node: ${benchmarkResult.nodeVersion}`);
  console.log(`Platform: ${benchmarkResult.platform}`);
  console.log('-'.repeat(60));

  // Group scenarios by type
  const coldScenarios = Object.entries(benchmarkResult.scenarios).filter(([name]) => 
    name.includes('Cold Start') || name.includes('No Cache')
  );
  const cacheScenarios = Object.entries(benchmarkResult.scenarios).filter(([name]) => 
    name.includes('Cache') && !name.includes('Partial')
  );
  const partialScenarios = Object.entries(benchmarkResult.scenarios).filter(([name]) => 
    name.includes('Partial')
  );

  if (coldScenarios.length > 0) {
    console.log('\nCold Start Scenarios:');
    for (const [name, metrics] of coldScenarios) {
      console.log(`  ${name}:`);
      console.log(`    Avg: ${metrics.avg.toFixed(2)}ms (p50: ${metrics.p50.toFixed(2)}ms, p75: ${metrics.p75.toFixed(2)}ms, p99: ${metrics.p99.toFixed(2)}ms)`);
    }
  }

  if (cacheScenarios.length > 0) {
    console.log('\nCache Scenarios:');
    for (const [name, metrics] of cacheScenarios) {
      console.log(`  ${name}:`);
      console.log(`    Avg: ${metrics.avg.toFixed(2)}ms (p50: ${metrics.p50.toFixed(2)}ms, p75: ${metrics.p75.toFixed(2)}ms, p99: ${metrics.p99.toFixed(2)}ms)`);
    }
  }

  if (partialScenarios.length > 0) {
    console.log('\nPartial Cache Scenarios:');
    for (const [name, metrics] of partialScenarios) {
      console.log(`  ${name}:`);
      console.log(`    Avg: ${metrics.avg.toFixed(2)}ms (p50: ${metrics.p50.toFixed(2)}ms, p75: ${metrics.p75.toFixed(2)}ms, p99: ${metrics.p99.toFixed(2)}ms)`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
