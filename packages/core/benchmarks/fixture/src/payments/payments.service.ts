import { Service } from '../../../../src/index.js';
import { SessionService } from '@modules/session';
import { ConfigService } from '@modules/config';
import { MetricsService } from '@modules/metrics';
import { MailerService } from '@modules/mailer';

Service('PaymentsService');
export class PaymentsService {
  execute() { return true; }
}