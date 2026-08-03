import { Worker } from '@kerith/identifiers';

// Registers a worker that processes background jobs.
Worker('process-image', async (job) => {
  console.log('Processing job', job);
}, { concurrency: 5 });
