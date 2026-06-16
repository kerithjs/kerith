import { Service } from '../../../../src/index.js';
import { SearchService } from '@modules/search';
import { RecommendationsService } from '@modules/recommendations';
import { SubscriptionsService } from '@modules/subscriptions';
import { ReviewsService } from '@modules/reviews';

Service('CheckoutService');
export class CheckoutService {
  execute() { return true; }
}