import { Service } from '../../../../src/index.js';
import { SessionService } from '@modules/session';
import { I18nService } from '@modules/i18n';
import { RateLimiterService } from '@modules/rate-limiter';
import { RedisService } from '@modules/redis';

Service('PromotionsService');
export class PromotionsService {
  execute() { return true; }
}