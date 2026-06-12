import { Service } from '../../../../src/index.js';
import { DatabaseService } from '@modules/database';
import { UsersService } from '@modules/users';
import { SessionService } from '@modules/session';
import { StorageService } from '@modules/storage';

Service('AnalyticsService');
export class AnalyticsService {
  execute() { return true; }
}