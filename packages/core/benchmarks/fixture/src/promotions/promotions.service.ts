import { Service } from '../../../../src/index.js';
import { MetricsService } from '@modules/metrics';
import { I18nService } from '@modules/i18n';
import { ConfigService } from '@modules/config';
import { AuthService } from '@modules/auth';

Service('PromotionsService');
export class PromotionsService {
  execute() { return true; }
}