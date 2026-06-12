import { Service } from '../../../../src/index.js';
import { LoggerService } from '@modules/logger';
import { StorageService } from '@modules/storage';
import { MailerService } from '@modules/mailer';
import { RedisService } from '@modules/redis';

Service('ReportsService');
export class ReportsService {
  execute() { return true; }
}