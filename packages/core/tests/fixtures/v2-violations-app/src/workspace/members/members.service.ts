// @ts-nocheck — deliberate boundary violations for testing
import { Service } from '@kerith/core'

// domain-boundary-violation: importing from a different domain directly
import { PaymentService } from '@billing/payments'

Service('MemberService', { module: 'members' })

export class MemberService {
  // This service intentionally has boundary violations for testing
}
