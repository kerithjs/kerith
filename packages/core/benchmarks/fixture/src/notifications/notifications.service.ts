import { Service } from '../../../../src/index.js';
import { AuditService } from '@modules/audit';
import { DatabaseService } from '@modules/database';
import { StorageService } from '@modules/storage';
import { ConfigService } from '@modules/config';

Service('NotificationsService');
export class NotificationsService {
  execute() { return true; }
}