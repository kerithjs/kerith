import { Service } from '../../../../src/index.js';
import { HealthService } from '@modules/health';
import { LoggerService } from '@modules/logger';
import { DatabaseService } from '@modules/database';
import { UsersService } from '@modules/users';

Service('PaymentsService');
export class PaymentsService {
  execute() { return true; }
}