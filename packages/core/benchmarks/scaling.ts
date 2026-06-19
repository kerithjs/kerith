import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execSync, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { generateFixture } from './generate-fixture.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixture');
const RESULTS_FILE = path.join(__dirname, 'scaling-results.json');

// Script mappings
const scriptFor = {
  baseline: path.join(__dirname, 'bootstrap-baseline.ts'),
  registry: path.join(__dirname, 'bootstrap-no-express.ts'),
  full: path.join(__dirname, 'bootstrap.ts')
} as const;

// Child process management
const activeChildren = new Set<ChildProcess>();

function cleanupChildren() {
  for (const child of activeChildren) {
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }
  activeChildren.clear();
}

process.on('SIGINT', () => { cleanupChildren(); process.exit(130); });
process.on('SIGTERM', () => { cleanupChildren(); process.exit(143); });

// ------------------------------------------------------------------ //
// Types
// ------------------------------------------------------------------ //

interface Step8Timing {
  discover: number;
  mount: number;
  log: number;
  total: number; // mount + log (does not include discover)
}

interface ScenarioStats extends ReturnType<typeof computeStats> {
  step8?: {
    discover: ReturnType<typeof computeStats>;
    mount: ReturnType<typeof computeStats>;
    log: ReturnType<typeof computeStats>;
  };
}

// ------------------------------------------------------------------ //
// runOnce — returns Step8Timing when the perf line is present in stderr
// ------------------------------------------------------------------ //

async function runOnce(scenario: keyof typeof scriptFor): Promise<Step8Timing | null> {
  const execPath = process.execPath;
  const args = [...process.execArgv, scriptFor[scenario]];
  const options = {
    cwd: FIXTURE_DIR,
    env: {
      ...process.env,
      KERITH_BOOTSTRAP_CACHE: 'false',
      NODE_ENV: 'development',
      KERITH_PROFILE: 'true',  // enables direct stderr write of step8 perf line
    }
  };

  return new Promise((resolve, reject) => {
    const child = execFile(execPath, args, options, (err, _stdout, stderr) => {
      activeChildren.delete(child);
      if (err) {
        reject(err);
        return;
      }
      // The perf line is emitted to stderr via process.stderr.write when KERITH_PROFILE=true,
      // bypassing the logger's logLevel gate so it is always capturable here.
      const match = stderr.match(
        /\[perf\] step8_discover=([\d.]+)ms step8_mount=([\d.]+)ms step8_log=([\d.]+)ms step8_total=([\d.]+)ms/
      );
      resolve(
        match
          ? {
              discover: parseFloat(match[1]),
              mount: parseFloat(match[2]),
              log: parseFloat(match[3]),
              total: parseFloat(match[4]),
            }
          : null // baseline/registry never emit this line — expected, not an error
      );
    });
    activeChildren.add(child);
  });
}

function cleanCacheDir() {
  const cacheDir = path.join(FIXTURE_DIR, '.kerith'); // wipe bootstrap cache between sizes
  if (fs.existsSync(cacheDir)) {
    try {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    } catch (err: any) {
      if (process.platform === 'win32' && (err.code === 'EPERM' || err.code === 'EBUSY')) {
        execSync(`rd /s /q "${cacheDir}"`, { stdio: 'ignore' });
      }
    }
  }
}

function computeStats(timings: number[]) {
  if (timings.length === 0) return { avg: 0, min: 0, max: 0, p50: 0, p75: 0, p99: 0 };
  const sorted = [...timings].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  
  const getP = (p: number) => {
    const index = Math.floor(sorted.length * p);
    return sorted[Math.min(index, sorted.length - 1)];
  };

  return {
    avg,
    min,
    max,
    p50: getP(0.50),
    p75: getP(0.75),
    p99: getP(0.99)
  };
}

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

async function main() {
  // Parse CLI args
  const args = process.argv.slice(2);
  let SIZES = [5, 10, 20, 30, 40];
  let SAMPLES = 15;
  let SCENARIOS: Array<keyof typeof scriptFor> = ['baseline', 'registry', 'full'];

  for (const arg of args) {
    if (arg.startsWith('--sizes=')) {
      SIZES = arg.split('=')[1].split(',').map(Number).filter(n => !isNaN(n) && n > 0);
    } else if (arg.startsWith('--samples=')) {
      const s = parseInt(arg.split('=')[1], 10);
      if (!isNaN(s) && s > 0) SAMPLES = s;
    } else if (arg.startsWith('--scenarios=')) {
      const s = arg.split('=')[1].split(',');
      SCENARIOS = s.filter((v): v is keyof typeof scriptFor => v in scriptFor);
    }
  }

  const resultsData: Record<number, Record<string, ScenarioStats>> = {};

  console.log(`Starting scaling benchmark...`);
  console.log(`Sizes: ${SIZES.join(', ')}`);
  console.log(`Samples per scenario: ${SAMPLES}`);
  console.log(`Scenarios: ${SCENARIOS.join(', ')}\n`);

  for (const size of SIZES) {
    console.log(`\n=== Size: ${size} modules ===`);
    
    // IMPORTANT: Switch CWD away before recreating the fixture directory.
    // If we are inside FIXTURE_DIR, Windows will refuse to delete it.
    process.chdir(__dirname);
    
    generateFixture(size);
    process.chdir(FIXTURE_DIR);
    
    cleanCacheDir(); // wipe cache before each size
    
    resultsData[size] = {};

    for (const scenario of SCENARIOS) {
      console.log(`  Scenario: ${scenario}`);

      // Warmup
      process.stdout.write(`    Warmup... `);
      await runOnce(scenario);
      process.stdout.write(`Done.\n`);

      const timings: number[] = [];
      const step8Discover: number[] = [];
      const step8Mount: number[] = [];
      const step8Log: number[] = [];

      process.stdout.write(`    Measuring (${SAMPLES} samples)... `);
      for (let i = 0; i < SAMPLES; i++) {
        const t0 = performance.now();
        const step8Result = await runOnce(scenario);
        timings.push(performance.now() - t0);

        if (step8Result) {
          step8Discover.push(step8Result.discover);
          step8Mount.push(step8Result.mount);
          step8Log.push(step8Result.log);
        }
      }
      process.stdout.write(`Done.\n`);

      const stats = computeStats(timings);
      const scenarioStats: ScenarioStats = { ...stats };

      if (step8Discover.length > 0) {
        scenarioStats.step8 = {
          discover: computeStats(step8Discover),
          mount: computeStats(step8Mount),
          log: computeStats(step8Log),
        };
      }

      resultsData[size][scenario] = scenarioStats;
      console.log(`    Result: avg=${stats.avg.toFixed(2)}ms (min=${stats.min.toFixed(2)}ms, max=${stats.max.toFixed(2)}ms)`);

      if (scenarioStats.step8) {
        const s8 = scenarioStats.step8;
        console.log(`      -> Discover: ${s8.discover.avg.toFixed(2)}ms | Mount: ${s8.mount.avg.toFixed(2)}ms | Log: ${s8.log.avg.toFixed(2)}ms`);
      }
    }
  }

function printInterpretation(resultsData: Record<number, Record<string, any>>, SIZES: number[], SCENARIOS: string[]) {
  console.log('\n' + '='.repeat(60));
  console.log('INTERPRETATION & ANALYSIS');
  console.log('='.repeat(60) + '\n');

  // 1. Summary table
  const sizeHeaders = SIZES.map(s => String(s).padStart(6, ' ')).join(' |');
  console.log(`Scenario   |${sizeHeaders}`);
  console.log('-'.repeat(12 + SIZES.length * 9));

  for (const scenario of SCENARIOS) {
    const row = SIZES.map(size => {
      const avg = resultsData[size]?.[scenario]?.avg;
      return avg !== undefined ? avg.toFixed(0).padStart(6, ' ') : '   N/A';
    }).join(' |');
    console.log(`${scenario.padEnd(10, ' ')} |${row}`);
  }

  // 2. Marginal cost per module
  console.log('\n--- Marginal Cost per Module (ms/module) ---');
  for (const scenario of ['registry', 'full']) {
    if (!SCENARIOS.includes(scenario as any)) continue;
    console.log(`${scenario}:`);
    for (let i = 1; i < SIZES.length; i++) {
      const n1 = SIZES[i-1];
      const n2 = SIZES[i];
      const t1 = resultsData[n1]?.[scenario]?.avg;
      const t2 = resultsData[n2]?.[scenario]?.avg;
      if (t1 !== undefined && t2 !== undefined) {
        const marginal = (t2 - t1) / (n2 - n1);
        console.log(`  ${n1} -> ${n2} modules: ${marginal.toFixed(2)} ms/module`);
      }
    }
  }

  // 3. Express overhead (full - registry)
  // If constant, Express has a fixed cost. If it grows, the route-binding loop is O(n).
  if (SCENARIOS.includes('full') && SCENARIOS.includes('registry')) {
    console.log('\n--- Express Overhead (full - registry) ---');
    console.log('  Constant = fixed Express cost. Growing = O(n) route-binding bottleneck.');
    for (const size of SIZES) {
      const full = resultsData[size]?.['full']?.avg;
      const reg = resultsData[size]?.['registry']?.avg;
      if (full !== undefined && reg !== undefined) {
        console.log(`  ${String(size).padStart(3, ' ')} modules: ${(full - reg).toFixed(2)} ms`);
      }
    }
  }

  // 4. Pure Kerith cost (registry - baseline)
  // Linear growth = genuine work (scan/NITS). Flat = fixed startup overhead.
  if (SCENARIOS.includes('registry') && SCENARIOS.includes('baseline')) {
    console.log('\n--- Pure Kerith Cost (registry - baseline) ---');
    console.log('  Linear growth = genuine work (scan/NITS). Flat = fixed startup overhead.');
    for (const size of SIZES) {
      const reg = resultsData[size]?.['registry']?.avg;
      const base = resultsData[size]?.['baseline']?.avg;
      if (reg !== undefined && base !== undefined) {
        console.log(`  ${String(size).padStart(3, ' ')} modules: ${(reg - base).toFixed(2)} ms`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

  printInterpretation(resultsData, SIZES, SCENARIOS);

  const output = {
    date: new Date().toISOString(),
    gitHash: getGitHash(),
    platform: getPlatform(),
    results: resultsData
  };

  // Restore CWD to __dirname to save results relative to script
  process.chdir(__dirname);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nSaved results to ${RESULTS_FILE}`);
}

main().catch(err => {
  cleanupChildren();
  console.error(err);
  process.exit(1);
});
