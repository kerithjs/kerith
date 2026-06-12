import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createApp } from '../src/index.js';
import { generateFixture } from './generate-fixture.js';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixture');
const RESULTS_FILE = path.join(__dirname, 'results.json');

// Will chdir to FIXTURE_DIR inside run()

function percentile(arr: number[], p: number) {
  if (arr.length === 0) return 0;
  if (typeof p !== 'number') throw new TypeError('p must be a number');
  if (p <= 0) return arr[0];
  if (p >= 100) return arr[arr.length - 1];
  
  const index = (arr.length - 1) * p / 100;
  const lower = Math.floor(index);
  const upper = lower + 1;
  const weight = index % 1;
  
  if (upper >= arr.length) return arr[lower];
  return arr[lower] * (1 - weight) + arr[upper] * weight;
}

function calculateMetrics(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
  };
}

async function measure(name: string, iters: number, setupFn?: () => void) {
  console.log(`\nRunning scenario: ${name}...`);
  const times: number[] = [];

  for (let i = 0; i < iters; i++) {
    if (setupFn) setupFn();

    const start = performance.now();
    const app = express();
    // Use an empty logger to avoid spamming the console
    await createApp(app, {
      logger: () => {}
    });
    const end = performance.now();
    times.push(end - start);
  }

  const metrics = calculateMetrics(times);
  console.log(`Results (${iters} runs): min=${metrics.min}ms, max=${metrics.max}ms, p50=${metrics.p50}ms, p95=${metrics.p95}ms`);
  return metrics;
}

async function run() {
  if (!fs.existsSync(FIXTURE_DIR)) {
    console.log('Generating fixture...');
    generateFixture();
  }
  process.chdir(FIXTURE_DIR);

  // 1. Full bootstrap (cache disabled)
  process.env.KERITH_BOOTSTRAP_CACHE = 'false';
  process.env.NODE_ENV = 'development';
  const noCacheMetrics = await measure('Full Bootstrap (No Cache)', 5);

  // 2. Valid cache (0 rescanned)
  process.env.KERITH_BOOTSTRAP_CACHE = 'true';
  // Prime the cache
  const app = express();
  await createApp(app, { logger: () => {} });
  
  const cacheMetrics = await measure('Valid Cache (0 rescanned)', 5);

  // 3. Partial cache (5 rescanned)
  const partialCacheMetrics = await measure('Partial Cache (5 rescanned)', 5, () => {
    // Touch 5 files to invalidate their cache
    const usersMod = path.join(FIXTURE_DIR, 'src', 'users', 'users.service.ts');
    const authMod = path.join(FIXTURE_DIR, 'src', 'auth', 'auth.service.ts');
    const configMod = path.join(FIXTURE_DIR, 'src', 'config', 'config.service.ts');
    const dbMod = path.join(FIXTURE_DIR, 'src', 'database', 'database.service.ts');
    const loggerMod = path.join(FIXTURE_DIR, 'src', 'logger', 'logger.service.ts');

    const now = new Date();
    [usersMod, authMod, configMod, dbMod, loggerMod].forEach(f => {
      if (fs.existsSync(f)) fs.utimesSync(f, now, now);
    });
  });

  const results = {
    date: new Date().toISOString(),
    scenarios: {
      fullBootstrap: noCacheMetrics,
      validCache: cacheMetrics,
      partialCache: partialCacheMetrics
    }
  };

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${RESULTS_FILE}`);

  // Assert targets
  let failed = false;
  if (noCacheMetrics.p50 > 400) {
    console.error(`❌ Full Bootstrap p50 (${noCacheMetrics.p50}ms) missed target of < 400ms`);
    failed = true;
  } else {
    console.log(`✅ Full Bootstrap p50 (${noCacheMetrics.p50}ms) met target of < 400ms`);
  }

  if (cacheMetrics.p50 > 120) {
    console.error(`❌ Valid Cache p50 (${cacheMetrics.p50}ms) missed target of < 120ms`);
    failed = true;
  } else {
    console.log(`✅ Valid Cache p50 (${cacheMetrics.p50}ms) met target of < 120ms`);
  }

  if (partialCacheMetrics.p50 > 180) {
    console.error(`❌ Partial Cache p50 (${partialCacheMetrics.p50}ms) missed target of < 180ms`);
    failed = true;
  } else {
    console.log(`✅ Partial Cache p50 (${partialCacheMetrics.p50}ms) met target of < 180ms`);
  }

  if (failed && process.env.CI) {
    process.exit(1);
  }
}

run().catch(console.error);
