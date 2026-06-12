import { Service } from '../../../../src/index.js';


Service('HealthService');
export class HealthService {
  execute() { return true; }
}