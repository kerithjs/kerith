import { Module } from '../../../../src/index.js';
import { RedisService } from '@modules/redis';
import { RateLimiterService } from '@modules/rate-limiter';
import { ConfigService } from '@modules/config';
import { SessionService } from '@modules/session';

Module('wishlist', {
  imports: ["redis","rate-limiter","config","session"],
  exports: ['WishlistService']
});

export * from './wishlist.service.js';
export * from './wishlist.repository.js';
export * from './wishlist.schema.js';