import { Service } from '../../../../src/index.js';
import { LoggerService } from '@modules/logger';
import { AuthService } from '@modules/auth';
import { MailerService } from '@modules/mailer';
import { RedisService } from '@modules/redis';

Service('AddressService');
export class AddressService {
  execute() { return true; }
}