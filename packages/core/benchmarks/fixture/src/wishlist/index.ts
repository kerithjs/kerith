import { Module } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { MetricsService } from '@modules/metrics';
import { RedisService } from '@modules/redis';
import { CryptoService } from '@modules/crypto';

Module('wishlist', {
  imports: ["storage","metrics","redis","crypto"],
  exports: ['WishlistService']
});

export * from './wishlist.service.js';
export * from './wishlist.repository.js';
export * from './wishlist.schema.js';