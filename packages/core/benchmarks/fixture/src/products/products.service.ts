import { Service } from '../../../../src/index.js';
import { LoggerService } from '@modules/logger';
import { ConfigService } from '@modules/config';
import { StorageService } from '@modules/storage';
import { AuthService } from '@modules/auth';

Service('ProductsService');
export class ProductsService {
  execute() { return true; }
}