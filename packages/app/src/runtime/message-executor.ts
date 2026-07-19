// src/runtime/message-executor.ts
// Message executor — PLACEHOLDER
// Implementation: see corrected package document §8.4
// Reads getBindingPlugins() from @kerith/identifiers, filters by kind === 'message',
// and registers each as a BindingProvider in @kerith/core/extension via registerBindingProvider().
// NOTE: the actual transport mechanism (Kafka, RabbitMQ, etc.) is a pending design decision.
