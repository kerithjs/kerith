import { createApp } from '../src/index.js';

async function bootstrap() {
  // Cold start without Express - only registry scan + NITS + alias registration
  await createApp(undefined, {
    logger: () => {}
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
