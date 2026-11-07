import { describe, it, expect } from 'vitest';
import {
  parseSplitsFromNotes,
  parseSplitsFromInvoice,
  parseSplitsFromPurchase,
  formatSplitNotes,
  derivePaymentSettlement,
} from '@/core/accounting/paymentSplitUtils';
import type { Invoice, PaymentSplit } from '@/models/invoice';
import type { PurchaseBill } from '@/models/purchase';

describe('Suite 4: Multi-Tender Splits & Parsing', () => {
  it('TC-SPLT-01: parseSplitsFromInvoice preserves existing explicit paymentSplits array without mutation', () => {
    const inv: Partial<Invoice> = {
      paymentSplits: [
        { id: 's1', mode: 'CASH', amount: 500 },
        { id: 's2', mode: 'UPI', amount: 500 },
      ],
    };
    const splits = parseSplitsFromInvoice(inv as Invoice, 1000);
    expect(splits).toHaveLength(2);
    expect(splits[0].mode).toBe('CASH');
    expect(splits[0].amount).toBe(500);
    expect(splits[1].mode).toBe('UPI');
    expect(splits[1].amount).toBe(500);
  });

  it('TC-SPLT-02: parseSplitsFromInvoice extracts split modes and amounts from human-readable notes', () => {
    const inv: Partial<Invoice> = {
      notes: 'Split Payment — Cash ₹500, UPI ₹500',
    };
    const splits = parseSplitsFromInvoice(inv as Invoice, 1000);
    expect(splits).toHaveLength(2);
    expect(splits.find((s) => s.mode === 'CASH')?.amount).toBe(500);
    expect(splits.find((s) => s.mode === 'UPI')?.amount).toBe(500);
  });

  it('TC-SPLT-03: parseSplitsFromInvoice handles partial invoice with paidAmount and remaining balanceAmount under CREDIT', () => {
    const inv: Partial<Invoice> = {
      paymentStatus: 'PARTIAL',
      paymentMode: 'CASH',
      paidAmount: 400,
      balanceAmount: 600,
      grandTotal: 1000,
    };
    const splits = parseSplitsFromInvoice(inv as Invoice, 1000);
    expect(splits).toHaveLength(2);
    expect(splits[0]).toEqual({ id: '1', mode: 'CASH', amount: 400 });
    expect(splits[1]).toEqual({ id: '2', mode: 'CREDIT', amount: 600 });
  });

  it('TC-SPLT-04: parseSplitsFromInvoice handles full credit / unpaid invoice with single CREDIT split', () => {
    const inv: Partial<Invoice> = {
      paymentStatus: 'UNPAID',
      paymentMode: 'CREDIT',
      grandTotal: 1200,
    };
    const splits = parseSplitsFromInvoice(inv as Invoice, 1200);
    expect(splits).toHaveLength(1);
    expect(splits[0]).toEqual({ id: '1', mode: 'CREDIT', amount: 0 });
  });

  it('TC-SPLT-05: parseSplitsFromInvoice handles single-mode paid invoice (CASH, UPI, CARD, BANK)', () => {
    const inv: Partial<Invoice> = {
      paymentStatus: 'PAID',
      paymentMode: 'UPI',
      paidAmount: 1500,
      grandTotal: 1500,
    };
    const splits = parseSplitsFromInvoice(inv as Invoice, 1500);
    expect(splits).toHaveLength(1);
    expect(splits[0]).toEqual({ id: '1', mode: 'UPI', amount: 1500 });

    // Handles null / undefined invoice with fallback CASH
    const fallback = parseSplitsFromInvoice(null, 800);
    expect(fallback).toHaveLength(1);
    expect(fallback[0]).toEqual({ id: '1', mode: 'CASH', amount: 800 });
  });

  it('TC-SPLT-06: parseSplitsFromPurchase preserves explicit paymentSplits array on purchase bills', () => {
    const bill: Partial<PurchaseBill> = {
      paymentSplits: [
        { id: 'p1', mode: 'NET_BANKING', amount: 2000 },
      ],
    };
    const splits = parseSplitsFromPurchase(bill as PurchaseBill, 2000);
    expect(splits).toHaveLength(1);
    expect(splits[0].mode).toBe('NET_BANKING');
    expect(splits[0].amount).toBe(2000);
  });

  it('TC-SPLT-07: parseSplitsFromPurchase extracts split tenders from purchase bill notes', () => {
    const bill: Partial<PurchaseBill> = {
      notes: 'Split Payment — Cash ₹1000, Bank ₹4000',
    };
    const splits = parseSplitsFromPurchase(bill as PurchaseBill, 5000);
    expect(splits).toHaveLength(2);
    expect(splits.find((s) => s.mode === 'CASH')?.amount).toBe(1000);
    expect(splits.find((s) => s.mode === 'NET_BANKING')?.amount).toBe(4000);
  });

  it('TC-SPLT-08: parseSplitsFromPurchase handles partial and unpaid purchase bills', () => {
    const partialBill: Partial<PurchaseBill> = {
      paymentStatus: 'PARTIAL',
      paymentMode: 'NET_BANKING',
      paidAmount: 1500,
      balanceAmount: 500,
      grandTotal: 2000,
    };
    const pSplits = parseSplitsFromPurchase(partialBill as PurchaseBill, 2000);
    expect(pSplits).toHaveLength(2);
    expect(pSplits[0]).toEqual({ id: '1', mode: 'NET_BANKING', amount: 1500 });
    expect(pSplits[1]).toEqual({ id: '2', mode: 'CREDIT', amount: 500 });

    const unpaidBill: Partial<PurchaseBill> = {
      paymentStatus: 'UNPAID',
      paymentMode: 'CREDIT',
    };
    const uSplits = parseSplitsFromPurchase(unpaidBill as PurchaseBill, 3000);
    expect(uSplits).toHaveLength(1);
    expect(uSplits[0]).toEqual({ id: '1', mode: 'CREDIT', amount: 0 });
  });

  it('TC-SPLT-09: formatSplitNotes generates clean human-readable summary string for multi-tender split', () => {
    const splits = [
      { id: '1', mode: 'CASH' as const, amount: 500 },
      { id: '2', mode: 'UPI' as const, amount: 500 },
    ];
    const notes = formatSplitNotes(splits, 0);
    expect(notes).toBe('Split Payment — Cash ₹500, Upi ₹500');
  });

  it('TC-SPLT-10: formatSplitNotes includes outstanding credit dues in formatted summary string', () => {
    const splits = [
      { id: '1', mode: 'CASH' as const, amount: 500 },
    ];
    const notes = formatSplitNotes(splits, 250);
    expect(notes).toBe('Split Payment — Cash ₹500, Credit ₹250.00');
  });

  describe('derivePaymentSettlement — Stale Split Notes Protection', () => {
    it('legacy settled doc with split notes correctly parses structured splits', () => {
      const res = derivePaymentSettlement({
        grandTotal: 1000,
        paymentMode: 'SPLIT',
        paymentStatus: 'PAID',
        paidAmount: 1000,
        balanceAmount: 0,
        notes: 'Split: CASH: ₹400, UPI: ₹600',
      });
      expect(res.paidAmount).toBe(1000);
      expect(res.balanceAmount).toBe(0);
      expect(res.paymentMode).toBe('SPLIT');
      expect(res.paymentSplits?.length).toBe(2);
    });

    it('unlinked credit doc with split credit notes stays UNPAID, balance = grandTotal, CREDIT mode', () => {
      const res = derivePaymentSettlement({
        grandTotal: 720,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 720,
        notes: 'Split Payment — Credit ₹720.00',
      });
      expect(res.paymentStatus).toBe('UNPAID');
      expect(res.balanceAmount).toBe(720);
      expect(res.paidAmount).toBe(0);
      expect(res.paymentMode).toBe('CREDIT');
    });

    it('genuinely partial doc with split notes retains PARTIAL status and correct split amounts', () => {
      const res = derivePaymentSettlement({
        grandTotal: 1000,
        notes: 'Split Payment — Cash ₹400, Credit ₹600.00',
      });
      expect(res.paymentStatus).toBe('PARTIAL');
      expect(res.paidAmount).toBe(400);
      expect(res.balanceAmount).toBe(600);
      expect(res.paymentMode).toBe('SPLIT');
    });

    it('treats CREDIT_NOTE tender as non-credit split and includes it in paidAmount and status', () => {
      const res = derivePaymentSettlement({
        grandTotal: 2400,
        paymentSplits: [
          { id: 's-cash', mode: 'CASH', amount: 1500 },
          { id: 's-upi', mode: 'UPI', amount: 180 },
          { id: 's-cn', mode: 'CREDIT_NOTE', amount: 720 },
        ],
      });
      expect(res.paidAmount).toBe(2400);
      expect(res.balanceAmount).toBe(0);
      expect(res.paymentStatus).toBe('PAID');
      expect(res.paymentMode).toBe('SPLIT');
      expect(res.paymentSplits?.length).toBe(3);
      expect(res.paymentSplits?.find((s) => s.mode === 'CREDIT_NOTE')?.amount).toBe(720);
    });

    it('formats CREDIT_NOTE as Sales Return in formatSplitNotes', () => {
      const splits: PaymentSplit[] = [
        { id: 's-cash', mode: 'CASH', amount: 1680 },
        { id: 's-cn', mode: 'CREDIT_NOTE', amount: 720 },
      ];
      const notes = formatSplitNotes(splits, 0);
      expect(notes).toBe('Split Payment — Cash ₹1680, Sales Return ₹720');
    });

    it('parses Sales Return from notes into CREDIT_NOTE split', () => {
      const notes = 'Split Payment — Cash ₹1680, Sales Return ₹720.00';
      const parsed = parseSplitsFromNotes(notes);
      expect(parsed.length).toBe(2);
      expect(parsed.find((s) => s.mode === 'CREDIT_NOTE')?.amount).toBe(720);
    });
  });
});
