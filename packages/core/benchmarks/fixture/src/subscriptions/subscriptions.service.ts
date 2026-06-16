import { Service } from '../../../../src/index.js';
import { RedisService } from '@modules/redis';
import { MailerService } from '@modules/mailer';
import { AuditService } from '@modules/audit';
import { I18nService } from '@modules/i18n';

Service('SubscriptionsService');
export class SubscriptionsService {
  execute() { return true; }
}