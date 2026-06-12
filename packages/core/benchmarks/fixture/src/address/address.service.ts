import { Service } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { I18nService } from '@modules/i18n';
import { HealthService } from '@modules/health';
import { ConfigService } from '@modules/config';

Service('AddressService');
export class AddressService {
  execute() { return true; }
}