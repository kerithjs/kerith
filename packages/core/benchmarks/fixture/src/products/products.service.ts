import { Service } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { UsersService } from '@modules/users';
import { I18nService } from '@modules/i18n';
import { MetricsService } from '@modules/metrics';

Service('ProductsService');
export class ProductsService {
  execute() { return true; }
}