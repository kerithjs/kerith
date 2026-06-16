import { Service } from '../../../../src/index.js';
import { MetricsService } from '@modules/metrics';
import { I18nService } from '@modules/i18n';
import { CryptoService } from '@modules/crypto';
import { AuthService } from '@modules/auth';

Service('SearchService');
export class SearchService {
  execute() { return true; }
}