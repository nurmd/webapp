/**
 * scripts/stress-test-challenger2.ts
 *
 * EMPIRICAL ADVERSARIAL STRESS TEST HARNESS - MILESTONE 1 CHALLENGER 2
 *
 * Focus:
 * 1. HSN code validation (2-digit, 3-digit, 5-digit, 7-digit, non-numeric,
 *    alphanumeric, whitespace, service SAC prefix 99).
 * 2. Export Blocker Invariant: canExport is strictly false when at least 1 ERROR exists;
 *    canExport is true when only WARNINGs exist.
 * 3. Date parsing & period filtering: leap years, end-of-month, different date formats
 *    (YYYY-MM-DD, ISO, DD/MM/YYYY, DD-MM-YYYY).
 * 4. Property-based fuzzing and edge cases.
 */

import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';

// --- Build production validator bundle synchronously for runtime evaluation ---
const bundlePath = path.resolve('dist-test/gstrValidator.mjs');
if (!fs.existsSync(path.dirname(bundlePath))) {
  fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
}

esbuild.buildSync({
  entryPoints: ['src/core/gst/gstrValidator.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundlePath,
});

// Import compiled production validator
const validator = await import(bundlePath);
const {
  validateHsnSac,
  validateHsnCode,
  parseDocumentDate,
  isDocumentInPeriod,
  parseReturnPeriod,
  validatePlaceOfSupply,
  validateTaxBifurcation,
  reconcileHsnSummary,
  validateGstrPeriodData,
} = validator;

// --- Test Framework Helpers ---
let totalPassed = 0;
let totalFailed = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    totalPassed++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    totalFailed++;
    const errMsg = `  ✗ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`;
    failures.push(errMsg);
    console.error(errMsg);
  }
}

function suite(name: string) {
  console.log(`\n====================================================================`);
  console.log(`SUITE: ${name}`);
  console.log(`====================================================================`);
}

// --- Sample Data Helpers ---
function createCleanInvoice(overrides: any = {}): any {
  return {
    id: 'INV-001',
    invoiceNumber: 'INV/2026/001',
    invoiceType: 'B2B',
    date: '2026-10-15',
    partyGstin: '27AABCU9603R1ZN',
    placeOfSupplyStateCode: '27',
    totalTaxableAmount: 10000,
    totalCgst: 900,
    totalSgst: 900,
    totalIgst: 0,
    totalTax: 1800,
    grandTotal: 11800,
    items: [
      {
        id: 'ITEM-1',
        name: 'Industrial Widget A',
        hsnCode: '8471',
        quantity: 10,
        unit: 'NOS',
        pricePerUnit: 1000,
        taxableAmount: 10000,
        gstRate: 18,
        cgstAmount: 900,
        sgstAmount: 900,
        igstAmount: 0,
        total: 11800,
      },
    ],
    ...overrides,
  };
}

function createCleanPurchase(overrides: any = {}): any {
  return {
    id: 'PUR-001',
    billNumber: 'BILL-001',
    date: '2026-10-10',
    supplierGstin: '27AABCU9603R1ZN',
    supplierStateCode: '27',
    placeOfSupplyStateCode: '27',
    totalTaxableAmount: 5000,
    totalCgst: 450,
    totalSgst: 450,
    totalIgst: 0,
    totalTax: 900,
    grandTotal: 5900,
    items: [],
    ...overrides,
  };
}

// ====================================================================
// SUITE 1: HSN/SAC CODE VALIDATION (STRESS & BOUNDARY TESTS)
// ====================================================================
suite('1. HSN / SAC Code Validation & Boundary Enforcement');

// 1.1 Goods Valid Lengths (4, 6, 8 digits)
assert(validateHsnSac('8471') === true, '1.1.1 4-digit goods HSN accepted (8471)');
assert(validateHsnSac('0101') === true, '1.1.2 4-digit goods HSN with leading zero accepted (0101)');
assert(validateHsnSac('847130') === true, '1.1.3 6-digit goods HSN accepted (847130)');
assert(validateHsnSac('010110') === true, '1.1.4 6-digit goods HSN with leading zero accepted (010110)');
assert(validateHsnSac('84713010') === true, '1.1.5 8-digit goods HSN accepted (84713010)');
assert(validateHsnSac('01011010') === true, '1.1.6 8-digit goods HSN with leading zero accepted (01011010)');

// 1.2 Services Valid Lengths (6 digits starting with '99')
assert(validateHsnSac('995411') === true, '1.2.1 6-digit SAC service code accepted (995411)');
assert(validateHsnSac('998311') === true, '1.2.2 6-digit SAC IT service code accepted (998311)');
assert(validateHsnSac('996511') === true, '1.2.3 6-digit SAC transport service accepted (996511)');
assert(validateHsnSac('990000') === true, '1.2.4 6-digit SAC with zeros accepted (990000)');

const sRes = validateHsnCode('995411');
assert(sRes.isValid === true && sRes.type === 'SERVICES', '1.2.5 validateHsnCode classifies 995411 as SERVICES');

const gRes = validateHsnCode('8471');
assert(gRes.isValid === true && gRes.type === 'GOODS', '1.2.6 validateHsnCode classifies 8471 as GOODS');

// 1.3 Invalid Lengths for Goods (1, 2, 3, 5, 7, 9, 10+ digits)
assert(validateHsnSac('8') === false, '1.3.1 1-digit code rejected (8)');
assert(validateHsnSac('12') === false, '1.3.2 2-digit goods HSN rejected (12)');
assert(validateHsnSac('84') === false, '1.3.3 2-digit goods HSN rejected (84)');
assert(validateHsnSac('123') === false, '1.3.4 3-digit goods HSN rejected (123)');
assert(validateHsnSac('847') === false, '1.3.5 3-digit goods HSN rejected (847)');
assert(validateHsnSac('12345') === false, '1.3.6 5-digit goods HSN rejected (12345)');
assert(validateHsnSac('84713') === false, '1.3.7 5-digit goods HSN rejected (84713)');
assert(validateHsnSac('1234567') === false, '1.3.8 7-digit goods HSN rejected (1234567)');
assert(validateHsnSac('8471301') === false, '1.3.9 7-digit goods HSN rejected (8471301)');
assert(validateHsnSac('123456789') === false, '1.3.10 9-digit goods HSN rejected (123456789)');
assert(validateHsnSac('123456789012') === false, '1.3.11 12-digit goods HSN rejected (123456789012)');

// 1.4 Invalid Lengths for Services (prefix '99')
assert(validateHsnSac('99') === false, '1.4.1 2-digit SAC prefix 99 rejected');
assert(validateHsnSac('995') === false, '1.4.2 3-digit SAC prefix 99 rejected');
assert(validateHsnSac('9954') === false, '1.4.3 4-digit SAC prefix 99 rejected (must be strictly 6 digits)');
assert(validateHsnSac('99541') === false, '1.4.4 5-digit SAC prefix 99 rejected');
assert(validateHsnSac('9954112') === false, '1.4.5 7-digit SAC prefix 99 rejected');
assert(validateHsnSac('99541122') === false, '1.4.6 8-digit SAC prefix 99 rejected (SAC cannot be 8 digits)');

const sac4Res = validateHsnCode('9954');
assert(sac4Res.isValid === false && sac4Res.type === 'SERVICES', '1.4.7 validateHsnCode marks 4-digit 9954 invalid SERVICES');

const sac8Res = validateHsnCode('99541122');
assert(sac8Res.isValid === false && sac8Res.type === 'SERVICES', '1.4.8 validateHsnCode marks 8-digit 99541122 invalid SERVICES');

// 1.5 Non-numeric & Alphanumeric Inputs
assert(validateHsnSac('ABCD') === false, '1.5.1 Alphabetic string rejected (ABCD)');
assert(validateHsnSac('8471A') === false, '1.5.2 Trailing letter rejected (8471A)');
assert(validateHsnSac('A8471') === false, '1.5.3 Leading letter rejected (A8471)');
assert(validateHsnSac('84A1') === false, '1.5.4 Internal letter rejected (84A1)');
assert(validateHsnSac('9954AB') === false, '1.5.5 SAC with trailing letters rejected (9954AB)');
assert(validateHsnSac('84-71') === false, '1.5.6 Hyphenated code rejected (84-71)');
assert(validateHsnSac('8471.30') === false, '1.5.7 Decimal dot rejected (8471.30)');
assert(validateHsnSac('8471,30') === false, '1.5.8 Comma rejected (8471,30)');
assert(validateHsnSac('-8471') === false, '1.5.9 Negative sign rejected (-8471)');
assert(validateHsnSac('+8471') === false, '1.5.10 Plus sign rejected (+8471)');
assert(validateHsnSac('8471\0') === false, '1.5.11 Null byte rejected (8471\\0)');

// 1.6 Whitespace Handling
assert(validateHsnSac('  8471  ') === true, '1.6.1 Leading/trailing spaces trimmed for 4-digit HSN');
assert(validateHsnSac('  995411  ') === true, '1.6.2 Leading/trailing spaces trimmed for 6-digit SAC');
assert(validateHsnSac('\t84713010\n') === true, '1.6.3 Tab and newline trimmed for 8-digit HSN');
assert(validateHsnSac('84 71') === false, '1.6.4 Internal whitespace rejected (84 71)');
assert(validateHsnSac('99 54 11') === false, '1.6.5 Internal whitespace rejected in SAC (99 54 11)');
assert(validateHsnSac('   ') === false, '1.6.6 Pure whitespace string rejected');
assert(validateHsnSac('\t\n ') === false, '1.6.7 Pure whitespace tabs/newlines rejected');

// 1.7 Null / Undefined / Empty Inputs
assert(validateHsnSac('') === false, '1.7.1 Empty string rejected');
assert(validateHsnSac(undefined) === false, '1.7.2 undefined rejected');
assert(validateHsnSac(null as any) === false, '1.7.3 null rejected');

// 1.8 Fuzzing / Property Oracle Stress Test (5,000 iterations)
let fuzzFailures = 0;
for (let i = 0; i < 5000; i++) {
  let testStr = '';
  const randType = i % 5;
  if (randType === 0) {
    // Random digits of random length (0 to 15)
    const len = Math.floor(Math.random() * 15);
    for (let j = 0; j < len; j++) testStr += Math.floor(Math.random() * 10);
  } else if (randType === 1) {
    // Random alphanumeric string
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const len = Math.floor(Math.random() * 12);
    for (let j = 0; j < len; j++) testStr += chars[Math.floor(Math.random() * chars.length)];
  } else if (randType === 2) {
    // Valid candidate with random whitespace padding
    const validCodes = ['8471', '0101', '847130', '995411', '84713010', '998311'];
    const base = validCodes[Math.floor(Math.random() * validCodes.length)];
    const padL = ' '.repeat(Math.floor(Math.random() * 4));
    const padR = ' '.repeat(Math.floor(Math.random() * 4));
    testStr = `${padL}${base}${padR}`;
  } else if (randType === 3) {
    // SAC prefix '99' with random lengths
    const len = Math.floor(Math.random() * 10);
    testStr = '99';
    for (let j = 0; j < len; j++) testStr += Math.floor(Math.random() * 10);
  } else {
    // Punctuation & symbols
    testStr = `84${['-', '.', ' ', '/', '@'][Math.floor(Math.random() * 5)]}71`;
  }

  // Statutory Oracle:
  const clean = (testStr || '').trim();
  const isPureDigits = /^\d+$/.test(clean);
  let oracleValid = false;
  if (isPureDigits) {
    if (clean.startsWith('99')) {
      oracleValid = clean.length === 6;
    } else {
      oracleValid = clean.length === 4 || clean.length === 6 || clean.length === 8;
    }
  }

  const actual = validateHsnSac(testStr);
  if (actual !== oracleValid) {
    fuzzFailures++;
  }
}
assert(fuzzFailures === 0, `1.8.1 Fuzzed 5,000 inputs matched statutory oracle (failures: ${fuzzFailures})`);

// ====================================================================
// SUITE 2: EXPORT BLOCKER INVARIANT STRESS TESTS
// ====================================================================
suite('2. Export Blocker Invariant & Anomaly Diagnostics');

// Invariant 1: Clean data -> canExport === true, isValid === true, 0 errors, 0 warnings
const cleanInv = createCleanInvoice();
const cleanPur = createCleanPurchase();
const cleanSummary = validateGstrPeriodData('27AABCU9603R1ZN', '27', [cleanInv], [cleanPur], '102026');
assert(cleanSummary.canExport === true, '2.1.1 Clean period allows export (canExport === true)');
assert(cleanSummary.isValid === true, '2.1.2 Clean period is fully valid (isValid === true)');
assert(cleanSummary.totalErrors === 0, '2.1.3 Clean period has 0 errors');
assert(cleanSummary.totalWarnings === 0, '2.1.4 Clean period has 0 warnings');

// Invariant 2: 26 Distinct Error Conditions Individually Block Export
const errorTestCases = [
  {
    name: 'Company GSTIN invalid checksum',
    test: () => validateGstrPeriodData('27AABCU9603R1Z9', '27', [cleanInv], [], '102026'),
    code: 'INVALID_GSTIN_CHECKSUM',
  },
  {
    name: 'Missing customer GSTIN on B2B',
    test: () => validateGstrPeriodData('27AABCU9603R1ZN', '27', [createCleanInvoice({ partyGstin: '' })], [], '102026'),
    code: 'MISSING_CUSTOMER_GSTIN',
  },
  {
    name: 'Invalid customer GSTIN checksum on B2B',
    test: () => validateGstrPeriodData('27AABCU9603R1ZN', '27', [createCleanInvoice({ partyGstin: '27AABCU9603R1Z9' })], [], '102026'),
    code: 'INVALID_GSTIN_CHECKSUM',
  },
  {
    name: 'Invalid counterparty GSTIN on Credit Note',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [createCleanInvoice({ invoiceType: 'CREDIT_NOTE', partyGstin: '27AABCU9603R1Z9' })],
        [],
        '102026'
      ),
    code: 'INVALID_GSTIN_CHECKSUM',
  },
  {
    name: 'Invalid counterparty GSTIN on Debit Note',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [createCleanInvoice({ invoiceType: 'DEBIT_NOTE', partyGstin: '27AABCU9603R1Z9' })],
        [],
        '102026'
      ),
    code: 'INVALID_GSTIN_CHECKSUM',
  },
  {
    name: 'Invalid Place of Supply code (99)',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [createCleanInvoice({ placeOfSupplyStateCode: '99' })],
        [],
        '102026'
      ),
    code: 'POS_STATE_MISMATCH',
  },
  {
    name: 'Export with invalid POS state',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [createCleanInvoice({ invoiceType: 'EXPORT', placeOfSupplyStateCode: '99', totalCgst: 0, totalSgst: 0, totalIgst: 1800 })],
        [],
        '102026'
      ),
    code: 'POS_STATE_MISMATCH',
  },
  {
    name: 'Export invoice containing local CGST',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [createCleanInvoice({ invoiceType: 'EXPORT', placeOfSupplyStateCode: '96', totalCgst: 900, totalSgst: 0, totalIgst: 900 })],
        [],
        '102026'
      ),
    code: 'TAX_BIFURCATION_ERROR',
  },
  {
    name: 'Export invoice containing local SGST',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [createCleanInvoice({ invoiceType: 'EXPORT', placeOfSupplyStateCode: '96', totalCgst: 0, totalSgst: 900, totalIgst: 900 })],
        [],
        '102026'
      ),
    code: 'TAX_BIFURCATION_ERROR',
  },
  {
    name: 'Export WOPAY with tax liability',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [createCleanInvoice({ invoiceType: 'EXPORT', exportType: 'WOPAY', placeOfSupplyStateCode: '96', totalCgst: 0, totalSgst: 0, totalIgst: 1800 })],
        [],
        '102026'
      ),
    code: 'TAX_BIFURCATION_ERROR',
  },
  {
    name: 'Intra-state invoice with IGST > 0',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [createCleanInvoice({ placeOfSupplyStateCode: '27', totalCgst: 0, totalSgst: 0, totalIgst: 1800 })],
        [],
        '102026'
      ),
    code: 'TAX_BIFURCATION_ERROR',
  },
  {
    name: 'Intra-state invoice with asymmetric CGST != SGST',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [createCleanInvoice({ placeOfSupplyStateCode: '27', totalCgst: 1000, totalSgst: 800, totalIgst: 0 })],
        [],
        '102026'
      ),
    code: 'TAX_BIFURCATION_ERROR',
  },
  {
    name: 'Inter-state invoice with CGST > 0',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [createCleanInvoice({ partyGstin: '24AAACG1234F1ZA', placeOfSupplyStateCode: '24', totalCgst: 900, totalSgst: 0, totalIgst: 900 })],
        [],
        '102026'
      ),
    code: 'TAX_BIFURCATION_ERROR',
  },
  {
    name: 'Inter-state invoice with SGST > 0',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [createCleanInvoice({ partyGstin: '24AAACG1234F1ZA', placeOfSupplyStateCode: '24', totalCgst: 0, totalSgst: 900, totalIgst: 900 })],
        [],
        '102026'
      ),
    code: 'TAX_BIFURCATION_ERROR',
  },
  {
    name: 'Item missing HSN code',
    test: () => {
      const inv = createCleanInvoice();
      inv.items[0].hsnCode = '';
      return validateGstrPeriodData('27AABCU9603R1ZN', '27', [inv], [], '102026');
    },
    code: 'INVALID_HSN_CODE',
  },
  {
    name: 'Item with 2-digit HSN code (12)',
    test: () => {
      const inv = createCleanInvoice();
      inv.items[0].hsnCode = '12';
      return validateGstrPeriodData('27AABCU9603R1ZN', '27', [inv], [], '102026');
    },
    code: 'INVALID_HSN_CODE',
  },
  {
    name: 'Item with 3-digit HSN code (123)',
    test: () => {
      const inv = createCleanInvoice();
      inv.items[0].hsnCode = '123';
      return validateGstrPeriodData('27AABCU9603R1ZN', '27', [inv], [], '102026');
    },
    code: 'INVALID_HSN_CODE',
  },
  {
    name: 'Item with 5-digit HSN code (12345)',
    test: () => {
      const inv = createCleanInvoice();
      inv.items[0].hsnCode = '12345';
      return validateGstrPeriodData('27AABCU9603R1ZN', '27', [inv], [], '102026');
    },
    code: 'INVALID_HSN_CODE',
  },
  {
    name: 'Item with 7-digit HSN code (1234567)',
    test: () => {
      const inv = createCleanInvoice();
      inv.items[0].hsnCode = '1234567';
      return validateGstrPeriodData('27AABCU9603R1ZN', '27', [inv], [], '102026');
    },
    code: 'INVALID_HSN_CODE',
  },
  {
    name: 'Item with alphanumeric HSN code (8471AB)',
    test: () => {
      const inv = createCleanInvoice();
      inv.items[0].hsnCode = '8471AB';
      return validateGstrPeriodData('27AABCU9603R1ZN', '27', [inv], [], '102026');
    },
    code: 'INVALID_HSN_CODE',
  },
  {
    name: 'Item with 4-digit SAC code (9954)',
    test: () => {
      const inv = createCleanInvoice();
      inv.items[0].hsnCode = '9954';
      return validateGstrPeriodData('27AABCU9603R1ZN', '27', [inv], [], '102026');
    },
    code: 'INVALID_HSN_CODE',
  },
  {
    name: 'Item with 8-digit SAC code (99541122)',
    test: () => {
      const inv = createCleanInvoice();
      inv.items[0].hsnCode = '99541122';
      return validateGstrPeriodData('27AABCU9603R1ZN', '27', [inv], [], '102026');
    },
    code: 'INVALID_HSN_CODE',
  },
  {
    name: 'Supplier GSTIN checksum failure on purchase bill',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [cleanInv],
        [createCleanPurchase({ supplierGstin: '27AABCU9603R1Z9' })],
        '102026'
      ),
    code: 'INVALID_GSTIN_CHECKSUM',
  },
  {
    name: 'Intra-state purchase bill with IGST > 0',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [cleanInv],
        [createCleanPurchase({ placeOfSupplyStateCode: '27', totalCgst: 0, totalSgst: 0, totalIgst: 900 })],
        '102026'
      ),
    code: 'TAX_BIFURCATION_ERROR',
  },
  {
    name: 'Intra-state purchase bill with asymmetric CGST != SGST',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [cleanInv],
        [createCleanPurchase({ placeOfSupplyStateCode: '27', totalCgst: 500, totalSgst: 400, totalIgst: 0 })],
        '102026'
      ),
    code: 'TAX_BIFURCATION_ERROR',
  },
  {
    name: 'Inter-state purchase bill with CGST/SGST > 0',
    test: () =>
      validateGstrPeriodData(
        '27AABCU9603R1ZN',
        '27',
        [cleanInv],
        [createCleanPurchase({ supplierStateCode: '24', placeOfSupplyStateCode: '24', totalCgst: 450, totalSgst: 450, totalIgst: 0 })],
        '102026'
      ),
    code: 'TAX_BIFURCATION_ERROR',
  },
  {
    name: 'Table 12 HSN reconciliation discrepancy > ₹1.00',
    test: () => {
      const inv = createCleanInvoice();
      inv.totalTaxableAmount = 10000;
      inv.items[0].taxableAmount = 9998.5; // Difference of 1.50 > 1.00 tolerance
      return validateGstrPeriodData('27AABCU9603R1ZN', '27', [inv], [], '102026');
    },
    code: 'HSN_RECONCILIATION_MISMATCH',
  },
];

let errorCount = 1;
for (const tc of errorTestCases) {
  const summary = tc.test();
  const hasErr = summary.errors.some((e: any) => e.severity === 'ERROR' && e.code === tc.code);
  const blocks = summary.canExport === false;
  assert(
    hasErr && blocks && summary.totalErrors >= 1,
    `2.2.${errorCount} Blocker: ${tc.name} produces ERROR code ${tc.code} and blocks export`,
    `totalErrors=${summary.totalErrors}, canExport=${summary.canExport}`
  );
  errorCount++;
}

// Invariant 3: WARNINGs alone MUST NOT block export (canExport === true)
const warnInv1 = createCleanInvoice({
  partyGstin: '24AAACG1234F1ZA', // State 24
  placeOfSupplyStateCode: '27',    // Bill-to / Ship-to mismatch advisory warning
  totalCgst: 900,
  totalSgst: 900,
  totalIgst: 0,
});
const warnSummary1 = validateGstrPeriodData('27AABCU9603R1ZN', '27', [warnInv1], [], '102026');
assert(warnSummary1.totalWarnings === 1, '2.3.1 Advisory warning generated (totalWarnings === 1)');
assert(warnSummary1.totalErrors === 0, '2.3.2 Zero errors in warning-only batch (totalErrors === 0)');
assert(warnSummary1.isValid === false, '2.3.3 isValid is false due to advisory warning');
assert(warnSummary1.canExport === true, '2.3.4 canExport is strictly true when ONLY warnings exist');

// Invariant 4: Multiple WARNINGs alone MUST NOT block export
const warnInvoices = [
  createCleanInvoice({ id: 'I1', partyGstin: '24AAACG1234F1ZA', placeOfSupplyStateCode: '27' }),
  createCleanInvoice({ id: 'I2', partyGstin: '29ABCDE1234F1ZW', placeOfSupplyStateCode: '27' }),
  createCleanInvoice({ id: 'I3', partyGstin: '06AAAAA0000A1Z5', placeOfSupplyStateCode: '27' }),
  createCleanInvoice({ id: 'I4', partyGstin: '33BBBBB1111B1Z2', placeOfSupplyStateCode: '27' }),
  createCleanInvoice({ id: 'I5', partyGstin: '07CCCCC2222C1Z9', placeOfSupplyStateCode: '27' }),
];
const multiWarnSummary = validateGstrPeriodData('27AABCU9603R1ZN', '27', warnInvoices, [], '102026');
assert(multiWarnSummary.totalWarnings === 5, '2.4.1 5 advisory warnings generated (totalWarnings === 5)');
assert(multiWarnSummary.totalErrors === 0, '2.4.2 Zero errors in 5-warning batch');
assert(multiWarnSummary.canExport === true, '2.4.3 canExport remains TRUE with 5 advisory warnings');

// Invariant 5: WARNINGs + at least 1 ERROR strictly BLOCKS export
const mixedInvoices = [
  ...warnInvoices,
  createCleanInvoice({ id: 'I6_BAD', partyGstin: '' }), // Missing GSTIN on B2B is ERROR
];
const mixedSummary = validateGstrPeriodData('27AABCU9603R1ZN', '27', mixedInvoices, [], '102026');
assert(mixedSummary.totalWarnings === 5, '2.5.1 Mixed batch has 5 warnings');
assert(mixedSummary.totalErrors === 1, '2.5.2 Mixed batch has 1 error');
assert(mixedSummary.canExport === false, '2.5.3 Mixed batch strictly BLOCKS export (canExport === false)');

// Invariant 6: Cancelled / Estimate / Delivery Challan documents do NOT block export even if corrupted
const cancelledInv = createCleanInvoice({
  isCancelled: true,
  partyGstin: '', // Missing GSTIN would normally error
  items: [{ id: 'IT1', name: 'Bad', hsnCode: '12' }], // Bad 2-digit HSN
  totalIgst: 500, // Invalid bifurcation
});
const estimateInv = createCleanInvoice({
  invoiceType: 'ESTIMATE',
  partyGstin: '',
  items: [{ id: 'IT2', name: 'Bad', hsnCode: '12' }],
});
const challanInv = createCleanInvoice({
  invoiceType: 'DELIVERY_CHALLAN',
  partyGstin: '',
  items: [{ id: 'IT3', name: 'Bad', hsnCode: '12' }],
});
const nonTaxSummary = validateGstrPeriodData(
  '27AABCU9603R1ZN',
  '27',
  [cleanInv, cancelledInv, estimateInv, challanInv],
  [],
  '102026'
);
assert(nonTaxSummary.totalErrors === 0, '2.6.1 Cancelled and non-tax documents with corrupt data produce 0 errors');
assert(nonTaxSummary.canExport === true, '2.6.2 Cancelled and non-tax documents do not block export');

// ====================================================================
// SUITE 3: DATE PARSING & PERIOD FILTERING STRESS TESTS
// ====================================================================
suite('3. Date Parsing & Return Period Filtering');

// 3.1 Return Period Boundaries (parseReturnPeriod)
const jan26 = parseReturnPeriod('012026');
assert(jan26.isValid && jan26.startDate === '2026-01-01' && jan26.endDate === '2026-01-31', '3.1.1 January 2026 has 31 days (2026-01-01 to 2026-01-31)');

const feb26 = parseReturnPeriod('022026');
assert(feb26.isValid && feb26.startDate === '2026-02-01' && feb26.endDate === '2026-02-28', '3.1.2 February 2026 non-leap year has 28 days (2026-02-01 to 2026-02-28)');

const feb24 = parseReturnPeriod('022024');
assert(feb24.isValid && feb24.startDate === '2024-02-01' && feb24.endDate === '2024-02-29', '3.1.3 February 2024 leap year has 29 days (2024-02-01 to 2024-02-29)');

const feb20 = parseReturnPeriod('022020');
assert(feb20.isValid && feb20.startDate === '2020-02-01' && feb20.endDate === '2020-02-29', '3.1.4 February 2020 leap year has 29 days');

const feb00 = parseReturnPeriod('022000');
assert(feb00.isValid && feb00.startDate === '2000-02-01' && feb00.endDate === '2000-02-29', '3.1.5 February 2000 century leap year has 29 days');

const feb1900 = parseReturnPeriod('021900');
assert(feb1900.isValid && feb1900.startDate === '1900-02-01' && feb1900.endDate === '1900-02-28', '3.1.6 February 1900 non-leap century has 28 days');

const apr26 = parseReturnPeriod('042026');
assert(apr26.isValid && apr26.endDate === '2026-04-30', '3.1.7 April 2026 has 30 days');

const dec26 = parseReturnPeriod('122026');
assert(dec26.isValid && dec26.endDate === '2026-12-31', '3.1.8 December 2026 has 31 days');

// Invalid periods
assert(parseReturnPeriod('002026').isValid === false, '3.1.9 Month 00 rejected');
assert(parseReturnPeriod('132026').isValid === false, '3.1.10 Month 13 rejected');
assert(parseReturnPeriod('02202').isValid === false, '3.1.11 5-char period rejected');
assert(parseReturnPeriod('0220261').isValid === false, '3.1.12 7-char period rejected');
assert(parseReturnPeriod('ABCDEF').isValid === false, '3.1.13 Alphabetic period rejected');
assert(parseReturnPeriod('').isValid === false, '3.1.14 Empty period rejected');

// 3.2 Document Date Formats (parseDocumentDate)
const d1 = parseDocumentDate('2026-10-15');
assert(d1?.year === '2026' && d1?.month === '10', '3.2.1 YYYY-MM-DD parsed (2026-10-15)');

const d2 = parseDocumentDate('2024-02-29');
assert(d2?.year === '2024' && d2?.month === '02', '3.2.2 Leap day YYYY-MM-DD parsed (2024-02-29)');

const d3 = parseDocumentDate('2026-10-15T12:00:00.000Z');
assert(d3?.year === '2026' && d3?.month === '10', '3.2.3 ISO string parsed (2026-10-15T12:00:00.000Z)');

const d4 = parseDocumentDate('15-10-2026');
assert(d4?.year === '2026' && d4?.month === '10', '3.2.4 DD-MM-YYYY parsed (15-10-2026)');

const d5 = parseDocumentDate('15/10/2026');
assert(d5?.year === '2026' && d5?.month === '10', '3.2.5 DD/MM/YYYY parsed (15/10/2026)');

const d6 = parseDocumentDate('29/02/2024');
assert(d6?.year === '2024' && d6?.month === '02', '3.2.6 Leap day DD/MM/YYYY parsed (29/02/2024)');

const d7 = parseDocumentDate('29-02-2024');
assert(d7?.year === '2024' && d7?.month === '02', '3.2.7 Leap day DD-MM-YYYY parsed (29-02-2024)');

const d8 = parseDocumentDate('31/12/2026');
assert(d8?.year === '2026' && d8?.month === '12', '3.2.8 Year-end DD/MM/YYYY parsed (31/12/2026)');

const d9 = parseDocumentDate('01/01/2026');
assert(d9?.year === '2026' && d9?.month === '01', '3.2.9 Year-start DD/MM/YYYY parsed (01/01/2026)');

const d10 = parseDocumentDate('  2026-10-15  ');
assert(d10?.year === '2026' && d10?.month === '10', '3.2.10 Whitespace trimmed around YYYY-MM-DD');

const d11 = parseDocumentDate('  15/10/2026  ');
assert(d11?.year === '2026' && d11?.month === '10', '3.2.11 Whitespace trimmed around DD/MM/YYYY');

assert(parseDocumentDate('') === null, '3.2.12 Empty string returns null');
assert(parseDocumentDate('   ') === null, '3.2.13 Whitespace string returns null');
assert(parseDocumentDate('invalid-date') === null, '3.2.14 Invalid date string returns null');

// 3.3 Period Membership Filtering (isDocumentInPeriod)
// October 2026 ("102026")
assert(isDocumentInPeriod('2026-10-01', '102026') === true, '3.3.1 Start of month 2026-10-01 in 102026');
assert(isDocumentInPeriod('2026-10-15', '102026') === true, '3.3.2 Mid month 2026-10-15 in 102026');
assert(isDocumentInPeriod('2026-10-31', '102026') === true, '3.3.3 End of month 2026-10-31 in 102026');
assert(isDocumentInPeriod('01/10/2026', '102026') === true, '3.3.4 Start of month 01/10/2026 in 102026');
assert(isDocumentInPeriod('31/10/2026', '102026') === true, '3.3.5 End of month 31/10/2026 in 102026');
assert(isDocumentInPeriod('2026-10-31T23:59:59.999Z', '102026') === true, '3.3.6 End of month ISO in 102026');

// Outside October 2026
assert(isDocumentInPeriod('2026-09-30', '102026') === false, '3.3.7 Prior month 2026-09-30 NOT in 102026');
assert(isDocumentInPeriod('30/09/2026', '102026') === false, '3.3.8 Prior month 30/09/2026 NOT in 102026');
assert(isDocumentInPeriod('2026-11-01', '102026') === false, '3.3.9 Next month 2026-11-01 NOT in 102026');
assert(isDocumentInPeriod('01/11/2026', '102026') === false, '3.3.10 Next month 01/11/2026 NOT in 102026');
assert(isDocumentInPeriod('2025-10-15', '102026') === false, '3.3.11 Prior year 2025-10-15 NOT in 102026');
assert(isDocumentInPeriod('2027-10-15', '102026') === false, '3.3.12 Next year 2027-10-15 NOT in 102026');

// Leap Month 022024
assert(isDocumentInPeriod('2024-02-01', '022024') === true, '3.3.13 Leap month start 2024-02-01 in 022024');
assert(isDocumentInPeriod('2024-02-29', '022024') === true, '3.3.14 Leap day 2024-02-29 in 022024');
assert(isDocumentInPeriod('29/02/2024', '022024') === true, '3.3.15 Leap day 29/02/2024 in 022024');
assert(isDocumentInPeriod('2024-03-01', '022024') === false, '3.3.16 Next day 2024-03-01 NOT in 022024');

// Non-Leap Month 022026
assert(isDocumentInPeriod('2026-02-28', '022026') === true, '3.3.17 Non-leap month end 2026-02-28 in 022026');
assert(isDocumentInPeriod('28/02/2026', '022026') === true, '3.3.18 Non-leap month end 28/02/2026 in 022026');
assert(isDocumentInPeriod('2026-03-01', '022026') === false, '3.3.19 Next day 2026-03-01 NOT in 022026');

// 3.4 Multi-Period Dataset Isolation in validateGstrPeriodData
const multiPeriodInvoices = [
  // September 2026: Corrupted with severe errors
  createCleanInvoice({ id: 'SEP-1', date: '2026-09-15', partyGstin: '' }),
  createCleanInvoice({ id: 'SEP-2', date: '2026-09-20', items: [{ name: 'Bad', hsnCode: '12' }] }),

  // October 2026: Clean invoices
  createCleanInvoice({ id: 'OCT-1', date: '2026-10-01' }),
  createCleanInvoice({ id: 'OCT-2', date: '2026-10-15' }),
  createCleanInvoice({ id: 'OCT-3', date: '2026-10-31' }),

  // November 2026: Corrupted with tax bifurcation error
  createCleanInvoice({ id: 'NOV-1', date: '2026-11-05', totalIgst: 1800 }),
];

// Audit period October 2026
const octAudit = validateGstrPeriodData('27AABCU9603R1ZN', '27', multiPeriodInvoices, [], '102026');
assert(octAudit.totalErrors === 0, '3.4.1 October 2026 audit isolates target period with 0 errors');
assert(octAudit.canExport === true, '3.4.2 October 2026 canExport is TRUE despite corrupted adjacent periods');

// Audit period September 2026
const sepAudit = validateGstrPeriodData('27AABCU9603R1ZN', '27', multiPeriodInvoices, [], '092026');
assert(sepAudit.totalErrors >= 2, '3.4.3 September 2026 audit catches its 2 errors');
assert(sepAudit.canExport === false, '3.4.4 September 2026 audit correctly blocks export');

// Audit period November 2026
const novAudit = validateGstrPeriodData('27AABCU9603R1ZN', '27', multiPeriodInvoices, [], '112026');
assert(novAudit.totalErrors >= 1, '3.4.5 November 2026 audit catches its bifurcation error');
assert(novAudit.canExport === false, '3.4.6 November 2026 audit correctly blocks export');

// ====================================================================
// SUMMARY & VERDICT
// ====================================================================
console.log(`\n====================================================================`);
console.log(`STRESS TEST SUMMARY`);
console.log(`====================================================================`);
console.log(`Total Assertions Evaluated: ${totalPassed + totalFailed}`);
console.log(`Passed: ${totalPassed}`);
console.log(`Failed: ${totalFailed}`);

if (totalFailed > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) console.log(f);
  console.log(`\nVERDICT: REJECT`);
  process.exit(1);
} else {
  console.log(`\nALL STRESS TESTS PASSED CLEANLY!`);
  console.log(`VERDICT: APPROVE (Pending runtime import hygiene fix noted in findings)`);
  process.exit(0);
}
