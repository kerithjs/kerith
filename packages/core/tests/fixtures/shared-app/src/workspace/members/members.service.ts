// ← SHARED_SCOPE_VIOLATION: members is in workspace domain, cannot access @billing/shared
import { db } from '@billing/shared/db'

export function getMembers() {
  return db.find('all')
}
