import { Service } from '../../../../src/index.js';
import { RedisService } from '@modules/redis';
import { RateLimiterService } from '@modules/rate-limiter';
import { ConfigService } from '@modules/config';
import { SessionService } from '@modules/session';

Service('WishlistService');
export class WishlistService {
  execute() { return true; }
}