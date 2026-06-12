import { Service } from '../../../../src/index.js';
import { PaymentsService } from '@modules/payments';
import { InventoryService } from '@modules/inventory';
import { SubscriptionsService } from '@modules/subscriptions';
import { ReviewsService } from '@modules/reviews';

Service('CrmService');
export class CrmService {
  execute() { return true; }
}