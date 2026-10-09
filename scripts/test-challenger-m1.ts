/**
 * scripts/test-challenger-m1.ts
 *
 * Milestone 1 Empirical Stress Test Harness
 * Role: Adversarial Verifier / Challenger
 *
 * Stress-tests:
 * 1. Luhn Modulo 36 checksum: 100+ random mutations, character swaps, bad chars,
 *    case sensitivity, length boundaries, and ground-truth oracle verification.
 * 2. Tax bifurcation: inter-state with intra-state taxes, intra-state with IGST,
 *    asymmetric CGST/SGST, zero-rated exports (WPAY/WOPAY), and fractional decimal taxes.
 * 3. End-to-end Pre-Filing Validation Engine export-blocking invariants.
 *
 * Execution: node --experimental-strip-types scripts/test-challenger-m1.ts
 */

import {
  validateGstin,
  calculateGstinChecksum,
  isValidGstinChecksum,
  validateTaxBifurcation,
  validatePlaceOfSupply,
  validateGstrPeriodData,
  ValidationError,
} from '../src/core/gst/gstrValidator.ts';
import { Invoice } from '../src/models/invoice.ts';
import { PurchaseBill } from '../src/models/purchase.ts';

const BASE36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
  } else {
    failedTests++;
    console.error(`[FAIL] ${testName} ${detail ? ':: ' + detail : ''}`);
  }
}

console.log('====================================================================');
console.log('CHALLENGER M1: EMPIRICAL STRESS TEST HARNESS');
console.log('Target: src/core/gst/gstrValidator.ts & src/core/gst/validator.ts');
console.log('====================================================================\n');

// ============================================================================
// 1. LUHN MODULO 36 CHECKSUM STRESS TESTING
// ============================================================================
console.log('--------------------------------------------------------------------');
console.log('TEST SUITE 1: LUHN MODULO 36 CHECKSUM STRESS TESTING');
console.log('--------------------------------------------------------------------');

// 1.1 Known Valid Baseline GSTINs across Multiple Indian States
const VALID_GSTIN_SAMPLES = [
  '27AAACR5055K1Z7', // Reliance Maharashtra
  '27AAACR5055K2Z6', // Reliance Maharashtra (2nd entity)
  '27AAACR5055K3Z5', // Reliance Maharashtra (3rd entity)
  '27AAACR5055K4Z4', // Reliance Maharashtra (4th entity)
  '27AAACR5055K5Z3', // Reliance Maharashtra (5th entity)
  '27AABCU9603R1ZN', // Maharashtra test entity
  '07AAAAA0000A1Z4', // Delhi entity
  '29ABCDE1234F1ZW', // Karnataka entity
  '24AAACG1234F1ZA', // Gujarat entity
  '33AAACB2222C1ZO', // Tamil Nadu entity
];

for (const gstin of VALID_GSTIN_SAMPLES) {
  const res = validateGstin(gstin);
  assert(res.isValid, `1.1 Baseline Valid GSTIN: ${gstin}`, res.error);
  assert(isValidGstinChecksum(gstin), `1.1 isValidGstinChecksum helper returns true for: ${gstin}`);
  const calcCheck = calculateGstinChecksum(gstin.substring(0, 14));
  assert(calcCheck === gstin[14], `1.1 Checksum character matches ground truth (${calcCheck} === ${gstin[14]})`);
}

// 1.2 Exhaustive Check Digit Single Corruption (35 mutations per valid GSTIN)
console.log('Running Check Digit Corruption tests (35 mutations x 10 GSTINs = 350 tests)...');
let checkDigitCorruptionsCaught = 0;
let totalCheckDigitCorruptions = 0;

for (const validGstin of VALID_GSTIN_SAMPLES) {
  const correctCheck = validGstin[14];
  const prefix14 = validGstin.substring(0, 14);

  for (let c = 0; c < BASE36_CHARS.length; c++) {
    const corruptChar = BASE36_CHARS[c];
    if (corruptChar === correctCheck) continue; // Skip identical

    totalCheckDigitCorruptions++;
    const corruptedGstin = prefix14 + corruptChar;
    const res = validateGstin(corruptedGstin);
    if (!res.isValid && res.error?.includes('Checksum mismatch')) {
      checkDigitCorruptionsCaught++;
    }
  }
}
assert(
  checkDigitCorruptionsCaught === totalCheckDigitCorruptions,
  `1.2 Exhaustive Check Digit Corruptions: 100% caught (${checkDigitCorruptionsCaught}/${totalCheckDigitCorruptions})`
);

// 1.3 Random Single-Character Mutations across All 15 Positions (150+ mutations)
console.log('Running Single-Character Mutation Fuzzer (Positions 0-14)...');
let fuzzedMutationsCount = 0;
let fuzzedMutationsCorrectlyEvaluated = 0;

// Seeded pseudo-random generator for reproducible stress testing
let rngState = 123456789;
function pseudoRandom(): number {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
}

for (let i = 0; i < 200; i++) {
  fuzzedMutationsCount++;
  // Pick random valid GSTIN from pool
  const baseGstin = VALID_GSTIN_SAMPLES[Math.floor(pseudoRandom() * VALID_GSTIN_SAMPLES.length)];
  const posToMutate = Math.floor(pseudoRandom() * 15);
  const originalChar = baseGstin[posToMutate];

  // Pick a random replacement character
  let replacementChar: string;
  do {
    replacementChar = BASE36_CHARS[Math.floor(pseudoRandom() * BASE36_CHARS.length)];
  } while (replacementChar === originalChar);

  const mutatedGstin =
    baseGstin.substring(0, posToMutate) + replacementChar + baseGstin.substring(posToMutate + 1);

  // Compute oracle expectation:
  // Is it valid according to Luhn mod 36 algorithm and GSTIN format rules?
  const regexMatch = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(mutatedGstin);
  const stateValid = /^(0[1-9]|[1-2][0-9]|3[0-8]|97)$/.test(mutatedGstin.substring(0, 2));
  const expectedCheck = calculateGstinChecksum(mutatedGstin.substring(0, 14));
  const oracleIsValid = regexMatch && stateValid && mutatedGstin[14] === expectedCheck;

  const actualResult = validateGstin(mutatedGstin);
  if (actualResult.isValid === oracleIsValid) {
    fuzzedMutationsCorrectlyEvaluated++;
  } else {
    console.error(
      `Mismatch on mutated GSTIN: ${mutatedGstin} (pos: ${posToMutate}, was: ${originalChar}, now: ${replacementChar}) - Oracle: ${oracleIsValid}, Got: ${actualResult.isValid}`
    );
  }
}
assert(
  fuzzedMutationsCorrectlyEvaluated === fuzzedMutationsCount,
  `1.3 Randomized 200 Single-Character Mutations Oracle Verification (${fuzzedMutationsCorrectlyEvaluated}/${fuzzedMutationsCount} passed)`
);

// 1.4 Adjacent Character Transposition (Character Swaps)
console.log('Running Adjacent Character Transposition Swap Harness...');
let adjacentSwapsCount = 0;
let adjacentSwapsDetected = 0;

for (const validGstin of VALID_GSTIN_SAMPLES) {
  for (let i = 0; i < 14; i++) {
    // Only swap if characters are different
    if (validGstin[i] === validGstin[i + 1]) continue;

    adjacentSwapsCount++;
    const chars = validGstin.split('');
    const temp = chars[i];
    chars[i] = chars[i + 1];
    chars[i + 1] = temp;
    const swappedGstin = chars.join('');

    const res = validateGstin(swappedGstin);
    // Swapping adjacent characters with different weights (1 vs 2) in Luhn Mod 36 is guaranteed to be detected!
    if (!res.isValid) {
      adjacentSwapsDetected++;
    } else {
      console.error(`Undetected swap between pos ${i} and ${i + 1} in ${validGstin}: ${swappedGstin}`);
    }
  }
}
assert(
  adjacentSwapsDetected === adjacentSwapsCount,
  `1.4 Adjacent Character Transposition Stress: 100% caught (${adjacentSwapsDetected}/${adjacentSwapsCount})`
);

// 1.5 Non-Adjacent Character Swaps
console.log('Running Non-Adjacent Character Swaps...');
let nonAdjacentSwapsTested = 0;
let nonAdjacentSwapsCaught = 0;

for (const validGstin of VALID_GSTIN_SAMPLES) {
  for (let step = 2; step <= 5; step++) {
    for (let i = 0; i + step < 15; i++) {
      if (validGstin[i] === validGstin[i + step]) continue;
      nonAdjacentSwapsTested++;
      const chars = validGstin.split('');
      const tmp = chars[i];
      chars[i] = chars[i + step];
      chars[i + step] = tmp;
      const swappedGstin = chars.join('');

      const res = validateGstin(swappedGstin);
      if (!res.isValid) {
        nonAdjacentSwapsCaught++;
      }
    }
  }
}
assert(
  nonAdjacentSwapsCaught === nonAdjacentSwapsTested,
  `1.5 Non-Adjacent Swaps: 100% caught (${nonAdjacentSwapsCaught}/${nonAdjacentSwapsTested})`
);

// 1.6 Bad & Special Characters / Fuzzing
console.log('Running Special Character Injection Fuzzer...');
const BAD_CHARS = ['@', '#', '$', '%', '&', '*', '!', '-', '_', ' ', '\t', '\n', '.', '/', '?', '0', '9', 'a'];
let badCharTests = 0;
let badCharsRejected = 0;

for (let i = 0; i < 15; i++) {
  for (const bad of BAD_CHARS) {
    badCharTests++;
    const corrupted = '27AAACR5055K1Z7'.substring(0, i) + bad + '27AAACR5055K1Z7'.substring(i + 1);
    const res = validateGstin(corrupted);
    // Note: if '0' or '9' or 'a' happens to produce a valid format at certain positions, check with oracle
    const oracleExpected =
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(corrupted.toUpperCase()) &&
      corrupted.toUpperCase()[14] === calculateGstinChecksum(corrupted.toUpperCase().substring(0, 14));

    if (res.isValid === oracleExpected) {
      badCharsRejected++;
    }
  }
}
assert(
  badCharsRejected === badCharTests,
  `1.6 Special Character Injection Fuzzer: (${badCharsRejected}/${badCharTests} correctly evaluated)`
);

// 1.7 Case Sensitivity & Whitespace Handling
console.log('Testing Case Sensitivity & Whitespace Handling...');
assert(
  validateGstin('27aaacr5055k1z7').isValid === true,
  '1.7.1 Lowercase GSTIN is normalized and accepted as valid'
);
assert(
  validateGstin('27AaAcR5055k1Z7').isValid === true,
  '1.7.2 Mixed case GSTIN is normalized and accepted as valid'
);
assert(
  validateGstin('  27AAACR5055K1Z7  ').isValid === true,
  '1.7.3 Leading/trailing spaces are trimmed and accepted as valid'
);
assert(
  validateGstin('\t27AAACR5055K1Z7\n').isValid === true,
  '1.7.4 Leading/trailing tabs/newlines trimmed and accepted'
);
assert(
  validateGstin('27AAACR 5055K1Z7').isValid === false,
  '1.7.5 Embedded space inside GSTIN is rejected'
);

// 1.8 Structural & Boundary Invalids
console.log('Testing Structural & Boundary Invalids...');
assert(validateGstin('').isValid === false, '1.8.1 Empty string rejected');
assert(validateGstin('   ').isValid === false, '1.8.2 Whitespace-only string rejected');
assert(validateGstin('27AAACR5055K1Z').isValid === false, '1.8.3 Truncated 14-character GSTIN rejected');
assert(validateGstin('27AAACR5055K1Z77').isValid === false, '1.8.4 Oversized 16-character GSTIN rejected');
assert(validateGstin('00AAACR5055K1Z7').isValid === false, '1.8.5 Invalid state code 00 rejected');
assert(validateGstin('99AAACR5055K1Z7').isValid === false, '1.8.6 Invalid state code 99 rejected');
assert(validateGstin('40AAACR5055K1Z7').isValid === false, '1.8.7 Invalid state code 40 rejected');
assert(validateGstin('27AAACR5055K0Z7').isValid === false, '1.8.8 Entity character 0 rejected (must be 1-9, A-Z)');
assert(validateGstin('27AAACR5055K1A7').isValid === false, '1.8.9 14th character A rejected (must be Z)');
assert(validateGstin('27AAACR5055K117').isValid === false, '1.8.10 14th character digit 1 rejected (must be Z)');

console.log(`\n>>> Suite 1 Complete: Total assertions evaluated in Suite 1: ${totalTests}\n`);

// ============================================================================
// 2. TAX BIFURCATION STRESS TESTING
// ============================================================================
console.log('--------------------------------------------------------------------');
console.log('TEST SUITE 2: TAX BIFURCATION STRESS TESTING');
console.log('--------------------------------------------------------------------');

// 2.1 Intra-State Bifurcation (MH -> MH)
console.log('Testing Intra-State Bifurcation...');
const intraValid = validateTaxBifurcation('27', '27', 10000, 900, 900, 0);
assert(intraValid.isValid, '2.1.1 Valid Intra-state supply (CGST=900, SGST=900, IGST=0) passes');

const intraWithIgst = validateTaxBifurcation('27', '27', 10000, 0, 0, 1800);
assert(!intraWithIgst.isValid, '2.1.2 Intra-state supply with IGST=1800 is rejected');
assert(
  intraWithIgst.error?.includes('Intra-state supply cannot contain Integrated Tax (IGST)'),
  '2.1.2 Diagnostics: error mentions cannot contain IGST'
);

const intraMixedIgst = validateTaxBifurcation('27', '27', 10000, 900, 900, 500);
assert(!intraMixedIgst.isValid, '2.1.3 Intra-state supply with both CGST/SGST AND IGST is rejected');

const intraAsymmetricLarge = validateTaxBifurcation('27', '27', 10000, 900, 800, 0);
assert(!intraAsymmetricLarge.isValid, '2.1.4 Intra-state supply with asymmetric CGST(900) vs SGST(800) is rejected');
assert(
  intraAsymmetricLarge.error?.includes('CGST and SGST amounts must be equal'),
  '2.1.4 Diagnostics: error mentions CGST and SGST amounts must be equal'
);

const intraOnlyCgst = validateTaxBifurcation('27', '27', 10000, 900, 0, 0);
assert(!intraOnlyCgst.isValid, '2.1.5 Intra-state supply with CGST=900 and SGST=0 is rejected');

const intraOnlySgst = validateTaxBifurcation('27', '27', 10000, 0, 900, 0);
assert(!intraOnlySgst.isValid, '2.1.6 Intra-state supply with CGST=0 and SGST=900 is rejected');

// 2.2 Intra-State Rounding Tolerance Boundary (<= 0.05 tolerance)
console.log('Testing Intra-State Rounding Tolerance Boundary (<= 0.05)...');
const intraRoundPass1 = validateTaxBifurcation('27', '27', 100, 9.02, 9.03, 0); // diff = 0.01
assert(intraRoundPass1.isValid, '2.2.1 Intra-state penny rounding difference 0.01 is permitted');

const intraRoundPassExact = validateTaxBifurcation('27', '27', 100, 9.00, 9.05, 0); // diff = 0.05
assert(intraRoundPassExact.isValid, '2.2.2 Intra-state boundary difference exactly 0.05 is permitted');

const intraRoundFail = validateTaxBifurcation('27', '27', 100, 9.00, 9.06, 0); // diff = 0.06
assert(!intraRoundFail.isValid, '2.2.3 Intra-state difference 0.06 strictly exceeds 0.05 threshold');

// 2.3 Inter-State Bifurcation (MH -> KA)
console.log('Testing Inter-State Bifurcation...');
const interValid = validateTaxBifurcation('27', '29', 10000, 0, 0, 1800);
assert(interValid.isValid, '2.3.1 Valid Inter-state supply (IGST=1800, CGST=0, SGST=0) passes');

const interWithCgst = validateTaxBifurcation('27', '29', 10000, 900, 0, 900);
assert(!interWithCgst.isValid, '2.3.2 Inter-state supply with CGST is rejected');
assert(
  interWithCgst.error?.includes('Inter-state supply cannot contain Central Tax (CGST)'),
  '2.3.2 Diagnostics: error mentions cannot contain CGST'
);

const interWithSgst = validateTaxBifurcation('27', '29', 10000, 0, 900, 900);
assert(!interWithSgst.isValid, '2.3.3 Inter-state supply with SGST is rejected');

const interWithBothCgstSgst = validateTaxBifurcation('27', '29', 10000, 900, 900, 0);
assert(!interWithBothCgstSgst.isValid, '2.3.4 Inter-state supply with CGST+SGST instead of IGST is rejected');

// 2.4 Export Supplies Bifurcation (WPAY vs WOPAY)
console.log('Testing Export Supplies Bifurcation...');
const exportWpayValid = validateTaxBifurcation('27', '96', 50000, 0, 0, 9000, true, 'WPAY');
assert(exportWpayValid.isValid, '2.4.1 Valid Export WPAY with IGST=9000 passes');

const exportWpayWithCgst = validateTaxBifurcation('27', '96', 50000, 4500, 0, 4500, true, 'WPAY');
assert(!exportWpayWithCgst.isValid, '2.4.2 Export WPAY cannot contain local CGST');

const exportWpayWithSgst = validateTaxBifurcation('27', '96', 50000, 0, 4500, 4500, true, 'WPAY');
assert(!exportWpayWithSgst.isValid, '2.4.3 Export WPAY cannot contain local SGST');

const exportWopayValid = validateTaxBifurcation('27', '96', 50000, 0, 0, 0, true, 'WOPAY');
assert(exportWopayValid.isValid, '2.4.4 Valid Export WOPAY with zero tax liability passes');

const exportWopayWithIgst = validateTaxBifurcation('27', '96', 50000, 0, 0, 9000, true, 'WOPAY');
assert(!exportWopayWithIgst.isValid, '2.4.5 Export WOPAY with IGST charged is rejected');
assert(
  exportWopayWithIgst.error?.includes('WOPAY) must have 0 tax charges'),
  '2.4.5 Diagnostics: error mentions WOPAY must have 0 tax charges'
);

const exportWopayWithCgst = validateTaxBifurcation('27', '96', 50000, 4500, 0, 0, true, 'WOPAY');
assert(!exportWopayWithCgst.isValid, '2.4.6 Export WOPAY with CGST charged is rejected');

// 2.5 Place of Supply Validation for Exports & Domestic
console.log('Testing Place of Supply Consistency...');
assert(validatePlaceOfSupply('96', undefined, true).isValid, '2.5.1 Export with POS 96 is valid');
assert(validatePlaceOfSupply('27', undefined, true).isValid, '2.5.2 Export with domestic port POS 27 is valid');
assert(!validatePlaceOfSupply('99', undefined, true).isValid, '2.5.3 Export with unrecognized POS 99 is invalid');

assert(validatePlaceOfSupply('27').isValid, '2.5.4 Domestic POS 27 is valid');
assert(!validatePlaceOfSupply('00').isValid, '2.5.5 Domestic POS 00 is invalid');
assert(!validatePlaceOfSupply('99').isValid, '2.5.6 Domestic POS 99 is invalid');

// POS vs Recipient GSTIN Mismatch
const posMatch = validatePlaceOfSupply('27', '27AAACR5055K1Z7');
assert(posMatch.isValid, '2.5.7 Recipient GSTIN prefix 27 matches POS 27');

const posMismatch = validatePlaceOfSupply('29', '27AAACR5055K1Z7');
assert(!posMismatch.isValid && posMismatch.severity === 'WARNING', '2.5.8 Recipient GSTIN 27 vs POS 29 raises WARNING');

// 2.6 Fractional Decimal Taxes Stress Testing (100+ randomized fractional values)
console.log('Running Fractional Decimal Tax Stress Fuzzer...');
let decimalStressPassCount = 0;
const DECIMAL_ITERATIONS = 120;

for (let i = 0; i < DECIMAL_ITERATIONS; i++) {
  // Generate random taxable amount e.g. 10.33 to 99999.77
  const baseAmt = Math.round((pseudoRandom() * 50000 + 10) * 100) / 100;
  const rate = [5, 12, 18, 28][Math.floor(pseudoRandom() * 4)];
  const isInter = pseudoRandom() > 0.5;

  if (isInter) {
    // Inter-state: IGST = round(baseAmt * rate / 100)
    const igst = Math.round(baseAmt * rate) / 100;
    const res = validateTaxBifurcation('27', '29', baseAmt, 0, 0, igst);
    if (res.isValid) decimalStressPassCount++;
  } else {
    // Intra-state: CGST = round(baseAmt * (rate / 2)) / 100, SGST = CGST
    const halfTax = Math.round((baseAmt * (rate / 2))) / 100;
    const res = validateTaxBifurcation('27', '27', baseAmt, halfTax, halfTax, 0);
    if (res.isValid) decimalStressPassCount++;
  }
}
assert(
  decimalStressPassCount === DECIMAL_ITERATIONS,
  `2.6 Fractional Decimal Tax Stress: 100% evaluated correctly (${decimalStressPassCount}/${DECIMAL_ITERATIONS})`
);

// Nil-rated / zero tax supplies
const nilRatedIntra = validateTaxBifurcation('27', '27', 5000, 0, 0, 0);
assert(nilRatedIntra.isValid, '2.6.2 Nil-rated intra supply with 0 taxes passes');

const nilRatedInter = validateTaxBifurcation('27', '29', 5000, 0, 0, 0);
assert(nilRatedInter.isValid, '2.6.3 Nil-rated inter supply with 0 taxes passes');

const zeroTaxableZeroTax = validateTaxBifurcation('27', '27', 0, 0, 0, 0);
assert(zeroTaxableZeroTax.isValid, '2.6.4 Zero taxable supply with zero taxes passes');

console.log(`\n>>> Suite 2 Complete: Total assertions evaluated so far: ${totalTests}\n`);

// ============================================================================
// 3. FULL VALIDATION ENGINE & EXPORT BLOCKER INVARIANTS
// ============================================================================
console.log('--------------------------------------------------------------------');
console.log('TEST SUITE 3: VALIDATION ENGINE & EXPORT BLOCKER INVARIANTS');
console.log('--------------------------------------------------------------------');

const COMPANY_GSTIN = '27AAACR5055K1Z7';
const COMPANY_STATE = '27';
const PERIOD = '102026';

function createMockInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 'INV-TEST-001',
    invoiceNumber: 'INV-001',
    date: '2026-10-15',
    customerName: 'Test Client',
    partyGstin: '27AABCU9603R1ZN',
    placeOfSupplyStateCode: '27',
    isIntraState: true,
    invoiceType: 'B2B',
    items: [
      {
        id: 'ITM-1',
        name: 'Item 1',
        hsnSacCode: '84713010',
        quantity: 1,
        unit: 'NOS',
        pricePerUnit: 10000,
        taxableAmount: 10000,
        gstRate: 18,
        cgstAmount: 900,
        sgstAmount: 900,
        igstAmount: 0,
        totalAmount: 11800,
      },
    ],
    totalTaxableAmount: 10000,
    totalCgst: 900,
    totalSgst: 900,
    totalIgst: 0,
    totalCess: 0,
    grandTotal: 11800,
    ...overrides,
  };
}

function createMockPurchase(overrides: Partial<PurchaseBill>): PurchaseBill {
  return {
    id: 'PUR-TEST-001',
    billNumber: 'BILL-001',
    date: '2026-10-16',
    supplierId: 'SUP-01',
    supplierName: 'Vendor Co',
    supplierGstin: '27AABCU9603R1ZN',
    supplierStateCode: '27',
    placeOfSupplyStateCode: '27',
    isIntraState: true,
    items: [
      {
        id: 'PITM-1',
        name: 'Raw Material',
        hsnSacCode: '8471',
        quantity: 1,
        unit: 'NOS',
        pricePerUnit: 5000,
        taxableAmount: 5000,
        gstRate: 18,
        cgstAmount: 450,
        sgstAmount: 450,
        igstAmount: 0,
        totalAmount: 5900,
      },
    ],
    totalTaxableAmount: 5000,
    totalCgst: 450,
    totalSgst: 450,
    totalIgst: 0,
    totalCess: 0,
    grandTotal: 5900,
    ...overrides,
  };
}

// 3.1 Fully Compliant Period Data
console.log('Testing Fully Compliant Period Data...');
const cleanSummary = validateGstrPeriodData(
  COMPANY_GSTIN,
  COMPANY_STATE,
  [createMockInvoice({})],
  [createMockPurchase({})],
  PERIOD
);
assert(cleanSummary.isValid === true, '3.1.1 Compliant period data has isValid === true');
assert(cleanSummary.canExport === true, '3.1.2 Compliant period data has canExport === true');
assert(cleanSummary.totalErrors === 0, '3.1.3 Compliant period data has totalErrors === 0');
assert(cleanSummary.totalWarnings === 0, '3.1.4 Compliant period data has totalWarnings === 0');

// 3.2 Corrupted Customer GSTIN Checksum Blocks Export
console.log('Testing Corrupted Customer GSTIN Checksum...');
const badGstinInvoice = createMockInvoice({
  partyGstin: '27AABCU9603R1Z9', // corrupted checksum
});
const badGstinSummary = validateGstrPeriodData(
  COMPANY_GSTIN,
  COMPANY_STATE,
  [badGstinInvoice],
  [],
  PERIOD
);
assert(badGstinSummary.isValid === false, '3.2.1 Corrupted customer GSTIN checksum sets isValid === false');
assert(badGstinSummary.canExport === false, '3.2.2 Corrupted customer GSTIN checksum BLOCKS export (canExport === false)');
assert(
  badGstinSummary.errors.some((e) => e.code === 'INVALID_GSTIN_CHECKSUM' && e.severity === 'ERROR'),
  '3.2.3 Error code INVALID_GSTIN_CHECKSUM recorded with severity ERROR'
);

// 3.3 Intra-State with IGST Blocks Export
console.log('Testing Intra-State with IGST Blocker...');
const intraIgstInvoice = createMockInvoice({
  placeOfSupplyStateCode: '27',
  totalCgst: 0,
  totalSgst: 0,
  totalIgst: 1800,
});
const intraIgstSummary = validateGstrPeriodData(
  COMPANY_GSTIN,
  COMPANY_STATE,
  [intraIgstInvoice],
  [],
  PERIOD
);
assert(intraIgstSummary.canExport === false, '3.3.1 Intra-state supply with IGST BLOCKS export');
assert(
  intraIgstSummary.errors.some((e) => e.code === 'TAX_BIFURCATION_ERROR' && e.severity === 'ERROR'),
  '3.3.2 Error code TAX_BIFURCATION_ERROR recorded for intra-state IGST'
);

// 3.4 Inter-State with CGST/SGST Blocks Export
console.log('Testing Inter-State with CGST/SGST Blocker...');
const interCgstInvoice = createMockInvoice({
  placeOfSupplyStateCode: '29',
  partyGstin: '29ABCDE1234F1ZW',
  totalCgst: 900,
  totalSgst: 900,
  totalIgst: 0,
});
const interCgstSummary = validateGstrPeriodData(
  COMPANY_GSTIN,
  COMPANY_STATE,
  [interCgstInvoice],
  [],
  PERIOD
);
assert(interCgstSummary.canExport === false, '3.4.1 Inter-state supply with CGST/SGST BLOCKS export');
assert(
  interCgstSummary.errors.some((e) => e.code === 'TAX_BIFURCATION_ERROR' && e.severity === 'ERROR'),
  '3.4.2 Error code TAX_BIFURCATION_ERROR recorded for inter-state CGST/SGST'
);

// 3.5 Intra-State Tax Asymmetry Blocks Export
console.log('Testing Intra-State Tax Asymmetry Blocker...');
const asymmetricInvoice = createMockInvoice({
  totalCgst: 900,
  totalSgst: 800, // difference = 100 > 0.05
  totalIgst: 0,
});
const asymSummary = validateGstrPeriodData(
  COMPANY_GSTIN,
  COMPANY_STATE,
  [asymmetricInvoice],
  [],
  PERIOD
);
assert(asymSummary.canExport === false, '3.5.1 Asymmetric CGST vs SGST (> 0.05) BLOCKS export');
assert(
  asymSummary.errors.some((e) => e.id.includes('ERR_TAX_ASYM')),
  '3.5.2 Error ERR_TAX_ASYM generated'
);

// 3.6 Inward Purchase Bill Bifurcation Anomalies Block Export
console.log('Testing Inward Purchase Bill Bifurcation Blocker...');
const badPurchase = createMockPurchase({
  supplierStateCode: '27',
  placeOfSupplyStateCode: '27',
  totalIgst: 900, // Invalid IGST on intra-state purchase
  totalCgst: 0,
  totalSgst: 0,
});
const purSummary = validateGstrPeriodData(
  COMPANY_GSTIN,
  COMPANY_STATE,
  [],
  [badPurchase],
  PERIOD
);
assert(purSummary.canExport === false, '3.6.1 Purchase Bill intra-state IGST BLOCKS export');
assert(
  purSummary.errors.some((e) => e.id.includes('ERR_PUR_TAX_BIF')),
  '3.6.2 Error ERR_PUR_TAX_BIF recorded for inward bill'
);

// 3.7 Supplier GSTIN Checksum Corruption Blocks Export
console.log('Testing Supplier GSTIN Checksum Corruption...');
const badSupPurchase = createMockPurchase({
  supplierGstin: '27AABCU9603R1Z0', // invalid check digit
});
const supGstinSummary = validateGstrPeriodData(
  COMPANY_GSTIN,
  COMPANY_STATE,
  [],
  [badSupPurchase],
  PERIOD
);
assert(supGstinSummary.canExport === false, '3.7.1 Corrupted supplier GSTIN BLOCKS export');
assert(
  supGstinSummary.errors.some((e) => e.code === 'INVALID_GSTIN_CHECKSUM' && e.documentType === 'PURCHASE'),
  '3.7.2 Error INVALID_GSTIN_CHECKSUM on PURCHASE document type recorded'
);

// 3.8 Company Profile GSTIN Checksum Corruption Blocks Export
console.log('Testing Company Profile GSTIN Checksum Blocker...');
const badCompanyGstinSummary = validateGstrPeriodData(
  '27AAACR5055K1Z0', // invalid check digit for company
  COMPANY_STATE,
  [createMockInvoice({})],
  [],
  PERIOD
);
assert(badCompanyGstinSummary.canExport === false, '3.8.1 Corrupted company GSTIN BLOCKS export');
assert(
  badCompanyGstinSummary.errors.some((e) => e.id === 'ERR_COMPANY_GSTIN'),
  '3.8.2 Error ERR_COMPANY_GSTIN recorded'
);

// 3.9 Advisory Warnings Do NOT Block Export
console.log('Testing Advisory Warning Non-Blocking Invariant...');
const billToShipToInvoice = createMockInvoice({
  partyGstin: '27AABCU9603R1ZN', // MH party
  placeOfSupplyStateCode: '29',    // KA ship-to POS (Bill-to / Ship-to model)
  totalCgst: 0,
  totalSgst: 0,
  totalIgst: 1800,               // Inter-state supply to KA
  items: [
    {
      id: 'ITM-1',
      name: 'Item 1',
      hsnSacCode: '84713010',
      quantity: 1,
      unit: 'NOS',
      pricePerUnit: 10000,
      taxableAmount: 10000,
      gstRate: 18,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 1800,
      totalAmount: 11800,
    },
  ],
});
const warningSummary = validateGstrPeriodData(
  COMPANY_GSTIN,
  COMPANY_STATE,
  [billToShipToInvoice],
  [],
  PERIOD
);
assert(
  warningSummary.totalWarnings > 0,
  '3.9.1 POS vs Recipient state mismatch generates advisory WARNING'
);
assert(
  warningSummary.totalErrors === 0,
  '3.9.2 POS vs Recipient state mismatch has zero blocking ERRORS'
);
assert(
  warningSummary.canExport === true,
  '3.9.3 Export is PERMITTED (canExport === true) when only advisory warnings exist'
);

console.log(`\n====================================================================`);
console.log(`CHALLENGER M1 RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log(`TOTAL EMPIRICAL ASSERTIONS: ${totalTests}`);
console.log(`====================================================================\n`);

if (failedTests > 0) {
  console.error(`VERDICT: REJECT - ${failedTests} empirical stress test assertion(s) failed.`);
  process.exit(1);
} else {
  console.log(`VERDICT: APPROVE - All ${totalTests} empirical stress test assertions PASSED CLEANLY.`);
  process.exit(0);
}
