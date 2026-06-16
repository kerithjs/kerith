import { Service } from '../../../../src/index.js';
import { MailerService } from '@modules/mailer';
import { RateLimiterService } from '@modules/rate-limiter';
import { SessionService } from '@modules/session';
import { CryptoService } from '@modules/crypto';

Service('ShippingService');
export class ShippingService {
  execute() { return true; }
}