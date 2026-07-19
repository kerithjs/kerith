// src/runtime/stream-executor.ts
// Stream executor — PLACEHOLDER
// Implementation: see corrected package document §8.4
// Reads getBindingPlugins() from @kerith/identifiers, filters by kind === 'stream',
// and registers each as a BindingProvider in @kerith/core/extension via registerBindingProvider().
// NOTE: the actual streaming engine (WebSockets, SSE, Kafka Streams, etc.) is a pending design decision.
