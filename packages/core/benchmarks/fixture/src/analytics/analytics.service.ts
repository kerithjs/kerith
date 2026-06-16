import { Service } from '../../../../src/index.js';
import { RedisService } from '@modules/redis';
import { DatabaseService } from '@modules/database';
import { StorageService } from '@modules/storage';
import { HealthService } from '@modules/health';

Service('AnalyticsService');
export class AnalyticsService {
  execute() { return true; }
}