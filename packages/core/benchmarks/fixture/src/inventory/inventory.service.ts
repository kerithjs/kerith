import { Service } from '../../../../src/index.js';
import { LoggerService } from '@modules/logger';
import { RedisService } from '@modules/redis';
import { SessionService } from '@modules/session';
import { StorageService } from '@modules/storage';

Service('InventoryService');
export class InventoryService {
  execute() { return true; }
}