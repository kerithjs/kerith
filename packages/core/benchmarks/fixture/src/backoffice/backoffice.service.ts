import { Service } from '../../../../src/index.js';
import { PaymentsService } from '@modules/payments';
import { ProductsService } from '@modules/products';
import { RecommendationsService } from '@modules/recommendations';
import { TaxService } from '@modules/tax';

Service('BackofficeService');
export class BackofficeService {
  execute() { return true; }
}