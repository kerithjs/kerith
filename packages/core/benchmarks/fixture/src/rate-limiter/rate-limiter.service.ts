import { Service } from '../../../../src/index.js';


Service('RateLimiterService');
export class RateLimiterService {
  execute() { return true; }
}