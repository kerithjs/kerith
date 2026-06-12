import { Service } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { SessionService } from '@modules/session';
import { UsersService } from '@modules/users';
import { MailerService } from '@modules/mailer';

Service('OrdersService');
export class OrdersService {
  execute() { return true; }
}