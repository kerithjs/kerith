import { Service } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { LoggerService } from '@modules/logger';
import { AuthService } from '@modules/auth';
import { RateLimiterService } from '@modules/rate-limiter';

Service('PaymentsService');
export class PaymentsService {
  execute() { return true; }
}