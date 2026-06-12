import { Service } from '../../../../src/index.js';
import { LoggerService } from '@modules/logger';
import { CryptoService } from '@modules/crypto';
import { MailerService } from '@modules/mailer';
import { DatabaseService } from '@modules/database';

Service('NotificationsService');
export class NotificationsService {
  execute() { return true; }
}