import { Service } from '../../../../src/index.js';
import { UsersService } from '@modules/users';
import { HealthService } from '@modules/health';
import { I18nService } from '@modules/i18n';
import { MailerService } from '@modules/mailer';

Service('TaxService');
export class TaxService {
  execute() { return true; }
}