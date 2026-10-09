/**
 * scripts/stress-test-challenger1.ts
 *
 * EMPIRICAL ADVERSARIAL STRESS TEST HARNESS - MILESTONE 1 CHALLENGER 1
 * Role: Empirical Challenger (critic, specialist)
 * Target: Statutory GST Calculator & Double-Entry Voucher Balancing Engine
 *
 * Execution:
 * node --experimental-strip-types scripts/stress-test-challenger1.ts
 */

import {
  calculateInvoice,
  calculateItemGst,
} from '../src/core/gst/calculator.ts';
import type { InvoiceItemCalculationInput } from '../src/core/gst/calculator.ts';
import {
  validateVoucherBalance,
  createSalesInvoiceVoucher,
  createPurchaseInvoiceVoucher,
  createPaymentReceiptVoucher,
  createPaymentOutVoucher,
} from '../src/core/accounting/ledger.ts';
import type {
  VoucherPaymentSplit,
  JournalEntryLine,
} from '../src/core/accounting/ledger.ts';
import {
  parseSplitsFromInvoice,
  parseSplitsFromPurchase,
  formatSplitNotes,
} from '../src/core/accounting/paymentSplitUtils.ts';

// Test harness state
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
  } else {
    failedTests++;
    const msg = `[FAIL] ${testName} ${detail ? ':: ' + detail : ''}`;
    failureDetails.push(msg);
    console.error(msg);
  }
}

function printHeader(title: string) {
  console.log('\n====================================================================');
  console.log(title);
  console.log('====================================================================');
}

console.log('====================================================================');
console.log('M1 CHALLENGER 1: STATUTORY GST & VOUCHER BALANCING EMPIRICAL HARNESS');
console.log('Target: src/core/gst/calculator.ts & src/core/accounting/ledger.ts');
console.log('====================================================================');

// ============================================================================
// SUITE 1: STATUTORY INDIAN GST CALCULATOR ADVERSARIAL EDGE CASES
// ============================================================================
printHeader('SUITE 1: STATUTORY GST CALCULATOR ADVERSARIAL EDGE CASES');

// 1.1 All Standard GST Slabs (0%, 5%, 12%, 18%, 28%) Intra-state & Inter-state
const STANDARD_RATES = [0, 5, 12, 18, 28];
for (const rate of STANDARD_RATES) {
  // Intra-state
  const intra = calculateInvoice('27', '27', [{ quantity: 10, unitPrice: 100, gstRate: rate }]);
  assert(intra.isIntraState === true, `1.1 Intra-state slab ${rate}% flag`);
  assert(intra.totalTaxableAmount === 1000, `1.1 Intra-state slab ${rate}% taxable amount`);
  const expectedHalfTax = Number(((1000 * (rate / 2)) / 100).toFixed(2));
  assert(intra.totalCgst === expectedHalfTax, `1.1 Intra-state slab ${rate}% CGST matches ${expectedHalfTax}`);
  assert(intra.totalSgst === expectedHalfTax, `1.1 Intra-state slab ${rate}% SGST matches ${expectedHalfTax}`);
  assert(intra.totalIgst === 0, `1.1 Intra-state slab ${rate}% IGST is strictly 0`);

  // Inter-state
  const inter = calculateInvoice('27', '24', [{ quantity: 10, unitPrice: 100, gstRate: rate }]);
  assert(inter.isIntraState === false, `1.1 Inter-state slab ${rate}% flag`);
  const expectedIgst = Number(((1000 * rate) / 100).toFixed(2));
  assert(inter.totalCgst === 0, `1.1 Inter-state slab ${rate}% CGST is strictly 0`);
  assert(inter.totalSgst === 0, `1.1 Inter-state slab ${rate}% SGST is strictly 0`);
  assert(inter.totalIgst === expectedIgst, `1.1 Inter-state slab ${rate}% IGST matches ${expectedIgst}`);
}

// 1.2 Compound Cess (Cess % + Cess Per Unit) across varying quantities
console.log('Testing compound cess (ad-valorem percentage + specific per-unit rate)...');
const cessCases = [
  { qty: 10, price: 1000, cessPct: 12, cessUnit: 5, expectedCess: 1250 }, // (10000*0.12) + (10*5) = 1200 + 50 = 1250
  { qty: 100, price: 50, cessPct: 5, cessUnit: 0.5, expectedCess: 300 }, // (5000*0.05) + (100*0.5) = 250 + 50 = 300
  { qty: 1, price: 100000, cessPct: 28, cessUnit: 400, expectedCess: 28400 }, // (100000*0.28) + 400 = 28400
  { qty: 0, price: 500, cessPct: 12, cessUnit: 10, expectedCess: 0 }, // 0 quantity yields 0 cess
];
for (let i = 0; i < cessCases.length; i++) {
  const c = cessCases[i];
  const res = calculateInvoice('27', '27', [
    { quantity: c.qty, unitPrice: c.price, gstRate: 28, cessPercent: c.cessPct, cessPerUnit: c.cessUnit },
  ]);
  assert(res.totalCess === c.expectedCess, `1.2 Compound Cess Case ${i + 1} (${res.totalCess} === ${c.expectedCess})`);
}

// 1.3 Fractional Paise in Unit Prices & Fractional Quantities
console.log('Testing fractional paise in prices and decimal quantities...');
const fractionalCases = [
  { quantity: 3.333, unitPrice: 33.333, gstRate: 18 },
  { quantity: 0.001, unitPrice: 1000, gstRate: 12 },
  { quantity: 1.25, unitPrice: 99.99, gstRate: 5 },
  { quantity: 7.7777, unitPrice: 13.1313, gstRate: 28 },
];
for (let i = 0; i < fractionalCases.length; i++) {
  const fc = fractionalCases[i];
  const res = calculateInvoice('27', '27', [fc]);
  assert(!isNaN(res.grandTotal), `1.3 Fractional Case ${i + 1} grandTotal is not NaN`);
  assert(!isNaN(res.roundOff), `1.3 Fractional Case ${i + 1} roundOff is not NaN`);
  assert(!isNaN(res.totalTax), `1.3 Fractional Case ${i + 1} totalTax is not NaN`);
  // Mathematical invariant: grandTotal = netAmount + roundOff
  const sumCheck = Number((res.netAmount + res.roundOff).toFixed(2));
  assert(Math.abs(res.grandTotal - sumCheck) < 0.001, `1.3 Invariant: grandTotal === netAmount + roundOff (${res.grandTotal} vs ${sumCheck})`);
}

// 1.4 Extreme Discounts (100% discount, discount > gross, flat discount equal to gross)
console.log('Testing extreme discount boundary conditions...');
const disc100 = calculateInvoice('27', '27', [{ quantity: 5, unitPrice: 200, discountPercent: 100, gstRate: 18 }]);
assert(disc100.totalTaxableAmount === 0, '1.4 100% discount yields 0 taxable amount');
assert(disc100.totalTax === 0, '1.4 100% discount yields 0 tax');
assert(disc100.grandTotal === 0, '1.4 100% discount yields 0 grand total');

const discOver = calculateInvoice('27', '27', [{ quantity: 1, unitPrice: 100, discountAmount: 150, gstRate: 18 }]);
assert(discOver.totalTaxableAmount === 0, '1.4 Discount > gross is clamped to 0 taxable (no negative tax)');
assert(discOver.totalTax === 0, '1.4 Clamped taxable yields 0 tax');

// 1.5 Zero-Value Line Items
console.log('Testing zero-value line items...');
const zeroItem = calculateInvoice('27', '27', [{ quantity: 0, unitPrice: 0, gstRate: 18 }]);
assert(zeroItem.totalTaxableAmount === 0, '1.5 Zero item taxable amount is 0');
assert(zeroItem.grandTotal === 0, '1.5 Zero item grandTotal is 0');
assert(zeroItem.roundOff === 0, '1.5 Zero item roundOff is 0');

// 1.6 Massive Numbers (₹100 Crore / ₹1,000,000,000)
console.log('Testing massive numbers (₹100 Crore enterprise billing)...');
const massive = calculateInvoice('27', '27', [{ quantity: 1000000, unitPrice: 1000, gstRate: 18 }]); // ₹100 Crore
assert(massive.totalTaxableAmount === 1000000000, '1.6 Massive taxable amount is ₹1,000,000,000');
assert(massive.totalCgst === 90000000, '1.6 Massive CGST is ₹90,000,000');
assert(massive.totalSgst === 90000000, '1.6 Massive SGST is ₹90,000,000');
assert(massive.grandTotal === 1180000000, '1.6 Massive grandTotal is ₹1,180,000,000');

// 1.7 Stress Test: Single Invoice with 1,500 Line Items
console.log('Testing single invoice with 1,500 diverse line items...');
const largeItemCount = 1500;
const largeItems: InvoiceItemCalculationInput[] = [];
for (let i = 0; i < largeItemCount; i++) {
  largeItems.push({
    quantity: (i % 20) + 1,
    unitPrice: Number(((i * 7.37) % 500 + 1.25).toFixed(2)),
    discountPercent: (i % 5) * 2, // 0%, 2%, 4%, 6%, 8%
    gstRate: STANDARD_RATES[i % STANDARD_RATES.length],
    cessPercent: i % 10 === 0 ? 5 : 0,
    cessPerUnit: i % 25 === 0 ? 1.5 : 0,
  });
}
const largeSummary = calculateInvoice('27', '24', largeItems); // Inter-state
assert(largeSummary.items.length === largeItemCount, `1.7 Processed all ${largeItemCount} items`);
assert(largeSummary.totalTaxableAmount > 0, '1.7 Large invoice taxable amount is positive');
assert(largeSummary.totalIgst > 0, '1.7 Large invoice IGST is positive');
assert(largeSummary.grandTotal === Math.round(largeSummary.netAmount), '1.7 Grand total rounds correctly to nearest rupee');

// Check voucher balancing for this 1,500 item invoice
const largeVoucher = createSalesInvoiceVoucher({
  invoiceNumber: 'INV-STRESS-1500',
  date: '2026-10-09',
  customerName: 'Mega Corp',
  customerId: 'CUST-MEGA',
  taxableAmount: largeSummary.totalTaxableAmount,
  cgstAmount: largeSummary.totalCgst,
  sgstAmount: largeSummary.totalSgst,
  igstAmount: largeSummary.totalIgst,
  cessAmount: largeSummary.totalCess,
  grandTotal: largeSummary.grandTotal,
  roundOff: largeSummary.roundOff,
  isCashSale: false,
});
const largeBalance = validateVoucherBalance(largeVoucher.entries);
assert(largeBalance.isBalanced === true, `1.7 1,500-item sales voucher balances (diff=${largeBalance.diff})`);


// ============================================================================
// SUITE 2: PROPERTY-BASED FUZZING: 1,000 RANDOM SALES INVOICE PERMUTATIONS
// ============================================================================
printHeader('SUITE 2: 1,000 RANDOM SALES INVOICE CONFIGURATIONS FUZZING');
console.log('Generating and validating 1,000 randomized sales invoice vouchers...');

let salesVoucherFailures = 0;
const TENDER_MODES = ['CASH', 'BANK', 'UPI', 'CARD', 'NET_BANKING'];

for (let iteration = 1; iteration <= 1000; iteration++) {
  // Generate random invoice parameters
  const itemCount = Math.floor(Math.random() * 8) + 1; // 1 to 8 items
  const items: InvoiceItemCalculationInput[] = [];

  for (let j = 0; j < itemCount; j++) {
    const qty = Number((Math.random() * 50 + 0.1).toFixed(3));
    const price = Number((Math.random() * 5000 + 0.05).toFixed(2));
    const discPct = Math.random() < 0.4 ? Math.floor(Math.random() * 30) : 0;
    const rate = STANDARD_RATES[Math.floor(Math.random() * STANDARD_RATES.length)];
    const hasCess = Math.random() < 0.2;
    const cessPct = hasCess ? Math.floor(Math.random() * 15) : 0;
    const cessUnit = hasCess && Math.random() < 0.5 ? Number((Math.random() * 10).toFixed(2)) : 0;

    items.push({
      quantity: qty,
      unitPrice: price,
      discountPercent: discPct,
      gstRate: rate,
      cessPercent: cessPct,
      cessPerUnit: cessUnit,
    });
  }

  const isIntra = Math.random() < 0.6;
  const supplierState = '27';
  const posState = isIntra ? '27' : '24';
  const calc = calculateInvoice(supplierState, posState, items);

  // Generate payment setup (single cash, single credit, or multi-tender split)
  const paymentTypeChoice = Math.random();
  let paymentSplits: VoucherPaymentSplit[] | undefined = undefined;
  let isCashSale = false;

  if (paymentTypeChoice < 0.3) {
    // 100% cash
    isCashSale = true;
  } else if (paymentTypeChoice < 0.6) {
    // 100% credit
    isCashSale = false;
  } else {
    // Multi-tender split (2 to 4 splits summing exactly to grandTotal)
    const numSplits = Math.floor(Math.random() * 3) + 2; // 2 to 4 splits
    paymentSplits = [];
    let remainingAmount = calc.grandTotal;

    for (let s = 0; s < numSplits - 1; s++) {
      if (remainingAmount <= 1) break;
      const splitAmt = Math.max(1, Math.floor(Math.random() * (remainingAmount / (numSplits - s))));
      remainingAmount = Number((remainingAmount - splitAmt).toFixed(2));
      const mode = TENDER_MODES[Math.floor(Math.random() * TENDER_MODES.length)];
      paymentSplits.push({ mode, amount: splitAmt });
    }

    // Allocate remainder to CREDIT or another tender
    if (remainingAmount > 0) {
      paymentSplits.push({ mode: Math.random() < 0.5 ? 'CREDIT' : 'CASH', amount: remainingAmount });
    }
  }

  // Create voucher
  const voucher = createSalesInvoiceVoucher({
    invoiceNumber: `INV-FUZZ-${iteration}`,
    date: '2026-10-09',
    customerName: `Customer ${iteration}`,
    customerId: `CUST-${iteration}`,
    taxableAmount: calc.totalTaxableAmount,
    cgstAmount: calc.totalCgst,
    sgstAmount: calc.totalSgst,
    igstAmount: calc.totalIgst,
    cessAmount: calc.totalCess,
    grandTotal: calc.grandTotal,
    roundOff: calc.roundOff,
    isCashSale,
    paymentSplits,
  });

  // Verify balancing property
  const bal = validateVoucherBalance(voucher.entries);
  assert(bal.isBalanced === true && bal.diff === 0, `2.1 Random Sales Voucher #${iteration} balances exactly`, `diff=${bal.diff}`);

  // Verify no NaN or undefined in entries
  for (const entry of voucher.entries) {
    if (isNaN(entry.debit) || isNaN(entry.credit) || entry.debit < 0 || entry.credit < 0) {
      salesVoucherFailures++;
      console.error(`[FAIL] Iteration ${iteration} Malformed entry: ${JSON.stringify(entry)}`);
    }
  }
}

// ============================================================================
// SUITE 3: PROPERTY-BASED FUZZING: 1,000 RANDOM PURCHASE BILL PERMUTATIONS
// ============================================================================
printHeader('SUITE 3: 1,000 RANDOM PURCHASE BILL CONFIGURATIONS FUZZING');
console.log('Generating and validating 1,000 randomized purchase inward vouchers...');

let purchaseVoucherFailures = 0;

for (let iteration = 1; iteration <= 1000; iteration++) {
  const taxable = Number((Math.random() * 50000 + 10).toFixed(2));
  const isIntra = Math.random() < 0.5;
  const rate = STANDARD_RATES[Math.floor(Math.random() * STANDARD_RATES.length)];

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (isIntra) {
    cgst = Number(((taxable * (rate / 2)) / 100).toFixed(2));
    sgst = Number(((taxable * (rate / 2)) / 100).toFixed(2));
  } else {
    igst = Number(((taxable * rate) / 100).toFixed(2));
  }
  const hasCess = Math.random() < 0.2;
  const cess = hasCess ? Number(((taxable * 0.12)).toFixed(2)) : 0;

  const totalTax = Number((cgst + sgst + igst + cess).toFixed(2));
  const netAmount = Number((taxable + totalTax).toFixed(2));
  const grandTotal = Math.round(netAmount);
  const roundOff = Number((grandTotal - netAmount).toFixed(2));

  // Payment splits or single tender
  const isCashPurchase = Math.random() < 0.3;
  let paymentSplits: VoucherPaymentSplit[] | undefined = undefined;

  if (!isCashPurchase && Math.random() < 0.5) {
    // Multi-tender purchase payment
    const half = Math.floor(grandTotal / 2);
    paymentSplits = [
      { mode: 'NET_BANKING', amount: half },
      { mode: 'CREDIT', amount: Number((grandTotal - half).toFixed(2)) },
    ];
  }

  const voucher = createPurchaseInvoiceVoucher({
    billNumber: `PUR-FUZZ-${iteration}`,
    date: '2026-10-09',
    supplierName: `Supplier ${iteration}`,
    supplierId: `SUP-${iteration}`,
    taxableAmount: taxable,
    cgstAmount: cgst,
    sgstAmount: sgst,
    igstAmount: igst,
    cessAmount: cess,
    grandTotal,
    roundOff,
    isCashPurchase,
    paymentSplits,
  });

  const bal = validateVoucherBalance(voucher.entries);
  assert(bal.isBalanced === true && bal.diff === 0, `3.1 Random Purchase Voucher #${iteration} balances exactly`, `diff=${bal.diff}`);

  for (const entry of voucher.entries) {
    if (isNaN(entry.debit) || isNaN(entry.credit) || entry.debit < 0 || entry.credit < 0) {
      purchaseVoucherFailures++;
      console.error(`[FAIL] Iteration ${iteration} Malformed entry: ${JSON.stringify(entry)}`);
    }
  }
}

// ============================================================================
// SUITE 4: PAYMENT RECEIPTS & DISBURSEMENTS MULTI-TENDER STRESS (1,000 RUNS)
// ============================================================================
printHeader('SUITE 4: PAYMENT RECEIPTS & DISBURSEMENTS MULTI-TENDER STRESS');
console.log('Generating and validating 500 Payment Receipts & 500 Payment Out Vouchers...');

for (let i = 1; i <= 500; i++) {
  const totalAmount = Number((Math.random() * 25000 + 10).toFixed(2));
  const split1 = Number((totalAmount * 0.4).toFixed(2));
  const split2 = Number((totalAmount - split1).toFixed(2));

  const receiptVoucher = createPaymentReceiptVoucher({
    receiptNumber: `RCPT-STRESS-${i}`,
    date: '2026-10-09',
    customerName: `Customer ${i}`,
    customerId: `CUST-${i}`,
    amount: totalAmount,
    paymentMode: 'SPLIT',
    paymentSplits: [
      { mode: 'CASH', amount: split1 },
      { mode: 'UPI', amount: split2 },
    ],
  });

  const rBal = validateVoucherBalance(receiptVoucher.entries);
  assert(rBal.isBalanced === true && rBal.diff === 0, `4.1 Payment Receipt Voucher #${i} balances exactly`);
}

for (let i = 1; i <= 500; i++) {
  const totalAmount = Number((Math.random() * 40000 + 10).toFixed(2));
  const split1 = Number((totalAmount * 0.6).toFixed(2));
  const split2 = Number((totalAmount - split1).toFixed(2));

  const outVoucher = createPaymentOutVoucher({
    voucherNumber: `PYMT-STRESS-${i}`,
    date: '2026-10-09',
    supplierName: `Supplier ${i}`,
    supplierId: `SUP-${i}`,
    amount: totalAmount,
    paymentMode: 'SPLIT',
    paymentSplits: [
      { mode: 'CASH', amount: split1 },
      { mode: 'NET_BANKING', amount: split2 },
    ],
  });

  const oBal = validateVoucherBalance(outVoucher.entries);
  assert(oBal.isBalanced === true && oBal.diff === 0, `4.2 Payment Out Voucher #${i} balances exactly`);
}


// ============================================================================
// SUITE 5: ADVERSARIAL BOUNDARY ATTACKS & INVARIANT VERIFICATION
// ============================================================================
printHeader('SUITE 5: ADVERSARIAL BOUNDARY ATTACKS & INVARIANT VERIFICATION');

// 5.1 Section 170 Round-off Delta Sign Invariant
console.log('Testing Section 170 CGST Act Round-off +/- 50 paise boundary points...');
// Exact .49 down-rounding
const roundDownVoucher = createSalesInvoiceVoucher({
  invoiceNumber: 'INV-RND-DOWN',
  date: '2026-10-09',
  customerName: 'Round Down Buyer',
  customerId: 'CUST-RD',
  taxableAmount: 1000,
  cgstAmount: 89.25,
  sgstAmount: 89.26, // totalTax = 178.51, netAmount = 1178.51, grandTotal = 1179, roundOff = +0.49
  grandTotal: 1179,
  roundOff: 0.49,
  isCashSale: true,
});
const rdBal = validateVoucherBalance(roundDownVoucher.entries);
assert(rdBal.isBalanced, '5.1 +0.49 Round-up adjustment balances via ACC_ROUND_OFF credit');
assert(roundDownVoucher.entries.find((e) => e.accountId === 'ACC_ROUND_OFF')?.credit === 0.49, '5.1 ACC_ROUND_OFF is credited by 0.49');

// Exact .51 up-rounding
const roundUpVoucher = createSalesInvoiceVoucher({
  invoiceNumber: 'INV-RND-UP',
  date: '2026-10-09',
  customerName: 'Round Up Buyer',
  customerId: 'CUST-RU',
  taxableAmount: 1000,
  cgstAmount: 90.25,
  sgstAmount: 90.26, // totalTax = 180.51, netAmount = 1180.51, grandTotal = 1180, roundOff = -0.51 (wait, rounds to 1181, but if forced to 1180)
  grandTotal: 1180,
  roundOff: -0.51,
  isCashSale: true,
});
const ruBal = validateVoucherBalance(roundUpVoucher.entries);
assert(ruBal.isBalanced, '5.1 -0.51 Round-down adjustment balances via ACC_ROUND_OFF debit');
assert(roundUpVoucher.entries.find((e) => e.accountId === 'ACC_ROUND_OFF')?.debit === 0.51, '5.1 ACC_ROUND_OFF is debited by 0.51');

// 5.2 Odd 3-way split with odd decimal cents (100.00 split 3 ways: 33.33 + 33.33 + 33.34)
console.log('Testing 3-way split of 100.00 with fractional cents...');
const split3Voucher = createSalesInvoiceVoucher({
  invoiceNumber: 'INV-SPLIT-3WAY',
  date: '2026-10-09',
  customerName: 'Split Buyer',
  customerId: 'CUST-S3',
  taxableAmount: 100,
  cgstAmount: 0,
  sgstAmount: 0,
  grandTotal: 100,
  paymentSplits: [
    { mode: 'CASH', amount: 33.33 },
    { mode: 'UPI', amount: 33.33 },
    { mode: 'CREDIT', amount: 33.34 },
  ],
});
const s3Bal = validateVoucherBalance(split3Voucher.entries);
assert(s3Bal.isBalanced, `5.2 3-way split (33.33 + 33.33 + 33.34) balances (diff=${s3Bal.diff})`);

// 5.3 Zero Grand Total Voucher
console.log('Testing 0 grand total voucher handling...');
const zeroVoucher = createSalesInvoiceVoucher({
  invoiceNumber: 'INV-ZERO',
  date: '2026-10-09',
  customerName: 'Zero Buyer',
  customerId: 'CUST-0',
  taxableAmount: 0,
  cgstAmount: 0,
  sgstAmount: 0,
  grandTotal: 0,
  isCashSale: true,
});
const zeroBal = validateVoucherBalance(zeroVoucher.entries);
assert(zeroBal.isBalanced, '5.3 Zero total voucher has balanced debits and credits (0 diff)');

// 5.4 Undefined roundOff parameter auto-computation
console.log('Testing auto-computation of roundOff when omitted in voucher...');
const omittedRoundOffVoucher = createSalesInvoiceVoucher({
  invoiceNumber: 'INV-OMIT-RND',
  date: '2026-10-09',
  customerName: 'Omitted RoundOff Buyer',
  customerId: 'CUST-OMIT',
  taxableAmount: 1000,
  cgstAmount: 89.80,
  sgstAmount: 89.80, // netAmount = 1179.60
  grandTotal: 1180, // implicit roundOff = +0.40
});
const omitBal = validateVoucherBalance(omittedRoundOffVoucher.entries);
assert(omitBal.isBalanced, '5.4 Omitted roundOff auto-derives and balances voucher perfectly');
assert(omittedRoundOffVoucher.entries.find((e) => e.accountId === 'ACC_ROUND_OFF')?.credit === 0.4, '5.4 Derived roundOff credit is 0.40');

// 5.5 Multi-tender remainder allocation when credit split is absent
console.log('Testing multi-tender remainder allocation...');
const partialCashVoucher = createSalesInvoiceVoucher({
  invoiceNumber: 'INV-PARTIAL-CASH',
  date: '2026-10-09',
  customerName: 'Partial Cash Buyer',
  customerId: 'CUST-PC',
  taxableAmount: 1000,
  cgstAmount: 90,
  sgstAmount: 90,
  grandTotal: 1180,
  paymentSplits: [
    { mode: 'CASH', amount: 500 }, // No credit split specified, remainder 680 should go to customer ledger
  ],
});
const pcBal = validateVoucherBalance(partialCashVoucher.entries);
assert(pcBal.isBalanced, '5.5 Unassigned remainder automatically allocates to customer receivable and balances');
assert(partialCashVoucher.entries.find((e) => e.accountId === 'CUST-PC')?.debit === 680, '5.5 Remainder 680 booked to CUST-PC');


// ============================================================================
// FINAL METRICS & VERDICT REPORTING
// ============================================================================
console.log('\n====================================================================');
console.log('STRESS TEST HARNESS EXECUTION SUMMARY');
console.log('====================================================================');
console.log(`Total Assertions Evaluated : ${totalTests}`);
console.log(`Assertions Passed          : ${passedTests}`);
console.log(`Assertions Failed          : ${failedTests}`);
console.log(`Sales Vouchers Tested      : 1,000 randomized permutations + edge cases`);
console.log(`Purchase Vouchers Tested   : 1,000 randomized permutations`);
console.log(`Receipt & Payment Vouchers : 1,000 multi-tender vouchers`);
console.log(`Single Invoice Items Limit : 1,500 line items tested`);
console.log(`Overall Pass Rate          : ${((passedTests / totalTests) * 100).toFixed(2)}%`);
console.log('====================================================================\n');

if (failedTests > 0) {
  console.error('CRITICAL: TEST FAILURES ENCOUNTERED:');
  failureDetails.forEach((f) => console.error(f));
  process.exit(1);
} else {
  console.log('ALL EMPIRICAL TESTS PASSED WITH ZERO TOLERANCE DEVIATION.');
  process.exit(0);
}
