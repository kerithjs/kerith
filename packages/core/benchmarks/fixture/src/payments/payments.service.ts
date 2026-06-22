import { Service } from '../../../../src/index.js';
import { UsersService } from '@modules/users';
import { LoggerService } from '@modules/logger';
import { StorageService } from '@modules/storage';
import { I18nService } from '@modules/i18n';

Service('PaymentsService');
export class PaymentsService {
  execute() { return true; }
}