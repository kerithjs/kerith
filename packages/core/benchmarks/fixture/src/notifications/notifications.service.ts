import { Service } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { SessionService } from '@modules/session';
import { AuthService } from '@modules/auth';
import { MetricsService } from '@modules/metrics';

Service('NotificationsService');
export class NotificationsService {
  execute() { return true; }
}