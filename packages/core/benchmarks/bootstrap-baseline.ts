import express from 'express';

async function bootstrap() {
  const app = express(); // sin listen, sin createApp — solo costo de requerir/instanciar Express
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
