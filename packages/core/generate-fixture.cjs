const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'tests/fixtures/quality-violations-app');

// Rebuild from scratch
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

// Use flat module structure under src/modules/* (same as check-app-violations)
const authContent = "import { Module } from '@kerith/core';\nModule('auth', { exports: ['AuthService'] });\n";
const auth = path.join(root, 'src/modules/auth');
fs.mkdirSync(auth, { recursive: true });
fs.writeFileSync(path.join(auth, 'index.ts'), authContent);
fs.writeFileSync(path.join(auth, 'auth.service.ts'), 'export class AuthService {}\n');

// payments module: depth violation at processing/batch/legacy/deep/old.handler.ts = depth 4
const paymentsIndex = "import { Module } from '@kerith/core';\nModule('payments', { imports: ['auth'] });\n";
const payments = path.join(root, 'src/modules/payments');
fs.mkdirSync(payments, { recursive: true });
fs.writeFileSync(path.join(payments, 'index.ts'), paymentsIndex);
fs.writeFileSync(path.join(payments, 'payments.service.ts'), 'export class PaymentService {}\n');
const deep = path.join(payments, 'processing/batch/legacy/deep');
fs.mkdirSync(deep, { recursive: true });
fs.writeFileSync(path.join(deep, 'old.handler.ts'), 'export class OldHandler {}\n');

// invoices module: 31 files (> 30 default maxModuleFiles)
const invoicesIndex = "import { Module } from '@kerith/core';\nModule('invoices', { exports: ['InvoiceService'] });\n";
const invoices = path.join(root, 'src/modules/invoices');
fs.mkdirSync(invoices, { recursive: true });
fs.writeFileSync(path.join(invoices, 'index.ts'), invoicesIndex);
for (let i = 1; i <= 31; i++) {
  fs.writeFileSync(path.join(invoices, 'file' + i + '.ts'), 'export class File' + i + ' {}\n');
}

// 6 consumer modules importing auth (triggers fan-in > 5)
for (let i = 1; i <= 6; i++) {
  const consumer = path.join(root, 'src/modules/consumer' + i);
  fs.mkdirSync(consumer, { recursive: true });
  const idx = "import { Module } from '@kerith/core';\nModule('consumer" + i + "', { imports: ['auth'] });\n";
  fs.writeFileSync(path.join(consumer, 'index.ts'), idx);
  fs.writeFileSync(path.join(consumer, 'service.ts'), 'export class Consumer' + i + 'Service {}\n');
}

console.log('Fixture rebuilt with flat src/modules/* structure!');
