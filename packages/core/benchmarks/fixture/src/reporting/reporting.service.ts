import { Service } from '../../../../src/index.js';
import { InventoryService } from '@modules/inventory';
import { SearchService } from '@modules/search';
import { WishlistService } from '@modules/wishlist';
import { AnalyticsService } from '@modules/analytics';

Service('ReportingService');
export class ReportingService {
  execute() { return true; }
}