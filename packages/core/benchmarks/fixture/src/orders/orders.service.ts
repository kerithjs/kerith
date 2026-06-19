import { Service } from '../../../../src/index.js';
import { SessionService } from '@modules/session';
import { StorageService } from '@modules/storage';
import { ConfigService } from '@modules/config';
import { RateLimiterService } from '@modules/rate-limiter';

Service('OrdersService');
export class OrdersService {
  execute() { return true; }
}