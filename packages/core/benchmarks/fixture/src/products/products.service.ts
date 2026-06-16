import { Service } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { AuthService } from '@modules/auth';
import { RateLimiterService } from '@modules/rate-limiter';
import { HealthService } from '@modules/health';

Service('ProductsService');
export class ProductsService {
  execute() { return true; }
}