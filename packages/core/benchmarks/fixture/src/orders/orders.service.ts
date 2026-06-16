import { Service } from '../../../../src/index.js';
import { RedisService } from '@modules/redis';
import { CryptoService } from '@modules/crypto';
import { HealthService } from '@modules/health';
import { AuthService } from '@modules/auth';

Service('OrdersService');
export class OrdersService {
  execute() { return true; }
}