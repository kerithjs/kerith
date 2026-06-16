import { Service } from '../../../../src/index.js';
import { CryptoService } from '@modules/crypto';
import { SessionService } from '@modules/session';
import { HealthService } from '@modules/health';
import { I18nService } from '@modules/i18n';

Service('RecommendationsService');
export class RecommendationsService {
  execute() { return true; }
}