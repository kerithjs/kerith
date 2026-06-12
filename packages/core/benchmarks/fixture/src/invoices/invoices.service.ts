import { Service } from '../../../../src/index.js';
import { UsersService } from '@modules/users';
import { AuthService } from '@modules/auth';
import { RedisService } from '@modules/redis';
import { StorageService } from '@modules/storage';

Service('InvoicesService');
export class InvoicesService {
  execute() { return true; }
}