import { Service } from '../../../../src/index.js';
import { UsersService } from '@modules/users';
import { HealthService } from '@modules/health';
import { SessionService } from '@modules/session';
import { StorageService } from '@modules/storage';

Service('CartService');
export class CartService {
  execute() { return true; }
}