import { Service } from '../../../../src/index.js';
import { CryptoService } from '@modules/crypto';
import { RedisService } from '@modules/redis';
import { MailerService } from '@modules/mailer';
import { ConfigService } from '@modules/config';

Service('PaymentsService');
export class PaymentsService {
  execute() { return true; }
}