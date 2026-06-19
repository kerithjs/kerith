import { Service } from '../../../../src/index.js';
import { SessionService } from '@modules/session';
import { UsersService } from '@modules/users';
import { MailerService } from '@modules/mailer';
import { HealthService } from '@modules/health';

Service('ProductsService');
export class ProductsService {
  execute() { return true; }
}