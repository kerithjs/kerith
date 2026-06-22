import { Service } from '../../../../src/index.js';
import { MailerService } from '@modules/mailer';
import { AuditService } from '@modules/audit';
import { LoggerService } from '@modules/logger';
import { I18nService } from '@modules/i18n';

Service('NotificationsService');
export class NotificationsService {
  execute() { return true; }
}