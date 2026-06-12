import { Service } from '../../../../src/index.js';
import { HealthService } from '@modules/health';
import { AuditService } from '@modules/audit';
import { StorageService } from '@modules/storage';
import { AuthService } from '@modules/auth';

Service('SubscriptionsService');
export class SubscriptionsService {
  execute() { return true; }
}