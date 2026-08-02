import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCoreTemplate } from '../src/generators/core-template.js';
import { buildAppTemplate } from '../src/generators/app-template.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../tests/fixtures');

function sanitize(files: Record<string, string>) {
  for (const [filePath, content] of Object.entries(files)) {
    if (filePath.endsWith('.kerith')) {
      const parsed = JSON.parse(content);
      parsed.id = 'MOCKED-UUID';
      parsed.createdAt = 'MOCKED-DATE';
      files[filePath] = JSON.stringify(parsed, null, 2);
    }
  }
}

function writeFixture(name: string, files: Record<string, string>) {
  const dir = path.join(FIXTURES_DIR, name);
  fs.rmSync(dir, { recursive: true, force: true });
  
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
  console.log(`Generated fixture: ${name}`);
}

async function main() {
  const coreFiles = buildCoreTemplate({
    outDir: '/fake/dir',
    projectName: 'my-test-project',
    language: 'ts',
    port: 3000,
    routePrefix: '',
    yes: true,
  });
  sanitize(coreFiles);
  writeFixture('core-project', coreFiles);

  const appFiles = buildAppTemplate(coreFiles, {
    projectName: 'my-test-project',
    language: 'ts',
    channels: ['alias', 'middleware', 'cron', 'worker', 'gateway'],
    redis: true,
    socketio: true,
  });
  sanitize(appFiles);
  writeFixture('app-project', appFiles);
}

main().catch(console.error);
