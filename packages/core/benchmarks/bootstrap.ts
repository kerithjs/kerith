import express from 'express';
import { createApp } from '../src/index.js';

async function bootstrap() {
  const app = express();
  await createApp(app, {
    logger: () => {}
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
