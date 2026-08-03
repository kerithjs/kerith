import { Cron } from '@kerith/identifiers';

// Registers a scheduled job using a cron expression.
// Note: Uses three positional arguments.
Cron('daily-cleanup', '0 2 * * *', async () => {
  console.log('Running daily cleanup...');
});
