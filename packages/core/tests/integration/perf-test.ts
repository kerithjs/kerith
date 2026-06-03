import { createApp } from '../../src/bootstrap/createApp.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.resolve(__dirname, '../fixtures/v2-hierarchy-app');

async function run() {
  process.chdir(fixturePath);
  
  console.time('createApp Total');
  await createApp(express(), { logger: () => {} });
  console.timeEnd('createApp Total');
}

run().catch(console.error);
