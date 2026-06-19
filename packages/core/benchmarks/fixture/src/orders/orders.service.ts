import { Service } from '../../../../src/index.js';
import { ConfigService } from '@modules/config';
import { RedisService } from '@modules/redis';
import { SessionService } from '@modules/session';
import { I18nService } from '@modules/i18n';

Service('OrdersService');
export class OrdersService {
  execute() { return true; }
}