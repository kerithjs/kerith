import { Service } from '../../../../src/index.js';
import { MailerService } from '@modules/mailer';
import { RedisService } from '@modules/redis';
import { CryptoService } from '@modules/crypto';
import { UsersService } from '@modules/users';

Service('RefundsService');
export class RefundsService {
  execute() { return true; }
}