import { Service } from '../../../../src/index.js';
import { SearchService } from '@modules/search';
import { InventoryService } from '@modules/inventory';
import { PromotionsService } from '@modules/promotions';
import { CartService } from '@modules/cart';

Service('OnboardingService');
export class OnboardingService {
  execute() { return true; }
}