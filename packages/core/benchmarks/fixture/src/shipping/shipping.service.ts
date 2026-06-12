import { Service } from '../../../../src/index.js';
import { AuthService } from '@modules/auth';
import { RateLimiterService } from '@modules/rate-limiter';
import { LoggerService } from '@modules/logger';
import { MetricsService } from '@modules/metrics';

Service('ShippingService');
export class ShippingService {
  execute() { return true; }
}