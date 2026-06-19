import { Service } from '../../../../src/index.js';
import { LoggerService } from '@modules/logger';
import { UsersService } from '@modules/users';
import { SessionService } from '@modules/session';
import { AuditService } from '@modules/audit';

Service('NotificationsService');
export class NotificationsService {
  execute() { return true; }
}