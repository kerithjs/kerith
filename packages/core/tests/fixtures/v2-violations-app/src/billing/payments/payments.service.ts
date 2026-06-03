// @ts-nocheck — deliberate boundary violations for testing
import { Service } from '@kerith/core'

// domain-boundary-violation: importing from a module in a different domain directly
import { MemberService } from '@workspace/members'

// relative-boundary-violation: crossing module boundaries via relative path
import { InvoiceService } from '../../invoices/invoices.service'

Service('PaymentService', { module: 'payments' })

export class PaymentService {
  // This service intentionally has boundary violations for testing
}
