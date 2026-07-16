// Valid: payments is in billing domain → @billing/shared access is implicit
// Valid: payments declared shared: ['@shared'] → @shared access allowed
import { format } from '@shared/format'
import { db } from '@billing/shared/db'

export function processPayment(id: string) {
  return format(db.find(id))
}
