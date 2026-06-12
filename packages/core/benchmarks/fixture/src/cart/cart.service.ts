import { Service } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { I18nService } from '@modules/i18n';
import { ConfigService } from '@modules/config';
import { AuthService } from '@modules/auth';

Service('CartService');
export class CartService {
  execute() { return true; }
}