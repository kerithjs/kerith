import { Service } from '../../../../src/index.js';
import { MetricsService } from '@modules/metrics';
import { StorageService } from '@modules/storage';
import { RedisService } from '@modules/redis';
import { I18nService } from '@modules/i18n';

Service('NotificationsService');
export class NotificationsService {
  execute() { return true; }
}