import { Service } from '../../../../src/index.js';
import { BillingService } from '@modules/billing';
import { PromotionsService } from '@modules/promotions';
import { RecommendationsService } from '@modules/recommendations';
import { SubscriptionsService } from '@modules/subscriptions';

Service('ApiGatewayService');
export class ApiGatewayService {
  execute() { return true; }
}