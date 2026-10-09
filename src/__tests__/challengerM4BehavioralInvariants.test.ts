import { describe, it, expect } from 'vitest';
import { registerBackHandler, triggerBack } from '../core/utils/backNavigation.ts';
import { audioService } from '../services/barcodeService.ts';
import { formatSplitNotes, parseSplitsFromInvoice, parseSplitsFromPurchase } from '../core/accounting/paymentSplitUtils.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';

describe('Challenger M4 Empirical Verification: Behavioral Invariants', () => {
  describe('Back Navigation Priority Hierarchy Invariants', () => {
    it('executes handlers strictly in order of priority (p30 > p25 > p20 > p15 > p10 > p0)', () => {
      const callLog: string[] = [];

      const unreg0 = registerBackHandler(() => {
        callLog.push('p0_root');
        return true;
      }, 0);

      const unreg10 = registerBackHandler(() => {
        callLog.push('p10_modal');
        return true;
      }, 10);

      const unreg15 = registerBackHandler(() => {
        callLog.push('p15_party_detail');
        return true;
      }, 15);

      const unreg20 = registerBackHandler(() => {
        callLog.push('p20_submodal');
        return true;
      }, 20);

      const unreg25 = registerBackHandler(() => {
        callLog.push('p25_preview');
        return true;
      }, 25);

      const unreg30 = registerBackHandler(() => {
        callLog.push('p30_drawer');
        return true;
      }, 30);

      // Trigger back successively and observe execution order
      expect(triggerBack()).toBe(true);
      expect(callLog).toEqual(['p30_drawer']);

      expect(triggerBack()).toBe(true);
      expect(callLog).toEqual(['p30_drawer', 'p25_preview']);

      expect(triggerBack()).toBe(true);
      expect(callLog).toEqual(['p30_drawer', 'p25_preview', 'p20_submodal']);

      expect(triggerBack()).toBe(true);
      expect(callLog).toEqual(['p30_drawer', 'p25_preview', 'p20_submodal', 'p15_party_detail']);

      expect(triggerBack()).toBe(true);
      expect(callLog).toEqual(['p30_drawer', 'p25_preview', 'p20_submodal', 'p15_party_detail', 'p10_modal']);

      expect(triggerBack()).toBe(true);
      expect(callLog).toEqual(['p30_drawer', 'p25_preview', 'p20_submodal', 'p15_party_detail', 'p10_modal', 'p0_root']);

      // Stack is now empty
      expect(triggerBack()).toBe(false);

      // Clean up unregisters (idempotent)
      unreg0();
      unreg10();
      unreg15();
      unreg20();
      unreg25();
      unreg30();
    });

    it('handles nested modal dismissal without prematurely closing parent document modal', () => {
      let isInvoiceModalOpen = true;
      let isItemSubModalOpen = true;
      let isDatePickerOpen = true;

      // Parent modal registered with priority 10
      const unregParent = registerBackHandler(() => {
        isInvoiceModalOpen = false;
        return true;
      }, 10);

      // Inner submodal registered with priority 20
      const unregSubModal = registerBackHandler(() => {
        isItemSubModalOpen = false;
        return true;
      }, 20);

      // Datepicker registered on top with priority 20 (most recent)
      const unregDatePicker = registerBackHandler(() => {
        isDatePickerOpen = false;
        return true;
      }, 20);

      // 1st back: closes Datepicker (p20 LIFO)
      triggerBack();
      expect(isDatePickerOpen).toBe(false);
      expect(isItemSubModalOpen).toBe(true);
      expect(isInvoiceModalOpen).toBe(true);

      // 2nd back: closes ItemSubModal (p20)
      triggerBack();
      expect(isItemSubModalOpen).toBe(false);
      expect(isInvoiceModalOpen).toBe(true);

      // 3rd back: closes parent InvoiceModal (p10)
      triggerBack();
      expect(isInvoiceModalOpen).toBe(false);

      unregParent();
      unregSubModal();
      unregDatePicker();
    });
  });

  describe('Audio & Barcode Feedback Invariants', () => {
    it('plays scan audio tones without throwing errors in Web Audio / headless environment', () => {
      expect(() => audioService.playScanSuccess()).not.toThrow();
      expect(() => audioService.playScanError()).not.toThrow();
    });
  });

  describe('Shared Billing Subcomponent State Invariants', () => {
    it('correctly calculates split notes across payment modes for billing docks', () => {
      const splits = [
        { id: '1', mode: 'CASH' as const, amount: 500 },
        { id: '2', mode: 'UPI' as const, amount: 1000 },
        { id: '3', mode: 'CREDIT' as const, amount: 250 },
      ];
      const notes = formatSplitNotes(splits, 250);
      expect(notes).toBe('Split Payment — Cash ₹500, Upi ₹1000, Credit ₹250.00');
    });

    it('correctly parses initial invoice payment splits for PaymentSettlementDock', () => {
      const mockInvoice: Partial<Invoice> = {
        grandTotal: 2500,
        paidAmount: 2000,
        balanceAmount: 500,
        paymentMode: 'SPLIT',
        paymentSplits: [
          { id: '1', mode: 'CASH', amount: 1000 },
          { id: '2', mode: 'CARD', amount: 1000 },
          { id: '3', mode: 'CREDIT', amount: 500 },
        ],
      };
      const splits = parseSplitsFromInvoice(mockInvoice as Invoice, 2500);
      expect(splits).toHaveLength(3);
      expect(splits[0].amount).toBe(1000);
      expect(splits[1].amount).toBe(1000);
      expect(splits[2].amount).toBe(500);
    });

    it('correctly parses initial purchase bill payment splits for PaymentSettlementDock', () => {
      const mockPurchase: Partial<PurchaseBill> = {
        grandTotal: 1500,
        paidAmount: 1500,
        balanceAmount: 0,
        paymentMode: 'NET_BANKING',
      };
      const splits = parseSplitsFromPurchase(mockPurchase as PurchaseBill, 1500);
      expect(splits).toHaveLength(1);
      expect(splits[0].mode).toBe('NET_BANKING');
      expect(splits[0].amount).toBe(1500);
    });
  });
});
