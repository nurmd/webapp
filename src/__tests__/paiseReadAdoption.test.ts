import { describe, it, expect } from 'vitest';
import {
  readPaiseOr,
  attachPaiseFields,
  PAISE_SCHEMA_VERSION,
} from '../core/accounting/paisePersistence.ts';
import { computePartyDues } from '../core/accounting/partyDues.ts';
import { computeBalanceSheetSummary } from '../core/accounting/balanceSheetCalculator.ts';
import { computeAgingBreakdown, type AgingItemInput } from '../core/accounting/aging.ts';
import {
  getOutstandingDocuments,
  applyAllocations,
  reverseAllocations,
  validateInvoicePreSave,
  validatePurchasePreSave,
} from '../core/accounting/paymentAllocation.ts';
import {
  parseSplitsFromInvoice,
  parseSplitsFromPurchase,
  derivePaymentSettlement,
} from '../core/accounting/paymentSplitUtils.ts';
import { computeCashBankSummary } from '../core/accounting/cashBankCalculator.ts';
import { buildCashBankReconciliation } from '../core/accounting/cashBankReconciliation.ts';
import { computeCashFlowStatement } from '../core/accounting/cashFlowCalculator.ts';
import { validateVoucherBalance } from '../core/accounting/ledger.ts';
import type { Party } from '../models/party.ts';
import type { Invoice } from '../models/invoice.ts';
import type { PurchaseBill } from '../models/purchase.ts';
import type { LoanAccount, LoanTransaction } from '../models/loan.ts';
import type { BankAccount, CashBankTransaction } from '../models/bankAccount.ts';
import type { InventoryItem } from '../models/item.ts';
import type { Expense } from '../models/expense.ts';
import type { Voucher } from '../core/accounting/voucherTypes.ts';

describe('paiseReadAdoption', () => {
  describe('readPaiseOr unit semantics', () => {
    // 1. readPaiseOr returns the rupee-derived paise when the doc has no paiseSchema.
    it('returns rupee-derived paise when doc has no paiseSchema', () => {
      const doc = { grandTotal: 1171, currentBalance: 50.25 };
      expect(readPaiseOr(doc, 'grandTotal')).toBe(117100);
      expect(readPaiseOr(doc, 'currentBalance')).toBe(5025);
    });

    // 2. Returns the twin value when the doc is current and the twin matches the rupee field.
    it('returns the twin value when doc is current and the twin matches the rupee field', () => {
      const party = attachPaiseFields(
        {
          id: 'p-1',
          name: 'Party 1',
          openingBalance: 100,
          currentBalance: 250.75,
        },
        'party'
      );

      expect(party.paiseSchema).toBe(PAISE_SCHEMA_VERSION);
      expect(readPaiseOr(party, 'currentBalance')).toBe(25075);
      expect(readPaiseOr(party, 'openingBalance')).toBe(10000);

      const explicitDoc = {
        amount: -500,
        amountPaise: -50000,
        paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(explicitDoc, 'amount')).toBe(-50000);

      const zeroDoc = {
        balance: 0,
        balancePaise: 0,
        paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(zeroDoc, 'balance')).toBe(0);
    });

    // 3. Returns the rupee-derived paise when the twin is tampered (e.g. grandTotal: 1171, grandTotalPaise: 9999) — rupee wins, no throw.
    it('returns rupee-derived paise when twin is tampered — rupee wins, no throw', () => {
      const tamperedInvoice = {
        grandTotal: 1171,
        grandTotalPaise: 9999,
        paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(tamperedInvoice, 'grandTotal')).toBe(117100);

      const tamperedParty = {
        currentBalance: 500,
        currentBalancePaise: 12345,
        paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(tamperedParty, 'currentBalance')).toBe(50000);

      const tamperedLoan = {
        currentPrincipalOutstanding: 10000,
        currentPrincipalOutstandingPaise: 0,
        paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(tamperedLoan, 'currentPrincipalOutstanding')).toBe(1000000);
    });

    // 4. Returns the rupee-derived paise when the twin is non-integer (1171.5), NaN, or missing entirely.
    it('returns rupee-derived paise when twin is non-integer, NaN, or missing entirely', () => {
      const nonIntegerTwin = {
        grandTotal: 1171,
        grandTotalPaise: 1171.5,
        paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(nonIntegerTwin, 'grandTotal')).toBe(117100);

      const nanTwin = {
        grandTotal: 1171,
        grandTotalPaise: NaN,
        paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(nanTwin, 'grandTotal')).toBe(117100);

      const infinityTwin = {
        grandTotal: 1171,
        grandTotalPaise: Infinity,
        paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(infinityTwin, 'grandTotal')).toBe(117100);

      const missingTwin = {
        grandTotal: 1171,
        paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(missingTwin, 'grandTotal')).toBe(117100);

      const stringTwin = {
        grandTotal: 1171,
        grandTotalPaise: '117100' as unknown as number,
        paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(stringTwin, 'grandTotal')).toBe(117100);
    });

    // 5. Returns fallbackPaise for null, undefined, non-object input, and a missing/non-finite rupee field.
    it('returns fallbackPaise for null, undefined, non-object input, and missing/non-finite rupee field', () => {
      expect(readPaiseOr(null, 'amount')).toBe(0);
      expect(readPaiseOr(null, 'amount', 500)).toBe(500);
      expect(readPaiseOr(undefined, 'amount')).toBe(0);
      expect(readPaiseOr(undefined, 'amount', 42)).toBe(42);

      // Non-object primitives
      expect(readPaiseOr('string' as unknown as object, 'amount')).toBe(0);
      expect(readPaiseOr('string' as unknown as object, 'amount', 99)).toBe(99);
      expect(readPaiseOr(12345 as unknown as object, 'amount', 88)).toBe(88);
      expect(readPaiseOr(true as unknown as object, 'amount', 77)).toBe(77);

      // Missing rupee field
      expect(readPaiseOr({}, 'amount')).toBe(0);
      expect(readPaiseOr({}, 'amount', 66)).toBe(66);

      // Non-finite or non-number rupee field
      expect(readPaiseOr({ amount: NaN }, 'amount')).toBe(0);
      expect(readPaiseOr({ amount: NaN }, 'amount', 55)).toBe(55);
      expect(readPaiseOr({ amount: Infinity }, 'amount', 44)).toBe(44);
      expect(readPaiseOr({ amount: -Infinity }, 'amount', 33)).toBe(33);
      expect(readPaiseOr({ amount: '100' as unknown as number }, 'amount', 22)).toBe(22);
      expect(readPaiseOr({ amount: null as unknown as number }, 'amount', 11)).toBe(11);
      expect(readPaiseOr({ amount: undefined }, 'amount', 10)).toBe(10);
    });

    // 8. readPaiseOr never mutates the input document (JSON.stringify before/after).
    it('never mutates the input document', () => {
      const docWithTwins = {
        id: 'doc-1',
        currentBalance: 150.25,
        currentBalancePaise: 15025,
        paiseSchema: 1,
        nested: { key: 'value' },
      };
      const beforeWithTwins = JSON.stringify(docWithTwins);
      readPaiseOr(docWithTwins, 'currentBalance');
      readPaiseOr(docWithTwins, 'nonExistent');
      readPaiseOr(docWithTwins, 'nested');
      const afterWithTwins = JSON.stringify(docWithTwins);
      expect(afterWithTwins).toBe(beforeWithTwins);

      const rawDoc = {
        id: 'raw-1',
        balanceAmount: 200,
        items: [{ id: 1, name: 'A' }],
      };
      const beforeRaw = JSON.stringify(rawDoc);
      readPaiseOr(rawDoc, 'balanceAmount');
      readPaiseOr(rawDoc, 'missingField', 100);
      const afterRaw = JSON.stringify(rawDoc);
      expect(afterRaw).toBe(beforeRaw);
    });
  });

  describe('report boundaries adoption', () => {
    // 6. computePartyDues yields identical totals for the same parties with and without twins,
    // and still yields the correct total when one twin is tampered.
    it('computePartyDues yields identical totals with/without twins and survives tampered twins', () => {
      const rawParties: Party[] = [
        {
          id: 'C-1',
          name: 'Customer 1',
          type: 'CUSTOMER',
          phone: '',
          stateCode: '27',
          billingAddress: '',
          currentBalance: 5000.75,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'C-2',
          name: 'Customer 2 Credit',
          type: 'CUSTOMER',
          phone: '',
          stateCode: '27',
          billingAddress: '',
          currentBalance: -1200.5,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'S-1',
          name: 'Supplier 1 Payable',
          type: 'SUPPLIER',
          phone: '',
          stateCode: '27',
          billingAddress: '',
          currentBalance: -3500.25,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'S-2',
          name: 'Supplier 2 Advance',
          type: 'SUPPLIER',
          phone: '',
          stateCode: '27',
          billingAddress: '',
          currentBalance: 400.0,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ];

      const rawSummary = computePartyDues(rawParties);
      expect(rawSummary.totalReceivables).toBe(5000.75);
      expect(rawSummary.totalPayables).toBe(3500.25);

      // Attached parties
      const attachedParties = rawParties.map((p) => attachPaiseFields(p, 'party'));
      const attachedSummary = computePartyDues(attachedParties);
      expect(attachedSummary.totalReceivables).toBe(rawSummary.totalReceivables);
      expect(attachedSummary.totalPayables).toBe(rawSummary.totalPayables);

      // Tampered party twin (rupee must win)
      const tamperedParties = attachedParties.map((p) => {
        if (p.id === 'C-1') {
          return { ...p, currentBalancePaise: 9999999 };
        }
        if (p.id === 'S-1') {
          return { ...p, currentBalancePaise: -1111111 };
        }
        return p;
      });
      const tamperedSummary = computePartyDues(tamperedParties);
      expect(tamperedSummary.totalReceivables).toBe(rawSummary.totalReceivables);
      expect(tamperedSummary.totalPayables).toBe(rawSummary.totalPayables);
    });

    // 7. computeBalanceSheetSummary yields byte-identical output for the same fixture
    // with and without twins, and is unchanged when a party/invoice/loan twin is tampered.
    it('computeBalanceSheetSummary yields byte-identical output with/without twins and with tampered twins', () => {
      const accounts: BankAccount[] = [
        {
          id: 'acc-1',
          accountName: 'HDFC Current',
          accountNumber: '1234567890',
          ifscCode: 'HDFC0001',
          accountType: 'BANK',
          openingBalance: 100000,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ];

      const invoices: Invoice[] = [
        {
          id: 'inv-1',
          invoiceNumber: 'INV-2026-001',
          invoiceType: 'B2B',
          date: '2026-04-10',
          partyId: 'cust-1',
          partyName: 'Customer 1',
          partyAddress: '',
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [],
          totalGrossAmount: 10000,
          totalDiscount: 0,
          totalTaxableAmount: 10000,
          totalCgst: 900,
          totalSgst: 900,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 1800,
          roundOff: 0,
          grandTotal: 11800,
          amountInWords: 'Eleven Thousand Eight Hundred Only',
          paymentMode: 'SPLIT',
          paymentStatus: 'PARTIAL',
          paidAmount: 5000,
          balanceAmount: 6800,
          paymentSplits: [],
          isCancelled: false,
          createdAt: '2026-04-10',
          updatedAt: '2026-04-10',
        },
      ];

      const purchases: PurchaseBill[] = [
        {
          id: 'pur-1',
          billNumber: 'PUR-2026-001',
          purchaseType: 'BILL',
          date: '2026-04-05',
          supplierId: 'supp-1',
          supplierName: 'Supplier 1',
          supplierAddress: '',
          supplierStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [],
          itcEligibility: 'ALL_OTHER_ITC',
          isRcm: false,
          totalGrossAmount: 5000,
          totalDiscount: 0,
          totalTaxableAmount: 5000,
          totalCgst: 450,
          totalSgst: 450,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 900,
          roundOff: 0,
          grandTotal: 5900,
          paymentMode: 'SPLIT',
          paymentStatus: 'PARTIAL',
          paidAmount: 2000,
          balanceAmount: 3900,
          paymentSplits: [],
          isCancelled: false,
          createdAt: '2026-04-05',
          updatedAt: '2026-04-05',
        },
      ];

      const items: InventoryItem[] = [
        {
          id: 'item-1',
          name: 'Item A',
          sku: 'ITM-A',
          category: 'General',
          unit: 'PCS',
          salePrice: 150,
          purchasePrice: 100,
          currentStock: 50,
          minStockAlert: 5,
          hsnSacCode: '8471',
          gstRate: 18,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ];

      const parties: Party[] = [
        {
          id: 'cust-1',
          name: 'Customer 1',
          type: 'CUSTOMER',
          phone: '',
          stateCode: '27',
          billingAddress: '',
          currentBalance: 6800,
          createdAt: '2026-04-01',
          updatedAt: '2026-04-01',
        },
        {
          id: 'supp-1',
          name: 'Supplier 1',
          type: 'SUPPLIER',
          phone: '',
          stateCode: '27',
          billingAddress: '',
          currentBalance: -3900,
          createdAt: '2026-04-01',
          updatedAt: '2026-04-01',
        },
      ];

      const loans: LoanAccount[] = [
        {
          id: 'loan-1',
          lenderName: 'SBI Bank',
          loanType: 'TERM_LOAN',
          sanctionAmount: 500000,
          interestRateAnnual: 9.5,
          tenorMonths: 36,
          emiAmount: 16000,
          currentPrincipalOutstanding: 350000,
          disbursedDate: '2025-01-01',
          status: 'ACTIVE',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
      ];

      const baseParams = {
        asOfDate: '2026-04-30',
        accounts,
        transactions: [],
        invoices,
        purchases,
        expenses: [],
        items,
        parties,
        loans,
      };

      // Raw baseline
      const rawResult = computeBalanceSheetSummary(baseParams);
      const rawJson = JSON.stringify(rawResult);

      // Attached with valid twins
      const attachedParties = parties.map((p) => attachPaiseFields(p, 'party'));
      const attachedInvoices = invoices.map((inv) => attachPaiseFields(inv, 'invoice'));
      const attachedPurchases = purchases.map((pur) => attachPaiseFields(pur, 'purchase'));
      const attachedLoans = loans.map((l) => attachPaiseFields(l, 'loan'));

      const attachedResult = computeBalanceSheetSummary({
        ...baseParams,
        parties: attachedParties,
        invoices: attachedInvoices,
        purchases: attachedPurchases,
        loans: attachedLoans,
      });
      expect(JSON.stringify(attachedResult)).toBe(rawJson);

      // Tampered party, invoice, purchase, loan twins
      const tamperedParties = attachedParties.map((p) => ({
        ...p,
        currentBalancePaise: 99999999,
      }));
      const tamperedInvoices = attachedInvoices.map((inv) => ({
        ...inv,
        balanceAmountPaise: 88888888,
      }));
      const tamperedPurchases = attachedPurchases.map((pur) => ({
        ...pur,
        balanceAmountPaise: 77777777,
      }));
      const tamperedLoans = attachedLoans.map((l) => ({
        ...l,
        currentPrincipalOutstandingPaise: 66666666,
      }));

      const tamperedResult = computeBalanceSheetSummary({
        ...baseParams,
        parties: tamperedParties,
        invoices: tamperedInvoices,
        purchases: tamperedPurchases,
        loans: tamperedLoans,
      });
      expect(JSON.stringify(tamperedResult)).toBe(rawJson);

      // Also verify invoice and purchase fallback paths when parties are empty
      const rawFallback = computeBalanceSheetSummary({
        ...baseParams,
        parties: [],
      });
      const rawFallbackJson = JSON.stringify(rawFallback);

      const attachedFallback = computeBalanceSheetSummary({
        ...baseParams,
        parties: [],
        invoices: attachedInvoices,
        purchases: attachedPurchases,
        loans: attachedLoans,
      });
      expect(JSON.stringify(attachedFallback)).toBe(rawFallbackJson);

      const tamperedFallback = computeBalanceSheetSummary({
        ...baseParams,
        parties: [],
        invoices: tamperedInvoices,
        purchases: tamperedPurchases,
        loans: tamperedLoans,
      });
      expect(JSON.stringify(tamperedFallback)).toBe(rawFallbackJson);
    });
  });

  describe('Phase 3.2 Step 4 calculators adoption parity', () => {
    // 1. aging.ts: computeAgingBreakdown
    it('computeAgingBreakdown yields identical breakdown with/without twins and survives tampered twins', () => {
      const rawItems: AgingItemInput[] = [
        { partyId: 'p-1', partyName: 'Customer 1', date: '2026-04-01', balanceDue: 1500.5 },
        { partyId: 'p-2', partyName: 'Customer 2', date: '2026-03-01', balanceDue: 2500 },
        { partyId: 'p-3', partyName: 'Customer 3', date: '2026-01-01', balanceDue: 3500.75 },
      ];
      const asOf = new Date('2026-04-30T00:00:00Z');
      const rawRes = computeAgingBreakdown(rawItems, asOf);

      const attachedItems = rawItems.map((item) => ({
        ...item,
        balanceDuePaise: Math.round(item.balanceDue * 100),
        paiseSchema: PAISE_SCHEMA_VERSION,
      }));
      const attachedRes = computeAgingBreakdown(attachedItems, asOf);
      expect(attachedRes).toEqual(rawRes);

      const tamperedItems = attachedItems.map((item) => ({
        ...item,
        balanceDuePaise: 9999999,
      }));
      const tamperedRes = computeAgingBreakdown(tamperedItems, asOf);
      expect(tamperedRes).toEqual(rawRes);

      // 1-paise divergence test: balanceDuePaise disagrees with toPaise(balanceDue) by 1 paise
      const onePaiseOffItems = attachedItems.map((item) => ({
        ...item,
        balanceDuePaise: (item.balanceDuePaise ?? Math.round(item.balanceDue * 100)) + 1,
      }));
      const onePaiseOffRes = computeAgingBreakdown(onePaiseOffItems, asOf);
      expect(onePaiseOffRes).toEqual(rawRes);
    });

    // 2. paymentAllocation.ts: getOutstandingDocuments, applyAllocations, reverseAllocations, validatePreSave
    it('paymentAllocation yields identical outputs with/without twins and survives tampered twins', () => {
      const rawParty: Party = {
        id: 'cust-1',
        name: 'Customer 1',
        type: 'CUSTOMER',
        phone: '9876543210',
        billingAddress: '',
        currentBalance: 680,
        openingBalance: 100,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        stateCode: '27',
        createdAt: '2026-04-01',
        updatedAt: '2026-04-01',
      };
      const rawInvoice: Invoice = {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        invoiceType: 'B2B',
        date: '2026-04-10',
        partyId: 'cust-1',
        partyName: 'Customer 1',
        partyAddress: '',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 1000,
        totalDiscount: 0,
        totalTaxableAmount: 1000,
        totalCgst: 90,
        totalSgst: 90,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 180,
        roundOff: 0,
        grandTotal: 1180,
        amountInWords: '',
        paymentMode: 'CASH',
        paymentStatus: 'PARTIAL',
        paidAmount: 500,
        balanceAmount: 680,
        paymentSplits: [],
        isCancelled: false,
        createdAt: '2026-04-10',
        updatedAt: '2026-04-10',
      };
      const rawPurchase: PurchaseBill = {
        id: 'pur-1',
        billNumber: 'PUR-001',
        purchaseType: 'BILL',
        date: '2026-04-05',
        supplierId: 'supp-1',
        supplierName: 'Supplier 1',
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 500,
        totalDiscount: 0,
        totalTaxableAmount: 500,
        totalCgst: 45,
        totalSgst: 45,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 90,
        roundOff: 0,
        grandTotal: 590,
        paymentMode: 'CASH',
        paymentStatus: 'PARTIAL',
        paidAmount: 200,
        balanceAmount: 390,
        paymentSplits: [],
        isCancelled: false,
        createdAt: '2026-04-05',
        updatedAt: '2026-04-05',
      };

      // getOutstandingDocuments
      const rawOutCust = getOutstandingDocuments({
        partyId: 'cust-1',
        documentType: 'INVOICE',
        invoices: [rawInvoice],
        parties: [rawParty],
      });
      const rawOutSupp = getOutstandingDocuments({
        partyId: 'supp-1',
        documentType: 'PURCHASE',
        purchases: [rawPurchase],
      });

      const attachedParty = attachPaiseFields(rawParty, 'party');
      const attachedInv = attachPaiseFields(rawInvoice, 'invoice');
      const attachedPur = attachPaiseFields(rawPurchase, 'purchase');

      const attachedOutCust = getOutstandingDocuments({
        partyId: 'cust-1',
        documentType: 'INVOICE',
        invoices: [attachedInv],
        parties: [attachedParty],
      });
      const attachedOutSupp = getOutstandingDocuments({
        partyId: 'supp-1',
        documentType: 'PURCHASE',
        purchases: [attachedPur],
      });
      const stripDocRefs = (docs: ReturnType<typeof getOutstandingDocuments>) =>
        docs.map((d) => ({ ...d, rawInvoice: undefined, rawPurchase: undefined }));

      expect(stripDocRefs(attachedOutCust)).toEqual(stripDocRefs(rawOutCust));
      expect(stripDocRefs(attachedOutSupp)).toEqual(stripDocRefs(rawOutSupp));

      const tamperedParty: Party = {
        ...attachedParty,
        openingBalancePaise: 9999999,
        currentBalancePaise: 8888888,
      } as unknown as Party;
      const tamperedInv: Invoice = {
        ...attachedInv,
        grandTotalPaise: 9999999,
        balanceAmountPaise: 8888888,
        paidAmountPaise: 7777777,
      } as unknown as Invoice;
      const tamperedPur: PurchaseBill = {
        ...attachedPur,
        grandTotalPaise: 9999999,
        balanceAmountPaise: 8888888,
        paidAmountPaise: 7777777,
      } as unknown as PurchaseBill;

      const tamperedOutCust = getOutstandingDocuments({
        partyId: 'cust-1',
        documentType: 'INVOICE',
        invoices: [tamperedInv],
        parties: [tamperedParty],
      });
      const tamperedOutSupp = getOutstandingDocuments({
        partyId: 'supp-1',
        documentType: 'PURCHASE',
        purchases: [tamperedPur],
      });
      expect(stripDocRefs(tamperedOutCust)).toEqual(stripDocRefs(rawOutCust));
      expect(stripDocRefs(tamperedOutSupp)).toEqual(stripDocRefs(rawOutSupp));

      // applyAllocations & reverseAllocations
      const allocs = [{ documentId: 'inv-1', documentNumber: 'INV-001', documentType: 'INVOICE' as const, amount: 200 }];
      const rawApplied = applyAllocations([rawInvoice], allocs);
      const attachedApplied = applyAllocations([attachedInv], allocs);
      const tamperedApplied = applyAllocations([tamperedInv], allocs);
      expect(attachedApplied[0].paidAmount).toBe(rawApplied[0].paidAmount);
      expect(attachedApplied[0].balanceAmount).toBe(rawApplied[0].balanceAmount);
      expect(attachedApplied[0].paymentStatus).toBe(rawApplied[0].paymentStatus);
      expect(attachedApplied[0].paymentMode).toBe(rawApplied[0].paymentMode);
      expect(tamperedApplied[0].paidAmount).toBe(rawApplied[0].paidAmount);
      expect(tamperedApplied[0].balanceAmount).toBe(rawApplied[0].balanceAmount);
      expect(tamperedApplied[0].paymentStatus).toBe(rawApplied[0].paymentStatus);
      expect(tamperedApplied[0].paymentMode).toBe(rawApplied[0].paymentMode);

      const rawReversed = reverseAllocations(rawApplied, allocs);
      const attachedReversed = reverseAllocations(attachedApplied, allocs);
      const tamperedReversed = reverseAllocations(tamperedApplied, allocs);
      expect(attachedReversed[0].paidAmount).toBe(rawReversed[0].paidAmount);
      expect(attachedReversed[0].balanceAmount).toBe(rawReversed[0].balanceAmount);
      expect(attachedReversed[0].paymentStatus).toBe(rawReversed[0].paymentStatus);
      expect(tamperedReversed[0].paidAmount).toBe(rawReversed[0].paidAmount);
      expect(tamperedReversed[0].balanceAmount).toBe(rawReversed[0].balanceAmount);
      expect(tamperedReversed[0].paymentStatus).toBe(rawReversed[0].paymentStatus);

      // validateInvoicePreSave & validatePurchasePreSave
      const rawValInv = validateInvoicePreSave({ newInvoice: rawInvoice, existingInvoices: [rawInvoice], vouchers: [] });
      const attachedValInv = validateInvoicePreSave({ newInvoice: attachedInv, existingInvoices: [attachedInv], vouchers: [] });
      const tamperedValInv = validateInvoicePreSave({ newInvoice: tamperedInv, existingInvoices: [tamperedInv], vouchers: [] });
      expect(attachedValInv).toEqual(rawValInv);
      expect(tamperedValInv).toEqual(rawValInv);

      const rawValPur = validatePurchasePreSave({ newBill: rawPurchase, existingPurchases: [rawPurchase], vouchers: [] });
      const attachedValPur = validatePurchasePreSave({ newBill: attachedPur, existingPurchases: [attachedPur], vouchers: [] });
      const tamperedValPur = validatePurchasePreSave({ newBill: tamperedPur, existingPurchases: [tamperedPur], vouchers: [] });
      expect(attachedValPur).toEqual(rawValPur);
      expect(tamperedValPur).toEqual(rawValPur);
    });

    // 3. paymentSplitUtils.ts: parseSplitsFromInvoice, parseSplitsFromPurchase, derivePaymentSettlement
    it('paymentSplitUtils yields identical splits and settlements with/without twins and survives tampered twins', () => {
      const rawInvoice: Invoice = {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        invoiceType: 'B2B',
        date: '2026-04-10',
        partyId: 'cust-1',
        partyName: 'Customer 1',
        partyAddress: '',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 1000,
        totalDiscount: 0,
        totalTaxableAmount: 1000,
        totalCgst: 90,
        totalSgst: 90,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 180,
        roundOff: 0,
        grandTotal: 1180,
        amountInWords: '',
        paymentMode: 'CASH',
        paymentStatus: 'PARTIAL',
        paidAmount: 500,
        balanceAmount: 680,
        paymentSplits: [],
        isCancelled: false,
        createdAt: '2026-04-10',
        updatedAt: '2026-04-10',
      };
      const rawPurchase: PurchaseBill = {
        id: 'pur-1',
        billNumber: 'PUR-001',
        purchaseType: 'BILL',
        date: '2026-04-05',
        supplierId: 'supp-1',
        supplierName: 'Supplier 1',
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 500,
        totalDiscount: 0,
        totalTaxableAmount: 500,
        totalCgst: 45,
        totalSgst: 45,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 90,
        roundOff: 0,
        grandTotal: 590,
        paymentMode: 'CASH',
        paymentStatus: 'PARTIAL',
        paidAmount: 200,
        balanceAmount: 390,
        paymentSplits: [],
        isCancelled: false,
        createdAt: '2026-04-05',
        updatedAt: '2026-04-05',
      };

      const rawSplitInv = parseSplitsFromInvoice(rawInvoice, 1180);
      const attachedInv = attachPaiseFields(rawInvoice, 'invoice');
      const attachedSplitInv = parseSplitsFromInvoice(attachedInv, 1180);
      expect(attachedSplitInv).toEqual(rawSplitInv);

      const tamperedInv: Invoice = {
        ...attachedInv,
        grandTotalPaise: 9999999,
        balanceAmountPaise: 8888888,
        paidAmountPaise: 7777777,
      } as unknown as Invoice;
      const tamperedSplitInv = parseSplitsFromInvoice(tamperedInv, 1180);
      expect(tamperedSplitInv).toEqual(rawSplitInv);

      const rawSplitPur = parseSplitsFromPurchase(rawPurchase, 590);
      const attachedPur = attachPaiseFields(rawPurchase, 'purchase');
      const attachedSplitPur = parseSplitsFromPurchase(attachedPur, 590);
      expect(attachedSplitPur).toEqual(rawSplitPur);

      const tamperedPur: PurchaseBill = {
        ...attachedPur,
        grandTotalPaise: 9999999,
        balanceAmountPaise: 8888888,
        paidAmountPaise: 7777777,
      } as unknown as PurchaseBill;
      const tamperedSplitPur = parseSplitsFromPurchase(tamperedPur, 590);
      expect(tamperedSplitPur).toEqual(rawSplitPur);

      const stripSplitIds = (settlement: ReturnType<typeof derivePaymentSettlement>) => ({
        ...settlement,
        paymentSplits: settlement.paymentSplits?.map((s) => ({ ...s, id: '' })),
      });
      const rawSettlement = derivePaymentSettlement(rawInvoice);
      const attachedSettlement = derivePaymentSettlement(attachedInv);
      expect(stripSplitIds(attachedSettlement)).toEqual(stripSplitIds(rawSettlement));

      const tamperedSettlement = derivePaymentSettlement(tamperedInv);
      expect(stripSplitIds(tamperedSettlement)).toEqual(stripSplitIds(rawSettlement));
    });

    // 4. cashBankCalculator.ts: computeCashBankSummary
    it('computeCashBankSummary yields identical financial summary with/without twins and survives tampered twins', () => {
      const rawAccount: BankAccount = {
        id: 'acc-1',
        accountName: 'HDFC Current',
        accountNumber: '1234567890',
        ifscCode: 'HDFC0001',
        accountType: 'BANK',
        openingBalance: 10000,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };
      const rawInvoice: Invoice = {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        invoiceType: 'B2B',
        date: '2026-04-10',
        partyId: 'cust-1',
        partyName: 'Customer 1',
        partyAddress: '',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 1000,
        totalDiscount: 0,
        totalTaxableAmount: 1000,
        totalCgst: 90,
        totalSgst: 90,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 180,
        roundOff: 0,
        grandTotal: 1180,
        amountInWords: '',
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 1180,
        balanceAmount: 0,
        paymentSplits: [],
        isCancelled: false,
        createdAt: '2026-04-10',
        updatedAt: '2026-04-10',
      };
      const rawPurchase: PurchaseBill = {
        id: 'pur-1',
        billNumber: 'PUR-001',
        purchaseType: 'BILL',
        date: '2026-04-05',
        supplierId: 'supp-1',
        supplierName: 'Supplier 1',
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 500,
        totalDiscount: 0,
        totalTaxableAmount: 500,
        totalCgst: 45,
        totalSgst: 45,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 90,
        roundOff: 0,
        grandTotal: 590,
        paymentMode: 'BANK',
        paymentStatus: 'PAID',
        paidAmount: 590,
        balanceAmount: 0,
        bankAccountId: 'acc-1',
        paymentSplits: [],
        isCancelled: false,
        createdAt: '2026-04-05',
        updatedAt: '2026-04-05',
      };
      const rawExpense: Expense = {
        id: 'exp-1',
        voucherNumber: 'EXP-001',
        date: '2026-04-10',
        title: 'Office Cleaning',
        category: 'Repairs & Maintenance',
        amount: 300,
        taxableAmount: 300,
        gstRate: 0,
        taxAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        itcEligible: false,
        paymentMode: 'CASH',
        createdAt: '2026-04-10',
      };
      const rawTxn: CashBankTransaction = {
        id: 'txn-1',
        txnNumber: 'TXN-001',
        date: '2026-04-10',
        type: 'DEPOSIT',
        amount: 500,
        description: 'Deposit',
        fromAccountId: 'ACC_CASH',
        toAccountId: 'acc-1',
        createdAt: '2026-04-10',
      };
      const rawVoucher: Voucher = {
        id: 'vch-1',
        voucherNumber: 'VCH-001',
        voucherType: 'RECEIPT',
        narration: 'Customer receipt',
        date: '2026-04-10',
        totalAmount: 1000,
        entries: [
          { accountId: 'acc-1', accountName: 'HDFC', debit: 1000, credit: 0 },
          { accountId: 'cust-1', accountName: 'Customer', debit: 0, credit: 1000 },
        ],
        isCancelled: false,
        isReversed: false,
        createdAt: '2026-04-10',
      };

      const cbParams = {
        accounts: [rawAccount],
        invoices: [rawInvoice],
        purchases: [rawPurchase],
        expenses: [rawExpense],
        vouchers: [rawVoucher],
        transactions: [rawTxn],
      };

      const rawCbResult = computeCashBankSummary(cbParams);

      const attachedAccount = attachPaiseFields(rawAccount, 'bankAccount');
      const attachedInv = attachPaiseFields(rawInvoice, 'invoice');
      const attachedPur = attachPaiseFields(rawPurchase, 'purchase');
      const attachedExpense = attachPaiseFields(rawExpense, 'expense');
      const attachedTxn = attachPaiseFields(rawTxn, 'cashBankTxn');
      const attachedVoucher = attachPaiseFields(rawVoucher, 'voucher');

      const attachedCbResult = computeCashBankSummary({
        accounts: [attachedAccount],
        invoices: [attachedInv],
        purchases: [attachedPur],
        expenses: [attachedExpense],
        vouchers: [attachedVoucher],
        transactions: [attachedTxn],
      });
      expect(attachedCbResult).toEqual(rawCbResult);

      const tamperedAccount = { ...attachedAccount, openingBalancePaise: 9999999 } as unknown as BankAccount;
      const tamperedInv = { ...attachedInv, paidAmountPaise: 9999999, grandTotalPaise: 9999999 } as unknown as Invoice;
      const tamperedPur = { ...attachedPur, paidAmountPaise: 9999999, grandTotalPaise: 9999999 } as unknown as PurchaseBill;
      const tamperedExpense = { ...attachedExpense, amountPaise: 9999999 } as unknown as Expense;
      const tamperedTxn = { ...attachedTxn, amountPaise: 9999999 } as unknown as CashBankTransaction;
      const tamperedVoucher = {
        ...attachedVoucher,
        totalAmountPaise: 9999999,
        entries: attachedVoucher.entries.map((e) => ({ ...e, debitPaise: 9999999, creditPaise: 9999999 })),
      } as unknown as Voucher;

      const tamperedCbResult = computeCashBankSummary({
        accounts: [tamperedAccount],
        invoices: [tamperedInv],
        purchases: [tamperedPur],
        expenses: [tamperedExpense],
        vouchers: [tamperedVoucher],
        transactions: [tamperedTxn],
      });
      expect(tamperedCbResult).toEqual(rawCbResult);
    });

    // 5. cashBankReconciliation.ts: buildCashBankReconciliation
    it('buildCashBankReconciliation yields identical report with/without twins and survives tampered twins', () => {
      const rawAccount: BankAccount = {
        id: 'acc-1',
        accountName: 'HDFC Current',
        accountNumber: '1234567890',
        ifscCode: 'HDFC0001',
        accountType: 'BANK',
        openingBalance: 10000,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };
      const summary = {
        totalLiquidBalance: 15000,
        totalCashBalance: 5000,
        totalBankBalance: 10000,
        accountBalances: { 'acc-1': 10000, 'ACC_CASH': 5000 },
        ledgerEntries: [
          {
            id: 'LED-1',
            date: '2026-04-10',
            type: 'SALE' as const,
            category: 'CASH' as const,
            accountId: 'ACC_CASH',
            accountName: 'Cash',
            counterpartyOrTitle: 'Customer',
            mode: 'CASH',
            flow: 'IN' as const,
            amount: 5000,
            description: 'Sale',
          },
        ],
      };

      const rawRecon = buildCashBankReconciliation({
        accounts: [rawAccount],
        summary,
      });

      const attachedAccount = attachPaiseFields(rawAccount, 'bankAccount');
      const attachedRecon = buildCashBankReconciliation({
        accounts: [attachedAccount],
        summary,
      });
      expect({ ...attachedRecon, generatedAt: '' }).toEqual({ ...rawRecon, generatedAt: '' });

      const tamperedAccount = { ...attachedAccount, openingBalancePaise: 9999999 } as unknown as BankAccount;
      const tamperedRecon = buildCashBankReconciliation({
        accounts: [tamperedAccount],
        summary,
      });
      expect({ ...tamperedRecon, generatedAt: '' }).toEqual({ ...rawRecon, generatedAt: '' });
    });

    // 6. cashFlowCalculator.ts: computeCashFlowStatement
    it('computeCashFlowStatement yields identical statement with/without twins and survives tampered twins', () => {
      const rawAccount: BankAccount = {
        id: 'acc-1',
        accountName: 'HDFC Current',
        accountNumber: '1234567890',
        ifscCode: 'HDFC0001',
        accountType: 'BANK',
        openingBalance: 10000,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };
      const rawInvoice: Invoice = {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        invoiceType: 'B2B',
        date: '2026-04-10',
        partyId: 'cust-1',
        partyName: 'Customer 1',
        partyAddress: '',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 1000,
        totalDiscount: 0,
        totalTaxableAmount: 1000,
        totalCgst: 90,
        totalSgst: 90,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 180,
        roundOff: 0,
        grandTotal: 1180,
        amountInWords: '',
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 1180,
        balanceAmount: 0,
        paymentSplits: [],
        isCancelled: false,
        createdAt: '2026-04-10',
        updatedAt: '2026-04-10',
      };
      const rawPurchase: PurchaseBill = {
        id: 'pur-1',
        billNumber: 'PUR-001',
        purchaseType: 'BILL',
        date: '2026-04-05',
        supplierId: 'supp-1',
        supplierName: 'Supplier 1',
        supplierAddress: '',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        totalGrossAmount: 500,
        totalDiscount: 0,
        totalTaxableAmount: 500,
        totalCgst: 45,
        totalSgst: 45,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 90,
        roundOff: 0,
        grandTotal: 590,
        paymentMode: 'BANK',
        paymentStatus: 'PAID',
        paidAmount: 590,
        balanceAmount: 0,
        bankAccountId: 'acc-1',
        paymentSplits: [],
        isCancelled: false,
        createdAt: '2026-04-05',
        updatedAt: '2026-04-05',
      };
      const rawExpense: Expense = {
        id: 'exp-1',
        voucherNumber: 'EXP-001',
        date: '2026-04-10',
        title: 'Office Cleaning',
        category: 'Repairs & Maintenance',
        amount: 300,
        taxableAmount: 300,
        gstRate: 0,
        taxAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        itcEligible: false,
        paymentMode: 'CASH',
        createdAt: '2026-04-10',
      };
      const rawTxn: CashBankTransaction = {
        id: 'txn-1',
        txnNumber: 'TXN-001',
        date: '2026-04-10',
        type: 'ADD_MONEY',
        amount: 2000,
        description: 'Add Capital',
        toAccountId: 'acc-1',
        createdAt: '2026-04-10',
      };
      const rawLoanTxn: LoanTransaction = {
        id: 'ltxn-1',
        loanId: 'loan-1',
        date: '2026-04-10',
        type: 'DISBURSEMENT',
        principalPaid: 0,
        interestPaid: 0,
        chargesPaid: 0,
        totalAmount: 50000,
        remainingPrincipal: 50000,
        paymentMode: 'BANK',
        createdAt: '2026-04-10',
      };

      const cfParams = {
        accounts: [rawAccount],
        invoices: [rawInvoice],
        purchases: [rawPurchase],
        expenses: [rawExpense],
        transactions: [rawTxn],
        loanTransactions: [rawLoanTxn],
      };

      const rawCfResult = computeCashFlowStatement(cfParams);

      const attachedAccount = attachPaiseFields(rawAccount, 'bankAccount');
      const attachedInv = attachPaiseFields(rawInvoice, 'invoice');
      const attachedPur = attachPaiseFields(rawPurchase, 'purchase');
      const attachedExpense = attachPaiseFields(rawExpense, 'expense');
      const attachedTxn = attachPaiseFields(rawTxn, 'cashBankTxn');
      const attachedLoanTxn = attachPaiseFields(rawLoanTxn, 'loanTxn');

      const attachedCfResult = computeCashFlowStatement({
        accounts: [attachedAccount],
        invoices: [attachedInv],
        purchases: [attachedPur],
        expenses: [attachedExpense],
        transactions: [attachedTxn],
        loanTransactions: [attachedLoanTxn],
      });
      expect(attachedCfResult).toEqual(rawCfResult);

      const tamperedAccount = { ...attachedAccount, openingBalancePaise: 9999999 } as unknown as BankAccount;
      const tamperedInv = { ...attachedInv, paidAmountPaise: 9999999, grandTotalPaise: 9999999 } as unknown as Invoice;
      const tamperedPur = { ...attachedPur, paidAmountPaise: 9999999, grandTotalPaise: 9999999 } as unknown as PurchaseBill;
      const tamperedExpense = { ...attachedExpense, amountPaise: 9999999 } as unknown as Expense;
      const tamperedTxn = { ...attachedTxn, amountPaise: 9999999 } as unknown as CashBankTransaction;
      const tamperedLoanTxn = { ...attachedLoanTxn, totalAmountPaise: 9999999 } as unknown as LoanTransaction;

      const tamperedCfResult = computeCashFlowStatement({
        accounts: [tamperedAccount],
        invoices: [tamperedInv],
        purchases: [tamperedPur],
        expenses: [tamperedExpense],
        transactions: [tamperedTxn],
        loanTransactions: [tamperedLoanTxn],
      });
      expect(tamperedCfResult).toEqual(rawCfResult);

      // Sub-paise rupee test: exp.amount = 100.005, txn.amount = 250.004
      const subPaiseExpense: Expense = {
        ...rawExpense,
        id: 'exp-sub',
        amount: 100.005,
      };
      const subPaiseTxn: CashBankTransaction = {
        ...rawTxn,
        id: 'txn-sub',
        amount: 250.004,
      };
      const rawSubPaiseResult = computeCashFlowStatement({
        accounts: [rawAccount],
        invoices: [],
        purchases: [],
        expenses: [subPaiseExpense],
        transactions: [subPaiseTxn],
      });
      const attachedSubExpense = attachPaiseFields(subPaiseExpense, 'expense');
      const attachedSubTxn = attachPaiseFields(subPaiseTxn, 'cashBankTxn');
      const attachedSubResult = computeCashFlowStatement({
        accounts: [rawAccount],
        invoices: [],
        purchases: [],
        expenses: [attachedSubExpense],
        transactions: [attachedSubTxn],
      });
      expect(attachedSubResult).toEqual(rawSubPaiseResult);
      expect(JSON.stringify(attachedSubResult)).toBe(JSON.stringify(rawSubPaiseResult));
      const expItem = attachedSubResult.operatingActivities.items.find((i) => i.id === 'op-exp-exp-sub');
      const txnItem = attachedSubResult.financingActivities.items.find((i) => i.id === 'fin-in-txn-sub');
      expect(expItem?.amount).toBe(100.005);
      expect(txnItem?.amount).toBe(250.004);
    });

    // 7. ledger.ts: validateVoucherBalance
    it('validateVoucherBalance yields identical validation with/without twins and survives tampered twins', () => {
      const rawEntries = [
        { accountId: 'ACC_CASH', accountName: 'Cash', debit: 1180, credit: 0 },
        { accountId: 'ACC_SALES', accountName: 'Sales', debit: 0, credit: 1000 },
        { accountId: 'ACC_GST', accountName: 'GST Output', debit: 0, credit: 180 },
      ];
      const rawBal = validateVoucherBalance(rawEntries);
      expect(rawBal.isBalanced).toBe(true);
      expect(rawBal.diff).toBe(0);

      const attachedEntries = rawEntries.map((e) => ({
        ...e,
        debitPaise: Math.round(e.debit * 100),
        creditPaise: Math.round(e.credit * 100),
        paiseSchema: PAISE_SCHEMA_VERSION,
      }));
      const attachedBal = validateVoucherBalance(attachedEntries);
      expect(attachedBal).toEqual(rawBal);

      const tamperedEntries = attachedEntries.map((e) => ({
        ...e,
        debitPaise: 9999999,
        creditPaise: 8888888,
      }));
      const tamperedBal = validateVoucherBalance(tamperedEntries);
      expect(tamperedBal).toEqual(rawBal);
    });
  });
});
