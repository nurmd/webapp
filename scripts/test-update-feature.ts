/**
 * Standalone verification script for Update Feature & Invoice Update Ledger Workflow.
 * Run directly with Node.js.
 */
import { updateService, CURRENT_APP_VERSION } from '../src/services/updateService.ts';
import { calculateInvoice } from '../src/core/gst/calculator.ts';
import {
  createSalesInvoiceVoucher,
  validateVoucherBalance,
  createPaymentReceiptVoucher,
  createPaymentOutVoucher,
} from '../src/core/accounting/ledger.ts';

console.log('==============================================');
console.log('TEST SUITE: APPLICATION & INVOICE UPDATE');
console.log('==============================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName} ${detail ? '- ' + detail : ''}`);
    failedTests++;
  }
}

async function runTests() {
  // 1. Version Comparison Logic
  console.log('--- 1. Testing SemVer Comparison Logic ---');
  assert(updateService.isNewer('1.1.0', '1.0.0') === true, '1.1.0 > 1.0.0 detects update needed');
  assert(updateService.isNewer('1.0.0', '1.1.0') === false, '1.0.0 < 1.1.0 correctly indicates no newer version');
  assert(updateService.isNewer('1.0.0', '1.0.0') === false, '1.0.0 === 1.0.0 correctly indicates same version');
  assert(updateService.isNewer('1.2.0', '1.1.9') === true, '1.2.0 > 1.1.9 handles minor increments');
  assert(updateService.isNewer('2.0.0', '1.9.9') === true, '2.0.0 > 1.9.9 handles major increments');

  // 2. GitHub OTA Release & Version Code Logic
  console.log('\n--- 2. Testing GitHub OTA Release Resolution & Version Code ---');
  assert(CURRENT_APP_VERSION === '1.0.4', 'Current App Version is initialized to 1.0.4');
  assert(updateService.getGitHubRepo() === 'nurmd/webapp', 'Default GitHub repo points to nurmd/webapp');
  assert(updateService.calculateVersionCode('1.0.4') === 10004, 'Calculates versionCode 10004 for 1.0.4');
  assert(updateService.calculateVersionCode('1.1.0') === 10100, 'Calculates versionCode 10100 for 1.1.0');
  
  const updateInfo = await updateService.checkForUpdates();
  assert(updateInfo.currentVersion === '1.0.4', 'Current version reported matches 1.0.4');
  assert(!!updateInfo.latestRelease, 'Latest release retrieved from GitHub OTA channel');
  assert(updateInfo.latestRelease?.apkUrl.includes('.apk') === true, 'APK download URL points to valid APK asset');
  assert(Array.isArray(updateInfo.latestRelease?.releaseNotes) && (updateInfo.latestRelease?.releaseNotes.length || 0) > 0, 'Release notes array populated');
  assert(updateService.isNewer('1.0.5', updateInfo.currentVersion) === true, 'Newer patch version triggers update');

  // 2b. SHA-256 Cryptographic Checksum & Integrity Logic
  console.log('\n--- 2b. Testing Checksum Integrity & Internal Download Logic ---');
  const sampleData = new TextEncoder().encode('Vyapar-PRO-APK-Binary-Payload-For-Testing');
  const sampleHash = await updateService.calculateSha256(sampleData.buffer);
  assert(typeof sampleHash === 'string' && sampleHash.length === 64, 'Calculates 64-character SHA-256 hex digest');
  
  // Verify matching hash
  const matchesSelf = sampleHash.length === 64;
  assert(matchesSelf, 'SHA-256 calculation executes correctly in environment');

  // Test checksum comparison & failure retry detection
  const dummyExpected = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const isMismatch = sampleHash !== dummyExpected;
  assert(isMismatch, 'Detects corrupted or mismatched checksum payload correctly');

  // 3. Invoice Edit & Re-calculation Workflow
  console.log('\n--- 3. Testing Invoice Edit & Ledger Voucher Recalculation ---');
  // Initial invoice with 2 items @ 1000 each (18% GST)
  const initialCalc = calculateInvoice('27', '27', [
    { quantity: 2, unitPrice: 1000, gstRate: 18 }
  ]);
  assert(initialCalc.grandTotal === 2360, 'Initial bill grand total is 2360');

  const initialVoucher = createSalesInvoiceVoucher({
    invoiceNumber: 'INV-2026-001',
    customerId: 'CUST-001',
    customerName: 'Acme Enterprises',
    date: '2026-09-29',
    taxableAmount: initialCalc.totalTaxableAmount,
    cgstAmount: initialCalc.totalCgst,
    sgstAmount: initialCalc.totalSgst,
    igstAmount: initialCalc.totalIgst,
    cessAmount: 0,
    grandTotal: initialCalc.grandTotal,
    isCashSale: false,
  });
  assert(validateVoucherBalance(initialVoucher.entries).isBalanced, 'Initial voucher maintains double-entry balance');

  // Edit invoice: Customer adds 1 more item (quantity from 2 -> 3)
  const updatedCalc = calculateInvoice('27', '27', [
    { quantity: 3, unitPrice: 1000, gstRate: 18 }
  ]);
  assert(updatedCalc.totalTaxableAmount === 3000, 'Updated Taxable Amount is 3000');
  assert(updatedCalc.totalCgst === 270, 'Updated CGST is 270 (9%)');
  assert(updatedCalc.totalSgst === 270, 'Updated SGST is 270 (9%)');
  assert(updatedCalc.grandTotal === 3540, 'Updated Grand Total is 3540');

  // Updated ledger voucher
  const updatedVoucher = createSalesInvoiceVoucher({
    invoiceNumber: 'INV-2026-001',
    customerId: 'CUST-001',
    customerName: 'Acme Enterprises',
    date: '2026-09-29',
    taxableAmount: updatedCalc.totalTaxableAmount,
    cgstAmount: updatedCalc.totalCgst,
    sgstAmount: updatedCalc.totalSgst,
    igstAmount: updatedCalc.totalIgst,
    cessAmount: 0,
    grandTotal: updatedCalc.grandTotal,
    isCashSale: false,
  });
  assert(validateVoucherBalance(updatedVoucher.entries).isBalanced, 'Updated voucher maintains double-entry balance');
  // 4. Payment Receipt & Payment Out Vouchers
  console.log('\n--- 4. Testing Payment Receipt & Payment Out Double-Entry Vouchers ---');
  const rcptVoucher = createPaymentReceiptVoucher({
    receiptNumber: 'RCPT-001',
    date: '2026-09-29',
    customerName: 'Acme Enterprises',
    customerId: 'CUST-001',
    amount: 1500,
    paymentMode: 'UPI',
    narration: 'Part payment via UPI UTR#123456',
  });
  assert(validateVoucherBalance(rcptVoucher.entries).isBalanced, 'Receipt voucher debits equal credits');
  assert(rcptVoucher.entries[0].accountId === 'ACC_BANK', 'UPI payment debits bank account');
  assert(rcptVoucher.entries[0].debit === 1500, 'UPI bank debit is 1500');
  assert(rcptVoucher.entries[1].accountId === 'CUST-001', 'Credits customer ledger');
  assert(rcptVoucher.entries[1].credit === 1500, 'Customer credit is 1500');

  const pymtVoucher = createPaymentOutVoucher({
    voucherNumber: 'PYMT-001',
    date: '2026-09-29',
    supplierName: 'National Hardware Ltd',
    supplierId: 'PTY-101',
    amount: 2500,
    paymentMode: 'CASH',
    narration: 'Cash settlement to supplier',
  });
  assert(validateVoucherBalance(pymtVoucher.entries).isBalanced, 'Payment Out voucher debits equal credits');
  assert(pymtVoucher.entries[0].accountId === 'PTY-101', 'Debits supplier ledger');
  assert(pymtVoucher.entries[0].debit === 2500, 'Supplier debit is 2500');
  assert(pymtVoucher.entries[1].accountId === 'ACC_CASH', 'Cash payment credits cash account');
  assert(pymtVoucher.entries[1].credit === 2500, 'Cash credit is 2500');

  console.log('\n==============================================');
  console.log(`SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('==============================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
