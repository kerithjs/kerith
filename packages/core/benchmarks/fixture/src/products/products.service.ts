import { Service } from '../../../../src/index.js';
import { AuthService } from '@modules/auth';
import { UsersService } from '@modules/users';
import { MetricsService } from '@modules/metrics';
import { MailerService } from '@modules/mailer';

Service('ProductsService');
export class ProductsService {
  execute() { return true; }
}