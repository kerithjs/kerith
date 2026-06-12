import { Service } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { RedisService } from '@modules/redis';
import { StorageService } from '@modules/storage';
import { MailerService } from '@modules/mailer';

Service('RefundsService');
export class RefundsService {
  execute() { return true; }
}