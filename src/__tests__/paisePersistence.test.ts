import { describe, it, expect } from 'vitest';
import {
  attachPaiseFields,
  verifyPaiseFields,
  hasCurrentPaiseSchema,
  PAISE_SCHEMA_VERSION,
} from '../core/accounting/paisePersistence.ts';
import { toPaise } from '../core/money.ts';

describe('paisePersistence', () => {
  describe('attachPaiseFields', () => {
    it('attaches paise fields and schema metadata on invoice including nested items and splits', () => {
      const invoice = {
        id: 'inv-001',
        invoiceNumber: 'INV-2026-001',
        totalGrossAmount: 1000.5,
        totalDiscount: 50.25,
        totalTaxableAmount: 950.25,
        totalCgst: 85.52,
        totalSgst: 85.52,
        totalUtgst: 0,
        totalIgst: 0,
        totalCess: 10,
        totalTax: 181.04,
        roundOff: -0.29,
        shippingAmount: 100,
        grandTotal: 1231,
        paidAmount: 500,
        balanceAmount: 731,
        items: [
          {
            itemId: 'item-1',
            unitPrice: 100.5,
            discountAmount: 5,
            taxableAmount: 95.5,
            cgstAmount: 8.6,
            sgstAmount: 8.6,
            utgstAmount: 0,
            igstAmount: 0,
            cessAmount: 1,
            totalAmount: 113.7,
          },
        ],
        paymentSplits: [
          {
            id: 'split-1',
            mode: 'CASH',
            amount: 500,
          },
        ],
      };

      const attached = attachPaiseFields(invoice, 'invoice');

      expect(attached.paiseSchema).toBe(PAISE_SCHEMA_VERSION);
      expect(attached.paiseKind).toBe('invoice');
      expect(attached.totalGrossAmountPaise).toBe(toPaise(1000.5));
      expect(attached.totalDiscountPaise).toBe(toPaise(50.25));
      expect(attached.totalTaxableAmountPaise).toBe(toPaise(950.25));
      expect(attached.totalCgstPaise).toBe(toPaise(85.52));
      expect(attached.totalSgstPaise).toBe(toPaise(85.52));
      expect(attached.totalUtgstPaise).toBe(0);
      expect(attached.totalIgstPaise).toBe(0);
      expect(attached.totalCessPaise).toBe(1000);
      expect(attached.totalTaxPaise).toBe(toPaise(181.04));
      expect(attached.roundOffPaise).toBe(toPaise(-0.29));
      expect(attached.shippingAmountPaise).toBe(10000);
      expect(attached.grandTotalPaise).toBe(123100);
      expect(attached.paidAmountPaise).toBe(50000);
      expect(attached.balanceAmountPaise).toBe(73100);

      // Nested items
      expect(attached.items[0].unitPricePaise).toBe(toPaise(100.5));
      expect(attached.items[0].discountAmountPaise).toBe(500);
      expect(attached.items[0].taxableAmountPaise).toBe(toPaise(95.5));
      expect(attached.items[0].cgstAmountPaise).toBe(toPaise(8.6));
      expect(attached.items[0].sgstAmountPaise).toBe(toPaise(8.6));
      expect(attached.items[0].utgstAmountPaise).toBe(0);
      expect(attached.items[0].igstAmountPaise).toBe(0);
      expect(attached.items[0].cessAmountPaise).toBe(100);
      expect(attached.items[0].totalAmountPaise).toBe(toPaise(113.7));

      // Nested payment splits
      expect(attached.paymentSplits[0].amountPaise).toBe(50000);
    });

    it('attaches paise fields on purchase bill with items and splits', () => {
      const purchase = {
        id: 'pur-001',
        billNumber: 'BILL-100',
        totalGrossAmount: 500,
        grandTotal: 590,
        paidAmount: 590,
        balanceAmount: 0,
        items: [
          {
            itemId: 'raw-1',
            unitPrice: 50,
            taxableAmount: 500,
            cgstAmount: 45,
            sgstAmount: 45,
            cessAmount: 0,
            totalAmount: 590,
          },
        ],
        paymentSplits: [{ id: 'ps-1', amount: 590 }],
      };

      const attached = attachPaiseFields(purchase, 'purchase');
      expect(attached.paiseSchema).toBe(PAISE_SCHEMA_VERSION);
      expect(attached.paiseKind).toBe('purchase');
      expect(attached.totalGrossAmountPaise).toBe(50000);
      expect(attached.grandTotalPaise).toBe(59000);
      expect(attached.paidAmountPaise).toBe(59000);
      expect(attached.balanceAmountPaise).toBe(0);
      expect(attached.items[0].unitPricePaise).toBe(5000);
      expect(attached.items[0].totalAmountPaise).toBe(59000);
      expect(attached.paymentSplits[0].amountPaise).toBe(59000);
    });

    it('attaches paise fields on voucher with entries and paymentAllocations', () => {
      const voucher = {
        id: 'vch-001',
        voucherNumber: 'VCH-001',
        totalAmount: 1500.75,
        entries: [
          { accountId: 'acc-1', debit: 1500.75, credit: 0 },
          { accountId: 'acc-2', debit: 0, credit: 1500.75 },
        ],
        paymentAllocations: [
          { documentId: 'inv-1', amount: 1000.5 },
          { documentId: 'inv-2', amount: 500.25 },
        ],
      };

      const attached = attachPaiseFields(voucher, 'voucher');
      expect(attached.paiseSchema).toBe(PAISE_SCHEMA_VERSION);
      expect(attached.paiseKind).toBe('voucher');
      expect(attached.totalAmountPaise).toBe(toPaise(1500.75));
      expect(attached.entries[0].debitPaise).toBe(toPaise(1500.75));
      expect(attached.entries[0].creditPaise).toBe(0);
      expect(attached.entries[1].debitPaise).toBe(0);
      expect(attached.entries[1].creditPaise).toBe(toPaise(1500.75));
      expect(attached.paymentAllocations[0].amountPaise).toBe(toPaise(1000.5));
      expect(attached.paymentAllocations[1].amountPaise).toBe(toPaise(500.25));
    });

    it('attaches paise fields on party', () => {
      const party = {
        id: 'party-1',
        name: 'Acme Traders',
        openingBalance: 1250.5,
        currentBalance: 3400.75,
      };

      const attached = attachPaiseFields(party, 'party');
      expect(attached.paiseSchema).toBe(PAISE_SCHEMA_VERSION);
      expect(attached.paiseKind).toBe('party');
      expect(attached.openingBalancePaise).toBe(toPaise(1250.5));
      expect(attached.currentBalancePaise).toBe(toPaise(3400.75));
    });

    it('attaches paise fields on expense', () => {
      const expense = {
        id: 'exp-1',
        amount: 350.25,
        taxableAmount: 300,
        taxAmount: 50.25,
        cgstAmount: 25.12,
        sgstAmount: 25.13,
        igstAmount: 0,
      };

      const attached = attachPaiseFields(expense, 'expense');
      expect(attached.paiseSchema).toBe(PAISE_SCHEMA_VERSION);
      expect(attached.paiseKind).toBe('expense');
      expect(attached.amountPaise).toBe(toPaise(350.25));
      expect(attached.taxableAmountPaise).toBe(30000);
      expect(attached.taxAmountPaise).toBe(toPaise(50.25));
      expect(attached.cgstAmountPaise).toBe(toPaise(25.12));
      expect(attached.sgstAmountPaise).toBe(toPaise(25.13));
      expect(attached.igstAmountPaise).toBe(0);
    });

    it('attaches paise fields on bankAccount, cashBankTxn, loan, and loanTxn', () => {
      const bank = attachPaiseFields({ id: 'b1', openingBalance: 10000 }, 'bankAccount');
      expect(bank.openingBalancePaise).toBe(1000000);

      const txn = attachPaiseFields({ id: 'tx1', amount: 250.5 }, 'cashBankTxn');
      expect(txn.amountPaise).toBe(25050);

      const loan = attachPaiseFields(
        { id: 'l1', sanctionAmount: 500000, emiAmount: 15000.75, currentPrincipalOutstanding: 450000 },
        'loan'
      );
      expect(loan.sanctionAmountPaise).toBe(50000000);
      expect(loan.emiAmountPaise).toBe(toPaise(15000.75));
      expect(loan.currentPrincipalOutstandingPaise).toBe(45000000);

      const loanTxn = attachPaiseFields(
        {
          id: 'lt1',
          principalPaid: 10000,
          interestPaid: 2500.5,
          chargesPaid: 100,
          totalAmount: 12600.5,
          remainingPrincipal: 440000,
        },
        'loanTxn'
      );
      expect(loanTxn.principalPaidPaise).toBe(1000000);
      expect(loanTxn.interestPaidPaise).toBe(250050);
      expect(loanTxn.chargesPaidPaise).toBe(10000);
      expect(loanTxn.totalAmountPaise).toBe(1260050);
      expect(loanTxn.remainingPrincipalPaise).toBe(44000000);
    });

    it('does not emit twins for absent or undefined optional fields', () => {
      const partialInvoice = {
        id: 'inv-partial',
        grandTotal: 100,
        // all other rupee fields absent
        items: [
          {
            itemId: 'item-1',
            unitPrice: 50,
            taxableAmount: 50,
            totalAmount: 50,
            // discountAmount, cgstAmount, cessAmount, etc. absent
          },
        ],
      };

      const attached = attachPaiseFields(partialInvoice, 'invoice');
      expect(attached.grandTotalPaise).toBe(10000);
      expect(attached).not.toHaveProperty('totalGrossAmountPaise');
      expect(attached).not.toHaveProperty('shippingAmountPaise');
      expect(attached).not.toHaveProperty('roundOffPaise');
      expect(attached).not.toHaveProperty('paidAmountPaise');
      expect(attached).not.toHaveProperty('balanceAmountPaise');

      expect(attached.items[0].unitPricePaise).toBe(5000);
      expect(attached.items[0]).not.toHaveProperty('discountAmountPaise');
      expect(attached.items[0]).not.toHaveProperty('cgstAmountPaise');
      expect(attached.items[0]).not.toHaveProperty('cessAmountPaise');
    });

    it('is strictly idempotent: attach twice equals attach once', () => {
      const invoice = {
        id: 'inv-idem',
        invoiceNumber: 'INV-IDEM-1',
        totalGrossAmount: 1200,
        grandTotal: 1416,
        paidAmount: 1416,
        balanceAmount: 0,
        items: [
          {
            itemId: 'it-1',
            unitPrice: 600,
            taxableAmount: 1200,
            cgstAmount: 108,
            sgstAmount: 108,
            cessAmount: 0,
            totalAmount: 1416,
          },
        ],
        paymentSplits: [{ id: 'sp-1', amount: 1416 }],
      };

      const once = attachPaiseFields(invoice, 'invoice');
      const twice = attachPaiseFields(once, 'invoice');

      expect(twice).toEqual(once);
    });

    it('never mutates input objects or nested arrays', () => {
      const rawItem = { itemId: 'i-1', unitPrice: 100, taxableAmount: 100, totalAmount: 100 };
      const rawSplit = { id: 's-1', amount: 100 };
      const invoice = {
        id: 'inv-immut',
        grandTotal: 100,
        items: [rawItem],
        paymentSplits: [rawSplit],
      };

      const frozen = JSON.parse(JSON.stringify(invoice));
      const attached = attachPaiseFields(invoice, 'invoice');

      expect(invoice).toEqual(frozen);
      expect(invoice).not.toHaveProperty('paiseSchema');
      expect(invoice).not.toHaveProperty('grandTotalPaise');
      expect(rawItem).not.toHaveProperty('unitPricePaise');
      expect(rawSplit).not.toHaveProperty('amountPaise');
      expect(attached).not.toBe(invoice);
      expect(attached.items).not.toBe(invoice.items);
      expect(attached.items[0]).not.toBe(rawItem);
    });
  });

  describe('verifyPaiseFields', () => {
    it('returns empty array for clean attached documents', () => {
      const invoice = attachPaiseFields(
        {
          id: 'inv-v1',
          invoiceNumber: 'INV-V1',
          grandTotal: 500,
          items: [{ itemId: 'i1', unitPrice: 250, taxableAmount: 500, totalAmount: 500 }],
        },
        'invoice'
      );

      const mismatches = verifyPaiseFields(invoice);
      expect(mismatches).toEqual([]);
    });

    it('detects tampered top-level twin fields with correct path and values', () => {
      const party = attachPaiseFields(
        {
          id: 'p1',
          name: 'Party',
          openingBalance: 100,
          currentBalance: 250,
        },
        'party'
      );

      // Tamper currentBalancePaise
      const tampered = { ...party, currentBalancePaise: 99999 };
      const mismatches = verifyPaiseFields(tampered);

      expect(mismatches).toHaveLength(1);
      expect(mismatches[0]).toEqual({
        path: 'currentBalance',
        rupee: 250,
        paise: 99999,
      });
    });

    it('detects tampered nested array twin fields with dotted path notation (e.g. items[2].totalAmount)', () => {
      const invoice = attachPaiseFields(
        {
          id: 'inv-multi',
          invoiceNumber: 'INV-M1',
          grandTotal: 300,
          items: [
            { itemId: 'i0', unitPrice: 100, taxableAmount: 100, totalAmount: 100 },
            { itemId: 'i1', unitPrice: 100, taxableAmount: 100, totalAmount: 100 },
            { itemId: 'i2', unitPrice: 100, taxableAmount: 100, totalAmount: 100 },
          ],
        },
        'invoice'
      );

      // Tamper items[2].totalAmountPaise
      const tampered = {
        ...invoice,
        items: [
          invoice.items[0],
          invoice.items[1],
          { ...invoice.items[2], totalAmountPaise: 8888 },
        ],
      };

      const mismatches = verifyPaiseFields(tampered);
      expect(mismatches).toHaveLength(1);
      expect(mismatches[0]).toEqual({
        path: 'items[2].totalAmount',
        rupee: 100,
        paise: 8888,
      });
    });

    it('detects tampered nested voucher entries and payment allocations', () => {
      const voucher = attachPaiseFields(
        {
          id: 'vch-tamp',
          voucherNumber: 'V-001',
          totalAmount: 1000,
          entries: [{ debit: 1000, credit: 0 }],
          paymentAllocations: [{ documentId: 'inv-1', amount: 1000 }],
        },
        'voucher'
      );

      const tampered = {
        ...voucher,
        entries: [{ ...voucher.entries[0], debitPaise: 50000 }],
        paymentAllocations: [{ ...voucher.paymentAllocations[0], amountPaise: 75000 }],
      };

      const mismatches = verifyPaiseFields(tampered);
      expect(mismatches).toHaveLength(2);
      expect(mismatches).toContainEqual({
        path: 'entries[0].debit',
        rupee: 1000,
        paise: 50000,
      });
      expect(mismatches).toContainEqual({
        path: 'paymentAllocations[0].amount',
        rupee: 1000,
        paise: 75000,
      });
    });

    it('ignores documents without paiseSchema and returns []', () => {
      const doc = { id: 'd1', grandTotal: 500 };
      expect(verifyPaiseFields(doc)).toEqual([]);
    });

    it('handles malformed input gracefully without throwing', () => {
      expect(verifyPaiseFields(null)).toEqual([]);
      expect(verifyPaiseFields(undefined)).toEqual([]);
      expect(verifyPaiseFields('string')).toEqual([]);
      expect(verifyPaiseFields(123)).toEqual([]);
      expect(verifyPaiseFields({})).toEqual([]);
      expect(verifyPaiseFields({ paiseSchema: 1, items: 'not-an-array' })).toEqual([]);
    });
  });

  describe('hasCurrentPaiseSchema', () => {
    it('returns true for documents with the current schema version', () => {
      const doc = attachPaiseFields({ id: 'p1', openingBalance: 100 }, 'party');
      expect(hasCurrentPaiseSchema(doc)).toBe(true);
    });

    it('returns false for unattached docs, primitives, or different versions', () => {
      expect(hasCurrentPaiseSchema(null)).toBe(false);
      expect(hasCurrentPaiseSchema(undefined)).toBe(false);
      expect(hasCurrentPaiseSchema('some-id')).toBe(false);
      expect(hasCurrentPaiseSchema({})).toBe(false);
      expect(hasCurrentPaiseSchema({ paiseSchema: 2 })).toBe(false);
      expect(hasCurrentPaiseSchema({ paiseSchema: '1' })).toBe(false);
      // Backward compat: legacy underscore-prefixed marker still recognized.
      expect(hasCurrentPaiseSchema({ __paiseSchema: PAISE_SCHEMA_VERSION })).toBe(true);
    });
  });
});
