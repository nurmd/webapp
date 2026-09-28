/**
 * Standalone verification script for GST engine math and rules.
 * Run directly with Node.js.
 */
import { validateGstin, calculateGstinChecksum } from '../src/core/gst/validator.ts';
import { calculateInvoice, calculateItemGst } from '../src/core/gst/calculator.ts';
import { amountInWords } from '../src/core/utils/currencyWords.ts';
import { createSalesInvoiceVoucher, validateVoucherBalance } from '../src/core/accounting/ledger.ts';

console.log('==============================================');
console.log('RUNNING GST BILLING & ACCOUNTING TEST SUITE');
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

// 1. GSTIN Validation
console.log('--- 1. Testing GSTIN Validation & Mod 36 Checksum ---');
const validGstin = '27AABCU9603R1ZN';
const res1 = validateGstin(validGstin);
assert(res1.isValid, `Valid GSTIN: ${validGstin}`, res1.error);
assert(res1.stateCode === '27', 'State Code matches 27 (Maharashtra)');
assert(res1.pan === 'AABCU9603R', 'PAN correctly extracted from GSTIN');

const invalidGstin = '27AABCU9603R1Z9'; // Wrong checksum char
const res2 = validateGstin(invalidGstin);
assert(!res2.isValid, `Checksum mismatch detected properly on ${invalidGstin}`);

// 2. Intra-State Tax Calculation (Maharashtra -> Maharashtra)
console.log('\n--- 2. Testing Intra-State (CGST + SGST) Calculation ---');
const intraCalc = calculateInvoice('27', '27', [
  { quantity: 2, unitPrice: 1000, gstRate: 18 }, // Taxable = 2000, CGST = 180, SGST = 180, Total = 2360
]);
assert(intraCalc.isIntraState === true, 'Recognized as Intra-State transaction');
assert(intraCalc.totalTaxableAmount === 2000, 'Taxable Amount is 2000.00');
assert(intraCalc.totalCgst === 180, 'CGST is 180.00 (9%)');
assert(intraCalc.totalSgst === 180, 'SGST is 180.00 (9%)');
assert(intraCalc.totalIgst === 0, 'IGST is 0 for intra-state');
assert(intraCalc.grandTotal === 2360, 'Grand Total is 2360.00');

// 3. Inter-State Tax Calculation (Maharashtra -> Gujarat)
console.log('\n--- 3. Testing Inter-State (IGST) Calculation ---');
const interCalc = calculateInvoice('27', '24', [
  { quantity: 1, unitPrice: 5000, discountPercent: 10, gstRate: 18 }, // Gross 5000, Disc 500, Taxable 4500, IGST 810, Total 5310
]);
assert(interCalc.isIntraState === false, 'Recognized as Inter-State transaction');
assert(interCalc.totalTaxableAmount === 4500, 'Taxable after 10% discount is 4500.00');
assert(interCalc.totalCgst === 0 && interCalc.totalSgst === 0, 'CGST & SGST are 0');
assert(interCalc.totalIgst === 810, 'IGST is 810.00 (18%)');
assert(interCalc.grandTotal === 5310, 'Grand Total is 5310.00');

// 4. Number to Words (Indian Numbering Format)
console.log('\n--- 4. Testing Indian Currency Amount In Words ---');
const words1 = amountInWords(154200);
console.log('154,200 ->', words1);
assert(words1.includes('One Lakh Fifty Four Thousand Two Hundred'), 'Correctly converts Lakhs');

const words2 = amountInWords(25000000);
console.log('2,50,00,000 ->', words2);
assert(words2.includes('Two Crore Fifty Lakh'), 'Correctly converts Crores');

// 5. Double-Entry Accounting Balancing
console.log('\n--- 5. Testing Double-Entry Voucher Balancing ---');
const voucher = createSalesInvoiceVoucher({
  invoiceNumber: 'INV-TEST-001',
  date: '2026-09-28',
  customerName: 'Test Corp',
  customerId: 'PTY-001',
  taxableAmount: 10000,
  cgstAmount: 900,
  sgstAmount: 900,
  igstAmount: 0,
  cessAmount: 0,
  grandTotal: 11800,
  isCashSale: false,
});
const balanceResult = validateVoucherBalance(voucher.entries);
assert(balanceResult.isBalanced, 'Double Entry Total Debits equal Total Credits (Difference = 0)');

console.log('\n==============================================');
console.log(`SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('==============================================\n');
