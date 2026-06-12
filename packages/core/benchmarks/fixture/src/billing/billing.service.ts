import { Service } from '../../../../src/index.js';
import { SessionService } from '@modules/session';
import { StorageService } from '@modules/storage';
import { RateLimiterService } from '@modules/rate-limiter';
import { ConfigService } from '@modules/config';

Service('BillingService');
export class BillingService {
  execute() { return true; }
}