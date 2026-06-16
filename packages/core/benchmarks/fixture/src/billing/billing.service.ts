import { Service } from '../../../../src/index.js';
import { MetricsService } from '@modules/metrics';
import { ConfigService } from '@modules/config';
import { CryptoService } from '@modules/crypto';
import { StorageService } from '@modules/storage';

Service('BillingService');
export class BillingService {
  execute() { return true; }
}