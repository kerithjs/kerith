import { Service } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { RedisService } from '@modules/redis';
import { MailerService } from '@modules/mailer';
import { AuditService } from '@modules/audit';

Service('OrdersService');
export class OrdersService {
  execute() { return true; }
}