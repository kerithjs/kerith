import { Service } from '../../../../src/index.js';
import { ShippingService } from '@modules/shipping';
import { ReviewsService } from '@modules/reviews';
import { BillingService } from '@modules/billing';
import { TaxService } from '@modules/tax';

Service('IntegrationsService');
export class IntegrationsService {
  execute() { return true; }
}