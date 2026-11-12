import { describe, it, expect } from 'vitest';
import {
  readPaiseOr,
  attachPaiseFields,
  PAISE_SCHEMA_VERSION,
} from '../core/accounting/paisePersistence.ts';
import { computePartyDues } from '../core/accounting/partyDues.ts';
import { computeBalanceSheetSummary } from '../core/accounting/balanceSheetCalculator.ts';
import type { Party } from '../models/party.ts';
import type { Invoice } from '../models/invoice.ts';
import type { PurchaseBill } from '../models/purchase.ts';
import type { LoanAccount } from '../models/loan.ts';
import type { BankAccount } from '../models/bankAccount.ts';
import type { InventoryItem } from '../models/item.ts';

describe('paiseReadAdoption', () => {
  describe('readPaiseOr unit semantics', () => {
    // 1. readPaiseOr returns the rupee-derived paise when the doc has no __paiseSchema.
    it('returns rupee-derived paise when doc has no __paiseSchema', () => {
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

      expect(party.__paiseSchema).toBe(PAISE_SCHEMA_VERSION);
      expect(readPaiseOr(party, 'currentBalance')).toBe(25075);
      expect(readPaiseOr(party, 'openingBalance')).toBe(10000);

      const explicitDoc = {
        amount: -500,
        amountPaise: -50000,
        __paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(explicitDoc, 'amount')).toBe(-50000);

      const zeroDoc = {
        balance: 0,
        balancePaise: 0,
        __paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(zeroDoc, 'balance')).toBe(0);
    });

    // 3. Returns the rupee-derived paise when the twin is tampered (e.g. grandTotal: 1171, grandTotalPaise: 9999) — rupee wins, no throw.
    it('returns rupee-derived paise when twin is tampered — rupee wins, no throw', () => {
      const tamperedInvoice = {
        grandTotal: 1171,
        grandTotalPaise: 9999,
        __paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(tamperedInvoice, 'grandTotal')).toBe(117100);

      const tamperedParty = {
        currentBalance: 500,
        currentBalancePaise: 12345,
        __paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(tamperedParty, 'currentBalance')).toBe(50000);

      const tamperedLoan = {
        currentPrincipalOutstanding: 10000,
        currentPrincipalOutstandingPaise: 0,
        __paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(tamperedLoan, 'currentPrincipalOutstanding')).toBe(1000000);
    });

    // 4. Returns the rupee-derived paise when the twin is non-integer (1171.5), NaN, or missing entirely.
    it('returns rupee-derived paise when twin is non-integer, NaN, or missing entirely', () => {
      const nonIntegerTwin = {
        grandTotal: 1171,
        grandTotalPaise: 1171.5,
        __paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(nonIntegerTwin, 'grandTotal')).toBe(117100);

      const nanTwin = {
        grandTotal: 1171,
        grandTotalPaise: NaN,
        __paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(nanTwin, 'grandTotal')).toBe(117100);

      const infinityTwin = {
        grandTotal: 1171,
        grandTotalPaise: Infinity,
        __paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(infinityTwin, 'grandTotal')).toBe(117100);

      const missingTwin = {
        grandTotal: 1171,
        __paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readPaiseOr(missingTwin, 'grandTotal')).toBe(117100);

      const stringTwin = {
        grandTotal: 1171,
        grandTotalPaise: '117100' as unknown as number,
        __paiseSchema: PAISE_SCHEMA_VERSION,
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
        __paiseSchema: 1,
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
});
