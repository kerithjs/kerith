import { Middleware } from '@kerith/identifiers';

// Registers a named middleware.
// Only applies to controllers declaring it in metadata.middlewareNames
Middleware('logger', (req, res, next) => {
  console.log('Request received');
  (next as Function)();
});
