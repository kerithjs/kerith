import { Service } from '../../../../src/index.js';
import { SubscriptionsService } from '@modules/subscriptions';
import { RefundsService } from '@modules/refunds';
import { WishlistService } from '@modules/wishlist';
import { AddressService } from '@modules/address';

Service('OnboardingService');
export class OnboardingService {
  execute() { return true; }
}