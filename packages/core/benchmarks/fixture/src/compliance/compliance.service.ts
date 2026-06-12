import { Service } from '../../../../src/index.js';
import { AddressService } from '@modules/address';
import { RefundsService } from '@modules/refunds';
import { ShippingService } from '@modules/shipping';
import { NotificationsService } from '@modules/notifications';

Service('ComplianceService');
export class ComplianceService {
  execute() { return true; }
}