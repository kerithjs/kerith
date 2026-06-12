import { Service } from '../../../../src/index.js';
import { PromotionsService } from '@modules/promotions';
import { ReportsService } from '@modules/reports';
import { AnalyticsService } from '@modules/analytics';
import { NotificationsService } from '@modules/notifications';

Service('WebhooksService');
export class WebhooksService {
  execute() { return true; }
}