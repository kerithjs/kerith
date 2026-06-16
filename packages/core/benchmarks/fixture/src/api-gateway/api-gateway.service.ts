import { Service } from '../../../../src/index.js';
import { SubscriptionsService } from '@modules/subscriptions';
import { BillingService } from '@modules/billing';
import { RefundsService } from '@modules/refunds';
import { InventoryService } from '@modules/inventory';

Service('ApiGatewayService');
export class ApiGatewayService {
  execute() { return true; }
}