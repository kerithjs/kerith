import { Service } from '../../../../src/index.js';
import { AuditService } from '@modules/audit';
import { HealthService } from '@modules/health';
import { AuthService } from '@modules/auth';
import { RateLimiterService } from '@modules/rate-limiter';

Service('OrdersService');
export class OrdersService {
  execute() { return true; }
}