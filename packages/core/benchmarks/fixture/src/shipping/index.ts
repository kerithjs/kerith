import { Module } from '../../../../src/index.js';
import { MailerService } from '@modules/mailer';
import { RateLimiterService } from '@modules/rate-limiter';
import { SessionService } from '@modules/session';
import { CryptoService } from '@modules/crypto';

Module('shipping', {
  imports: ["mailer","rate-limiter","session","crypto"],
  exports: ['ShippingService']
});

export * from './shipping.service.js';
export * from './shipping.repository.js';
export * from './shipping.schema.js';