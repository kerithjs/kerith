import { Service } from '../../../../src/index.js';
import { ConfigService } from '@modules/config';
import { LoggerService } from '@modules/logger';
import { SessionService } from '@modules/session';
import { RateLimiterService } from '@modules/rate-limiter';

Service('ProductsService');
export class ProductsService {
  execute() { return true; }
}