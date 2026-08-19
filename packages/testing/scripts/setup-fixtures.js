import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures');

function findFixtures(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      const fullPath = path.join(dir, entry.name);
      if (fs.existsSync(path.join(fullPath, 'package.json'))) {
        results.push(fullPath);
      }
      results = results.concat(findFixtures(fullPath));
    }
  }
  return results;
}

const fixtures = findFixtures(fixturesDir);

console.log(`Found ${fixtures.length} fixtures. Running setup...`);

for (const fixture of fixtures) {
  const pkgName = path.basename(fixture);
  console.log(`Setting up ${pkgName}...`);
  try {
    const pkgJsonPath = path.join(fixture, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const kerithBin = path.resolve(__dirname, '../../core/dist/cli/index.js');
      execSync(`node ${kerithBin} sync-preload`, { cwd: fixture, stdio: 'inherit' });
      
      if (fs.existsSync(path.join(fixture, 'tsconfig.json'))) {
        execSync(`node ${kerithBin} sync-tsconfig`, { cwd: fixture, stdio: 'inherit' });
      }
    }
  } catch (err) {
    console.warn(`[WARNING] Failed to setup ${pkgName} (it might be an error-path fixture)`);
  }
}

console.log('All fixtures setup successfully.');
