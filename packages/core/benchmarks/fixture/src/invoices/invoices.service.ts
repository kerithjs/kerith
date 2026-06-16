import { Service } from '../../../../src/index.js';
import { StorageService } from '@modules/storage';
import { SessionService } from '@modules/session';
import { LoggerService } from '@modules/logger';
import { AuditService } from '@modules/audit';

Service('InvoicesService');
export class InvoicesService {
  execute() { return true; }
}