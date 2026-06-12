import { Service } from '../../../../src/index.js';
import { UsersService } from '@modules/users';
import { StorageService } from '@modules/storage';
import { MetricsService } from '@modules/metrics';
import { HealthService } from '@modules/health';

Service('SearchService');
export class SearchService {
  execute() { return true; }
}