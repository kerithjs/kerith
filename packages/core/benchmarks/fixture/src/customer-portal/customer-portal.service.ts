import { Service } from '../../../../src/index.js';
import { AnalyticsService } from '@modules/analytics';
import { PromotionsService } from '@modules/promotions';
import { TaxService } from '@modules/tax';
import { AddressService } from '@modules/address';

Service('CustomerPortalService');
export class CustomerPortalService {
  execute() { return true; }
}