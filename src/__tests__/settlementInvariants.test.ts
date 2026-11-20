import { describe, it, expect } from 'vitest';
import {
  toPaise,
  fromPaise,
  sumMoney,
  addPaise,
  subPaise,
} from '../core/money.ts';
import {
  finalizeTotals,
  finalizePurchaseTotals,
  derivePaymentStatus,
  derivePurchasePaymentStatus,
} from '../core/invoicing/lineItemEngine.ts';
import {
  parseSplitsFromNotes,
  parseSplitsFromInvoice,
  parseSplitsFromPurchase,
  derivePaymentSettlement,
  formatSplitNotes,
} from '../core/accounting/paymentSplitUtils.ts';
import {
  allocateOldestFirst,
  validateAllocations,
  applyAllocations,
  validateInvoicePreSave,
  validatePurchasePreSave,
  OutstandingDocument,
} from '../core/accounting/paymentAllocation.ts';
import type { Invoice, PaymentSplit } from '../models/invoice.ts';
import type { PurchaseBill } from '../models/purchase.ts';
import type { Voucher } from '../core/accounting/voucherTypes.ts';

/**
 * Cross-Module Settlement & Payment Invariants (Audit Finding 4.11)
 *
 * Enforces cross-module consistency and mathematical invariants across:
 * - src/core/money.ts
 * - src/core/invoicing/lineItemEngine.ts
 * - src/core/accounting/paymentSplitUtils.ts
 * - src/core/accounting/paymentAllocation.ts
 */
describe('Audit 4.11 — Settlement Cross-Module Invariants', () => {
  // --------------------------------------------------------------------------
  // Invariant 1: Split sum invariant
  // --------------------------------------------------------------------------
  describe('Invariant 1: Split Sum Invariant (splits sum === payment amount to the paise)', () => {
    it('ensures sumMoney(splits.map(s => s.amount)) strictly equals payment amount in invoice context', () => {
      // Representative multi-tender split covering cash, upi, card, bank, cheque
      const representativeSplits: PaymentSplit[] = [
        { id: 's-cash', mode: 'CASH', amount: 150.25 },
        { id: 's-upi', mode: 'UPI', amount: 250.50 },
        { id: 's-card', mode: 'CARD', amount: 300.00 },
        { id: 's-bank', mode: 'NET_BANKING', amount: 199.25 },
        { id: 's-cheque', mode: 'CHEQUE', amount: 100.00 },
      ];
      const expectedTotalPaid = 1000.00;

      // Direct money sum invariant
      const summedMoney = sumMoney(representativeSplits.map((s) => s.amount));
      expect(toPaise(summedMoney)).toBe(toPaise(expectedTotalPaid));
      expect(fromPaise(toPaise(summedMoney))).toBe(expectedTotalPaid);

      // parseSplitsFromInvoice with explicit splits
      const invExplicit: Partial<Invoice> = {
        id: 'inv-test-1',
        grandTotal: expectedTotalPaid,
        paidAmount: expectedTotalPaid,
        paymentSplits: representativeSplits,
      };
      const parsedExplicit = parseSplitsFromInvoice(invExplicit as Invoice, expectedTotalPaid);
      expect(toPaise(sumMoney(parsedExplicit.map((s) => s.amount)))).toBe(toPaise(expectedTotalPaid));

      // parseSplitsFromNotes
      const formattedNotes = formatSplitNotes(representativeSplits, 0);
      const parsedFromNotes = parseSplitsFromNotes(formattedNotes);
      expect(parsedFromNotes.length).toBe(representativeSplits.length);
      expect(toPaise(sumMoney(parsedFromNotes.map((s) => s.amount)))).toBe(toPaise(expectedTotalPaid));

      // derivePaymentSettlement: non-credit splits sum to paidAmount, all splits sum to grandTotal
      const grandTotalWithCredit = 1250.75;
      const creditDue = 250.75;
      const splitsWithCredit: PaymentSplit[] = [
        ...representativeSplits,
        { id: 's-cred', mode: 'CREDIT', amount: creditDue },
      ];
      const settlement = derivePaymentSettlement({
        grandTotal: grandTotalWithCredit,
        paymentSplits: splitsWithCredit,
      });

      expect(settlement.paymentStatus).toBe('PARTIAL');
      expect(toPaise(settlement.paidAmount)).toBe(toPaise(expectedTotalPaid));
      expect(toPaise(settlement.balanceAmount)).toBe(toPaise(creditDue));

      const settledNonCredit = (settlement.paymentSplits || []).filter((s) => s.mode !== 'CREDIT');
      const settledCredit = (settlement.paymentSplits || []).filter((s) => s.mode === 'CREDIT');

      expect(toPaise(sumMoney(settledNonCredit.map((s) => s.amount)))).toBe(toPaise(settlement.paidAmount));
      expect(toPaise(sumMoney(settledCredit.map((s) => s.amount)))).toBe(toPaise(settlement.balanceAmount));
      expect(
        addPaise(
          toPaise(sumMoney(settledNonCredit.map((s) => s.amount))),
          toPaise(sumMoney(settledCredit.map((s) => s.amount)))
        )
      ).toBe(toPaise(grandTotalWithCredit));
    });

    it('ensures sumMoney(splits.map(s => s.amount)) strictly equals payment amount in purchase context', () => {
      // Representative multi-tender purchase splits (NET_BANKING, CASH, CHEQUE, UPI)
      const purchaseSplits: PaymentSplit[] = [
        { id: 'p-bank', mode: 'NET_BANKING', amount: 1450.50 },
        { id: 'p-cash', mode: 'CASH', amount: 550.25 },
        { id: 'p-cheque', mode: 'CHEQUE', amount: 499.25 },
      ];
      const expectedPurchasePaid = 2500.00;

      // Direct money sum invariant
      const summedPurchase = sumMoney(purchaseSplits.map((s) => s.amount));
      expect(toPaise(summedPurchase)).toBe(toPaise(expectedPurchasePaid));
      expect(fromPaise(toPaise(summedPurchase))).toBe(expectedPurchasePaid);

      // parseSplitsFromPurchase with explicit splits
      const billExplicit: Partial<PurchaseBill> = {
        id: 'bill-test-1',
        grandTotal: expectedPurchasePaid,
        paidAmount: expectedPurchasePaid,
        paymentSplits: purchaseSplits,
      };
      const parsedBillSplits = parseSplitsFromPurchase(billExplicit as PurchaseBill, expectedPurchasePaid);
      expect(toPaise(sumMoney(parsedBillSplits.map((s) => s.amount)))).toBe(toPaise(expectedPurchasePaid));

      // parseSplitsFromPurchase with notes
      const purchaseNotes = 'Split Payment — Bank ₹1450.50, Cash ₹550.25, Cheque ₹499.25';
      const billNotes: Partial<PurchaseBill> = {
        id: 'bill-test-2',
        grandTotal: expectedPurchasePaid,
        notes: purchaseNotes,
      };
      const parsedFromBillNotes = parseSplitsFromPurchase(billNotes as PurchaseBill, expectedPurchasePaid);
      expect(toPaise(sumMoney(parsedFromBillNotes.map((s) => s.amount)))).toBe(toPaise(expectedPurchasePaid));

      // derivePaymentSettlement for purchase bill with partial credit
      const purchaseGrandTotal = 3000.00;
      const purchaseCreditDue = 500.00;
      const billSettlement = derivePaymentSettlement({
        grandTotal: purchaseGrandTotal,
        paymentSplits: [
          ...purchaseSplits,
          { id: 'p-cred', mode: 'CREDIT', amount: purchaseCreditDue },
        ],
      });

      expect(billSettlement.paymentStatus).toBe('PARTIAL');
      expect(toPaise(billSettlement.paidAmount)).toBe(toPaise(expectedPurchasePaid));
      expect(toPaise(billSettlement.balanceAmount)).toBe(toPaise(purchaseCreditDue));

      const billNonCredit = (billSettlement.paymentSplits || []).filter((s) => s.mode !== 'CREDIT');
      expect(toPaise(sumMoney(billNonCredit.map((s) => s.amount)))).toBe(toPaise(billSettlement.paidAmount));
    });
  });

  // --------------------------------------------------------------------------
  // Invariant 2: Allocation never exceeds document total
  // --------------------------------------------------------------------------
  describe('Invariant 2: Allocation Never Exceeds Document Total', () => {
    it('allocateOldestFirst never generates allocations exceeding document balance or grandTotal', () => {
      const docs: OutstandingDocument[] = [
        {
          id: 'doc-1',
          documentNumber: 'INV-101',
          number: 'INV-101',
          date: '2026-11-01',
          grandTotal: 500.00,
          paidAmount: 200.00,
          balanceAmount: 300.00,
          documentType: 'INVOICE',
        },
        {
          id: 'doc-2',
          documentNumber: 'INV-102',
          number: 'INV-102',
          date: '2026-11-02',
          grandTotal: 1000.00,
          paidAmount: 0,
          balanceAmount: 1000.00,
          documentType: 'INVOICE',
        },
      ];

      // Over-payment attempt: allocate 5000 against 1300 total outstanding
      const allocations = allocateOldestFirst(docs, 5000.00);

      expect(allocations.length).toBe(2);
      // doc-1 balance is 300; allocation must not exceed 300 or grandTotal 500
      expect(allocations[0].amount).toBe(300.00);
      expect(toPaise(allocations[0].amount)).toBeLessThanOrEqual(toPaise(docs[0].grandTotal));
      expect(toPaise(allocations[0].amount)).toBeLessThanOrEqual(toPaise(docs[0].balanceAmount));

      // doc-2 balance is 1000; allocation must not exceed 1000
      expect(allocations[1].amount).toBe(1000.00);
      expect(toPaise(allocations[1].amount)).toBeLessThanOrEqual(toPaise(docs[1].grandTotal));
      expect(toPaise(allocations[1].amount)).toBeLessThanOrEqual(toPaise(docs[1].balanceAmount));

      // Total allocated must not exceed the documents' combined outstanding total
      const totalAllocatedPaise = allocations.reduce((sum, a) => addPaise(sum, toPaise(a.amount)), 0);
      expect(totalAllocatedPaise).toBe(toPaise(1300.00));
    });

    it('applyAllocations clamps document paidAmount to never exceed grandTotal even if over-allocated', () => {
      const invoice: Partial<Invoice> = {
        id: 'inv-clamp-1',
        grandTotal: 500.00,
        paidAmount: 0,
        balanceAmount: 500.00,
        paymentStatus: 'UNPAID',
        paymentMode: 'CREDIT',
      };

      // Malformed allocation trying to allocate 800 to a 500 document
      const excessiveAllocations = [
        {
          documentId: 'inv-clamp-1',
          documentType: 'INVOICE' as const,
          documentNumber: 'INV-CLAMP-1',
          amount: 800.00,
        },
      ];

      const result = applyAllocations([invoice as Invoice], excessiveAllocations);
      expect(result[0].paidAmount).toBe(500.00);
      expect(result[0].balanceAmount).toBe(0.00);
      expect(result[0].paymentStatus).toBe('PAID');
      expect(toPaise(result[0].paidAmount)).toBeLessThanOrEqual(toPaise(invoice.grandTotal!));
    });

    it('validateAllocations rejects allocations exceeding document balance with existing error message', () => {
      const doc: OutstandingDocument = {
        id: 'doc-val-1',
        documentNumber: 'INV-201',
        number: 'INV-201',
        date: '2026-11-01',
        grandTotal: 1000.00,
        paidAmount: 700.00,
        balanceAmount: 300.00,
        documentType: 'INVOICE',
      };

      const invalidAllocations = [
        {
          documentId: 'doc-val-1',
          documentNumber: 'INV-201',
          documentType: 'INVOICE' as const,
          amount: 350.00, // exceeds balance 300 by 50
        },
      ];

      const validation = validateAllocations({
        allocations: invalidAllocations,
        documents: [doc],
        totalSettled: 500.00,
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Allocation amount ₹350.00 exceeds balance ₹300.00 on #INV-201.');
    });

    it('validateAllocations rejects total allocations exceeding totalSettled with existing error message', () => {
      const doc: OutstandingDocument = {
        id: 'doc-val-2',
        documentNumber: 'INV-202',
        number: 'INV-202',
        date: '2026-11-01',
        grandTotal: 1000.00,
        paidAmount: 0,
        balanceAmount: 1000.00,
        documentType: 'INVOICE',
      };

      const invalidAllocations = [
        {
          documentId: 'doc-val-2',
          documentNumber: 'INV-202',
          documentType: 'INVOICE' as const,
          amount: 600.00,
        },
      ];

      const validation = validateAllocations({
        allocations: invalidAllocations,
        documents: [doc],
        totalSettled: 500.00, // allocated 600 > payment amount 500
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Total allocated amount (₹600.00) exceeds payment amount (₹500.00).');
    });

    it('validateInvoicePreSave rejects reducing grand total below linked payment allocations', () => {
      const existingInvoice: Partial<Invoice> = {
        id: 'inv-link-1',
        invoiceNumber: 'INV-301',
        grandTotal: 1000.00,
        paidAmount: 600.00,
        balanceAmount: 400.00,
      };

      const linkedVoucher: Partial<Voucher> = {
        id: 'v-link-1',
        voucherType: 'RECEIPT',
        allocationMode: 'MANUAL',
        totalAmount: 600.00,
        paymentAllocations: [
          {
            documentType: 'INVOICE',
            documentId: 'inv-link-1',
            documentNumber: 'INV-301',
            amount: 600.00,
          },
        ],
      };

      // User attempts to edit invoice to reduce grand total to 500 (below linked 600)
      const editedInvoice: Invoice = {
        ...(existingInvoice as Invoice),
        grandTotal: 500.00,
        paidAmount: 500.00,
      };

      const preSave = validateInvoicePreSave({
        newInvoice: editedInvoice,
        existingInvoices: [existingInvoice as Invoice],
        vouchers: [linkedVoucher as Voucher],
      });

      expect(preSave.valid).toBe(false);
      expect(preSave.error).toBe(
        'Cannot reduce invoice grand total (₹500.00) below total linked payment allocations (₹600.00). Unlink or adjust payments first.'
      );
    });

    it('validateInvoicePreSave rejects reducing paid amount below linked party payment vouchers', () => {
      const existingInvoice: Partial<Invoice> = {
        id: 'inv-link-2',
        invoiceNumber: 'INV-302',
        grandTotal: 1000.00,
        paidAmount: 800.00,
        balanceAmount: 200.00,
      };

      const linkedVoucher: Partial<Voucher> = {
        id: 'v-link-2',
        voucherType: 'RECEIPT',
        allocationMode: 'MANUAL',
        totalAmount: 500.00,
        paymentAllocations: [
          {
            documentType: 'INVOICE',
            documentId: 'inv-link-2',
            documentNumber: 'INV-302',
            amount: 500.00,
          },
        ],
      };

      // User attempts to edit invoice reducing paid amount to 200 (below linked 500)
      const editedInvoice: Invoice = {
        ...(existingInvoice as Invoice),
        paidAmount: 200.00,
      };

      const preSave = validateInvoicePreSave({
        newInvoice: editedInvoice,
        existingInvoices: [existingInvoice as Invoice],
        vouchers: [linkedVoucher as Voucher],
      });

      expect(preSave.valid).toBe(false);
      expect(preSave.error).toBe(
        'Cannot reduce paid amount below ₹500.00: active party payment vouchers cover that amount. Reverse or edit those payments first.'
      );
    });

    it('validatePurchasePreSave rejects reducing paid amount below linked party payment vouchers', () => {
      const existingBill: Partial<PurchaseBill> = {
        id: 'bill-link-1',
        billNumber: 'BILL-401',
        supplierId: 'sup-1',
        grandTotal: 1000.00,
        paidAmount: 700.00,
        balanceAmount: 300.00,
      };

      const linkedPaymentVoucher: Partial<Voucher> = {
        id: 'v-pur-1',
        voucherType: 'PAYMENT',
        allocationMode: 'MANUAL',
        totalAmount: 450.00,
        paymentAllocations: [
          {
            documentType: 'PURCHASE',
            documentId: 'bill-link-1',
            documentNumber: 'BILL-401',
            amount: 450.00,
          },
        ],
      };

      // User attempts to reduce paid amount to 200 (below linked 450)
      const editedBill: PurchaseBill = {
        ...(existingBill as PurchaseBill),
        paidAmount: 200.00,
      };

      const preSave = validatePurchasePreSave({
        newBill: editedBill,
        existingPurchases: [existingBill as PurchaseBill],
        vouchers: [linkedPaymentVoucher as Voucher],
      });

      expect(preSave.valid).toBe(false);
      expect(preSave.error).toBe(
        'Cannot reduce paid amount below ₹450.00: active party payment vouchers cover that amount. Reverse or edit those payments first.'
      );
    });
  });

  // --------------------------------------------------------------------------
  // Invariant 3: Status derivation consistency
  // --------------------------------------------------------------------------
  describe('Invariant 3: Status Derivation Consistency (Invoice vs Purchase parity)', () => {
    /**
     * Requirement:
     * derivePaymentStatus(grandTotal, paid) and derivePurchasePaymentStatus(grandTotal, paid)
     * agree on PAID/PARTIAL/UNPAID for a matrix of (grandTotal, paid) including
     * 0, partial, exact, over-paid, and grandTotal 0.
     *
     * Audit note (4.11): both engines share the unified (grandTotal, totalPaid) signature
     * and strict semantics without 1-paise tolerance divergence.
     */
    const statusMatrix = [
      { name: 'unpaid bill', grandTotal: 100.00, paid: 0.00, expectedStatus: 'UNPAID' },
      { name: 'partial payment', grandTotal: 100.00, paid: 50.00, expectedStatus: 'PARTIAL' },
      { name: 'exact full payment', grandTotal: 100.00, paid: 100.00, expectedStatus: 'PAID' },
      { name: 'over-paid bill', grandTotal: 100.00, paid: 150.00, expectedStatus: 'PAID' },
      { name: 'zero grand total and zero paid', grandTotal: 0.00, paid: 0.00, expectedStatus: 'PAID' },
      { name: 'zero grand total with positive paid', grandTotal: 0.00, paid: 50.00, expectedStatus: 'PAID' },
    ];

    statusMatrix.forEach(({ name, grandTotal, paid, expectedStatus }) => {
      it(`evaluates status parity for ${name} (grandTotal: ${grandTotal}, paid: ${paid})`, () => {
        const purchaseStatus = derivePurchasePaymentStatus(grandTotal, paid);
        expect(purchaseStatus).toBe(expectedStatus);

        // Both engines take (grandTotal, totalPaid) under unified signature (Audit 4.11).
        const invoiceStatus = derivePaymentStatus(grandTotal, paid);
        expect(invoiceStatus).toBe(purchaseStatus);
      });
    });

    it('evaluates strict parity without 1-paise tolerance divergence (grandTotal: 100.00, paid: 99.99)', () => {
      // Audit 4.11 unification: both engines share (grandTotal, totalPaid) signature and strict rules
      const invoiceStatus = derivePaymentStatus(100.00, 99.99);
      const purchaseStatus = derivePurchasePaymentStatus(100.00, 99.99);

      expect(invoiceStatus).toBe('PARTIAL');
      expect(purchaseStatus).toBe('PARTIAL');
      expect(invoiceStatus).toBe(purchaseStatus);
    });
  });

  // --------------------------------------------------------------------------
  // Invariant 4: Engine parity through paise
  // --------------------------------------------------------------------------
  describe('Invariant 4: Engine Parity (finalizeTotals vs finalizePurchaseTotals round-trips through paise)', () => {
    const netAmountSamples = [
      0,
      0.01,
      0.49,
      0.50,
      0.99,
      10.25,
      99.49,
      100.50,
      100.51,
      999.99,
      1234.56,
      99999.95,
    ];

    const shippingSamples = [
      0,
      0.01,
      10.00,
      49.50,
      50.00,
      100.25,
    ];

    netAmountSamples.forEach((netAmount) => {
      shippingSamples.forEach((shippingAmount) => {
        it(`produces identical grandTotal & roundOff for netAmount=${netAmount}, shipping=${shippingAmount}`, () => {
          // Invoice totals calculation
          const invoiceSummary = {
            totalGrossAmount: netAmount,
            totalDiscount: 0,
            totalTaxableAmount: netAmount,
            totalCgst: 0,
            totalSgst: 0,
            totalUtgst: 0,
            totalIgst: 0,
            totalCess: 0,
            totalTax: 0,
            roundOff: 0,
            grandTotal: netAmount,
            netAmount,
          };
          const invoiceTotals = finalizeTotals(invoiceSummary as any, {
            isGstActive: false,
            isComposition: false,
            shippingAmount,
          });

          // Purchase totals calculation
          const purchaseTotals = finalizePurchaseTotals(
            { netAmount },
            { shippingAmount }
          );

          // 1. Cross-engine parity: invoice and purchase produce identical grandTotal and roundOff
          expect(invoiceTotals.grandTotal).toBe(purchaseTotals.grandTotal);
          expect(invoiceTotals.roundOff).toBe(purchaseTotals.roundOff);

          // 2. Round-trip through integer paise without floating-point drift
          expect(fromPaise(toPaise(invoiceTotals.grandTotal))).toBe(invoiceTotals.grandTotal);
          expect(fromPaise(toPaise(invoiceTotals.roundOff))).toBe(invoiceTotals.roundOff);
          expect(fromPaise(toPaise(purchaseTotals.grandTotal))).toBe(purchaseTotals.grandTotal);
          expect(fromPaise(toPaise(purchaseTotals.roundOff))).toBe(purchaseTotals.roundOff);

          // 3. Mathematical invariant: preRoundPaise + roundOffPaise === grandTotalPaise
          const preRoundPaise = addPaise(toPaise(netAmount), toPaise(shippingAmount));
          const roundOffPaise = toPaise(invoiceTotals.roundOff);
          const grandTotalPaise = toPaise(invoiceTotals.grandTotal);
          expect(addPaise(preRoundPaise, roundOffPaise)).toBe(grandTotalPaise);
        });
      });
    });
  });

  // --------------------------------------------------------------------------
  // Invariant 5: No ad-hoc rounding in allocation error paths
  // --------------------------------------------------------------------------
  describe('Invariant 5: No Ad-Hoc Rounding in Allocation Error Paths (strict 2-decimal fromPaise strings)', () => {
    it('ensures validateAllocations error messages contain strict 2-decimal strings from fromPaise', () => {
      const doc: OutstandingDocument = {
        id: 'doc-err-1',
        documentNumber: 'INV-501',
        number: 'INV-501',
        date: '2026-11-01',
        grandTotal: 1000.00,
        paidAmount: 850.50,
        balanceAmount: 149.50,
        documentType: 'INVOICE',
      };

      // Allocation exceeding balance: 149.50 vs 200.25
      const allocAmt = 200.25;
      const resBal = validateAllocations({
        allocations: [
          {
            documentId: 'doc-err-1',
            documentNumber: 'INV-501',
            documentType: 'INVOICE',
            amount: allocAmt,
          },
        ],
        documents: [doc],
        totalSettled: 500.00,
      });

      expect(resBal.valid).toBe(false);
      expect(resBal.error).toBeDefined();

      // Extract all formatted rupee amounts: ₹X.XX
      const extractedRupees = resBal.error!.match(/₹\s*([0-9.]+)/g) || [];
      expect(extractedRupees.length).toBeGreaterThanOrEqual(2);

      extractedRupees.forEach((str) => {
        const rawNumStr = str.replace(/[^\d.]/g, '');
        // Assert strict 2 decimal places format
        expect(rawNumStr).toMatch(/^\d+\.\d{2}$/);
        const parsedPaise = toPaise(Number(rawNumStr));
        expect(fromPaise(parsedPaise).toFixed(2)).toBe(rawNumStr);
      });

      // Total settled exceeded: 250.75 allocated vs 100.10 settled
      const resTotal = validateAllocations({
        allocations: [
          {
            documentId: 'doc-err-1',
            documentNumber: 'INV-501',
            documentType: 'INVOICE',
            amount: 149.50,
          },
        ],
        documents: [doc],
        totalSettled: 100.10,
      });

      expect(resTotal.valid).toBe(false);
      const extractedTotalRupees = resTotal.error!.match(/₹\s*([0-9.]+)/g) || [];
      expect(extractedTotalRupees.length).toBeGreaterThanOrEqual(2);
      extractedTotalRupees.forEach((str) => {
        const rawNumStr = str.replace(/[^\d.]/g, '');
        expect(rawNumStr).toMatch(/^\d+\.\d{2}$/);
        const parsedPaise = toPaise(Number(rawNumStr));
        expect(fromPaise(parsedPaise).toFixed(2)).toBe(rawNumStr);
      });
    });

    it('ensures validateInvoicePreSave error messages contain strict 2-decimal strings from fromPaise', () => {
      const inv: Partial<Invoice> = {
        id: 'inv-err-1',
        grandTotal: 1000.00,
        paidAmount: 800.00,
      };

      const linkedVoucher: Partial<Voucher> = {
        id: 'v-err-1',
        voucherType: 'RECEIPT',
        allocationMode: 'MANUAL',
        totalAmount: 600.50,
        paymentAllocations: [
          {
            documentType: 'INVOICE',
            documentId: 'inv-err-1',
            documentNumber: 'INV-ERR-1',
            amount: 600.50,
          },
        ],
      };

      // Grand total reduced below linked allocations
      const editedGrandTotal: Invoice = {
        ...(inv as Invoice),
        grandTotal: 500.25,
      };

      const resGrand = validateInvoicePreSave({
        newInvoice: editedGrandTotal,
        existingInvoices: [inv as Invoice],
        vouchers: [linkedVoucher as Voucher],
      });

      expect(resGrand.valid).toBe(false);
      const grandRupees = resGrand.error!.match(/₹\s*([0-9.]+)/g) || [];
      expect(grandRupees.length).toBeGreaterThanOrEqual(2);
      grandRupees.forEach((str) => {
        const rawNumStr = str.replace(/[^\d.]/g, '');
        expect(rawNumStr).toMatch(/^\d+\.\d{2}$/);
        const parsedPaise = toPaise(Number(rawNumStr));
        expect(fromPaise(parsedPaise).toFixed(2)).toBe(rawNumStr);
      });

      // Paid amount reduced below linked allocations
      const editedPaid: Invoice = {
        ...(inv as Invoice),
        paidAmount: 300.75,
      };

      const resPaid = validateInvoicePreSave({
        newInvoice: editedPaid,
        existingInvoices: [inv as Invoice],
        vouchers: [linkedVoucher as Voucher],
      });

      expect(resPaid.valid).toBe(false);
      const paidRupees = resPaid.error!.match(/₹\s*([0-9.]+)/g) || [];
      expect(paidRupees.length).toBeGreaterThanOrEqual(1);
      paidRupees.forEach((str) => {
        const rawNumStr = str.replace(/[^\d.]/g, '');
        expect(rawNumStr).toMatch(/^\d+\.\d{2}$/);
        const parsedPaise = toPaise(Number(rawNumStr));
        expect(fromPaise(parsedPaise).toFixed(2)).toBe(rawNumStr);
      });
    });

    it('ensures validatePurchasePreSave error messages contain strict 2-decimal strings from fromPaise', () => {
      const bill: Partial<PurchaseBill> = {
        id: 'bill-err-1',
        supplierId: 'sup-1',
        grandTotal: 1000.00,
        paidAmount: 700.00,
      };

      const linkedVoucher: Partial<Voucher> = {
        id: 'v-pur-err-1',
        voucherType: 'PAYMENT',
        allocationMode: 'MANUAL',
        totalAmount: 500.50,
        paymentAllocations: [
          {
            documentType: 'PURCHASE',
            documentId: 'bill-err-1',
            documentNumber: 'BILL-ERR-1',
            amount: 500.50,
          },
        ],
      };

      const editedBill: PurchaseBill = {
        ...(bill as PurchaseBill),
        paidAmount: 250.25,
      };

      const res = validatePurchasePreSave({
        newBill: editedBill,
        existingPurchases: [bill as PurchaseBill],
        vouchers: [linkedVoucher as Voucher],
      });

      expect(res.valid).toBe(false);
      const purRupees = res.error!.match(/₹\s*([0-9.]+)/g) || [];
      expect(purRupees.length).toBeGreaterThanOrEqual(1);
      purRupees.forEach((str) => {
        const rawNumStr = str.replace(/[^\d.]/g, '');
        expect(rawNumStr).toMatch(/^\d+\.\d{2}$/);
        const parsedPaise = toPaise(Number(rawNumStr));
        expect(fromPaise(parsedPaise).toFixed(2)).toBe(rawNumStr);
      });
    });
  });
});
