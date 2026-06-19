import { Service } from '../../../../src/index.js';
import { I18nService } from '@modules/i18n';
import { MetricsService } from '@modules/metrics';
import { StorageService } from '@modules/storage';
import { SessionService } from '@modules/session';

Service('PaymentsService');
export class PaymentsService {
  execute() { return true; }
}