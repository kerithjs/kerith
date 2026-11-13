// src/events/structural.ts

import { createStructuralIdentifier } from '../structural/index.js';
import type { BaseStructuralOptions } from '../structural/types.js';

export interface EventOptions extends BaseStructuralOptions {
  version?: string;
  schema?: string;
}

export interface HandlerOptions extends BaseStructuralOptions {
  event?: string;
  priority?: number;
}

export interface ProjectionOptions extends BaseStructuralOptions {
  readModel?: string;
}

export interface InboxOptions extends BaseStructuralOptions {
  deduplicationWindowMs?: number;
}

export interface TopicOptions extends BaseStructuralOptions {
  partitions?: number;
  retentionMs?: number;
}

export interface QueueOptions extends BaseStructuralOptions {
  maxRetries?: number;
  deadLetterTarget?: string;
}

export interface ChannelOptions extends BaseStructuralOptions {
  type?: 'point-to-point' | 'publish-subscribe';
}

export const Event = createStructuralIdentifier<EventOptions>('Event', 'events', true);
export const Handler = createStructuralIdentifier<HandlerOptions>('Handler', 'events', true);
export const Projection = createStructuralIdentifier<ProjectionOptions>('Projection', 'events', true);
export const Inbox = createStructuralIdentifier<InboxOptions>('Inbox', 'events', true);
export const Topic = createStructuralIdentifier<TopicOptions>('Topic', 'events', true);
export const Queue = createStructuralIdentifier<QueueOptions>('Queue', 'events', true);
export const Channel = createStructuralIdentifier<ChannelOptions>('Channel', 'events', true);

