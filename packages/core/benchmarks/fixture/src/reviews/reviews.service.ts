import { Service } from '../../../../src/index.js';
import { UsersService } from '@modules/users';
import { RateLimiterService } from '@modules/rate-limiter';
import { HealthService } from '@modules/health';
import { I18nService } from '@modules/i18n';

Service('ReviewsService');
export class ReviewsService {
  execute() { return true; }
}