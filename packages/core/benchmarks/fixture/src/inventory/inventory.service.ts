import { Service } from '../../../../src/index.js';
import { HealthService } from '@modules/health';
import { MailerService } from '@modules/mailer';
import { LoggerService } from '@modules/logger';
import { MetricsService } from '@modules/metrics';

Service('InventoryService');
export class InventoryService {
  execute() { return true; }
}