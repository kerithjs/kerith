import { Service } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { I18nService } from '@modules/i18n';
import { RateLimiterService } from '@modules/rate-limiter';
import { AuditService } from '@modules/audit';

Service('ReviewsService');
export class ReviewsService {
  execute() { return true; }
}