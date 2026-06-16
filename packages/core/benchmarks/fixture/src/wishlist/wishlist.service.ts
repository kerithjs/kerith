import { Service } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { MetricsService } from '@modules/metrics';
import { RedisService } from '@modules/redis';
import { CryptoService } from '@modules/crypto';

Service('WishlistService');
export class WishlistService {
  execute() { return true; }
}