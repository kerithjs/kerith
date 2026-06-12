import { Module } from '../../../../src/index.js';
import { AddressService } from '@modules/address';
import { RefundsService } from '@modules/refunds';
import { ShippingService } from '@modules/shipping';
import { NotificationsService } from '@modules/notifications';

Module('compliance', {
  imports: ["address","refunds","shipping","notifications"],
  exports: ['ComplianceService']
});

export * from './compliance.service.js';
export * from './compliance.repository.js';
export * from './compliance.schema.js';