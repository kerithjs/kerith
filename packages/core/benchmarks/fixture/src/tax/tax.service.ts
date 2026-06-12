import { Service } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { RateLimiterService } from '@modules/rate-limiter';
import { CryptoService } from '@modules/crypto';
import { AuditService } from '@modules/audit';

Service('TaxService');
export class TaxService {
  execute() { return true; }
}