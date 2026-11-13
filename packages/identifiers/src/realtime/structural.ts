// src/realtime/structural.ts

import { createStructuralIdentifier } from '../structural/index.js';
import type { BaseStructuralOptions } from '../structural/types.js';

export interface RoomOptions extends BaseStructuralOptions {
  maxMembers?: number;
}

export interface BroadcastOptions extends BaseStructuralOptions {
  ack?: boolean;
}

export interface SocketOptions extends BaseStructuralOptions {
  transport?: 'websocket' | 'polling';
}

export const Room = createStructuralIdentifier<RoomOptions>('Room', 'realtime', true);
export const Broadcast = createStructuralIdentifier<BroadcastOptions>('Broadcast', 'realtime', true);
export const Socket = createStructuralIdentifier<SocketOptions>('Socket', 'realtime', true);
