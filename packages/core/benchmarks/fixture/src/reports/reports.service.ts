import { Service } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { CryptoService } from '@modules/crypto';
import { RedisService } from '@modules/redis';
import { RateLimiterService } from '@modules/rate-limiter';

Service('ReportsService');
export class ReportsService {
  execute() { return true; }
}