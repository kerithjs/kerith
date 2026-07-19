// src/runtime/worker-executor.ts
// Worker executor — PLACEHOLDER
// Implementation: see corrected package document §8.4
// Reads getBindingPlugins() from @kerith/identifiers, filters by kind === 'worker',
// and registers each as a BindingProvider in @kerith/core/extension via registerBindingProvider().
// The opaque bind.handler is passed to BullMQ via the loadBullMQ() adapter.
