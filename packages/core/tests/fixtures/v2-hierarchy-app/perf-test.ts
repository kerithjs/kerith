import express from 'express';
import { createApp } from '../../../src/index.js';

async function run() {
  const app = express();
  
  console.time('Bootstrap Total');
  const _kerith = await createApp(app, {
    logger: () => {} // Silent
  });
  console.timeEnd('Bootstrap Total');
}

run().catch(console.error);
