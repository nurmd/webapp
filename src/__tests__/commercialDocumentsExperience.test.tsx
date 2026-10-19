import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Party } from '../models/party.ts';
import { draftService, getInvoiceDraftKey, getPurchaseDraftKey } from '../services/draftService.ts';
import { InvoiceHeaderMeta } from '../components/Invoicing/components/InvoiceHeaderMeta.tsx';
import { InvoiceActionDock } from '../components/Invoicing/components/InvoiceActionDock.tsx';
import { PurchaseHeaderMeta } from '../components/Purchases/components/PurchaseHeaderMeta.tsx';
import { PurchaseActionDock } from '../components/Purchases/components/PurchaseActionDock.tsx';

// Setup Mock Storage
class MockStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const mockStorage = new MockStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
  configurable: true,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  });
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockCustomer: Party = {
  id: 'c1',
  name: 'Test Client',
  type: 'CUSTOMER',
  phone: '9876543210',
  stateCode: '27',
  billingAddress: '123 Market St',
  currentBalance: 0,
  createdAt: '',
  updatedAt: '',
};

const mockSupplier: Party = {
  id: 's1',
  name: 'Apex Vendor',
  type: 'SUPPLIER',
  phone: '9876543211',
  stateCode: '27',
  billingAddress: '456 Industrial Area',
  currentBalance: 0,
  createdAt: '',
  updatedAt: '',
};

describe('Commercial Documents Dedicated Experience & Scoped Drafts', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    mockStorage.clear();
  });

  describe('1. Scoped Draft Keys & Isolation', () => {
    it('returns document-specific storage keys', () => {
      expect(getInvoiceDraftKey()).toBe('gst_draft_new_invoice');
      expect(getInvoiceDraftKey('B2B')).toBe('gst_draft_new_invoice');
      expect(getInvoiceDraftKey('SALES_ORDER')).toBe('gst_draft_sales_order');
      expect(getInvoiceDraftKey('CREDIT_NOTE')).toBe('gst_draft_credit_note');
      expect(getInvoiceDraftKey('DEBIT_NOTE')).toBe('gst_draft_debit_note');
      expect(getInvoiceDraftKey('ESTIMATE')).toBe('gst_draft_quotation');

      expect(getPurchaseDraftKey()).toBe('gst_draft_new_purchase');
      expect(getPurchaseDraftKey('BILL')).toBe('gst_draft_new_purchase');
      expect(getPurchaseDraftKey('PO')).toBe('gst_draft_purchase_order');
      expect(getPurchaseDraftKey('RETURN')).toBe('gst_draft_purchase_return');
    });

    it('isolates Sales Order draft from regular Invoice draft', () => {
      // 1. Save standard invoice draft
      draftService.saveInvoiceDraft({
        invoiceNumber: 'INV-100',
        rows: [{ itemId: 'item1', name: 'Standard Product', hsnSacCode: '1001', quantity: 1, unit: 'NOS', unitPrice: 500, discountPercent: 0, gstRate: 18 }],
      }, 'B2B');

      // 2. Save sales order draft
      draftService.saveInvoiceDraft({
        invoiceNumber: 'SO-200',
        orderStatus: 'PENDING',
        rows: [{ itemId: 'item2', name: 'Order Booking Item', hsnSacCode: '2002', quantity: 5, unit: 'NOS', unitPrice: 2000, discountPercent: 0, gstRate: 18 }],
      }, 'SALES_ORDER');

      // 3. Verify retrieval is completely scoped
      const invDraft = draftService.getInvoiceDraft('B2B');
      const soDraft = draftService.getInvoiceDraft('SALES_ORDER');

      expect(invDraft?.invoiceNumber).toBe('INV-100');
      expect(invDraft?.rows[0].name).toBe('Standard Product');

      expect(soDraft?.invoiceNumber).toBe('SO-200');
      expect(soDraft?.rows[0].name).toBe('Order Booking Item');
      expect(soDraft?.orderStatus).toBe('PENDING');

      // 4. Clearing sales order draft does not affect standard invoice draft
      draftService.clearInvoiceDraft('SALES_ORDER');
      expect(draftService.hasInvoiceDraft('SALES_ORDER')).toBe(false);
      expect(draftService.hasInvoiceDraft('B2B')).toBe(true);
    });

    it('isolates Purchase Order draft from Purchase Return (Debit Note) draft', () => {
      draftService.savePurchaseDraft({
        billNumber: 'PO-300',
        orderStatus: 'PENDING',
        rows: [{ itemId: 'p1', name: 'Raw Material PO', hsnSacCode: '3003', quantity: 10, unit: 'KG', unitPrice: 100, discountPercent: 0, gstRate: 18 }],
      }, 'PO');

      draftService.savePurchaseDraft({
        billNumber: 'DN-400',
        originalBillNumber: 'PB-999',
        returnReason: '01-Defective Goods',
        rows: [{ itemId: 'p2', name: 'Damaged Goods Return', hsnSacCode: '4004', quantity: 2, unit: 'NOS', unitPrice: 100, discountPercent: 0, gstRate: 18 }],
      }, 'RETURN');

      const poDraft = draftService.getPurchaseDraft('PO');
      const retDraft = draftService.getPurchaseDraft('RETURN');

      expect(poDraft?.billNumber).toBe('PO-300');
      expect(poDraft?.rows[0].name).toBe('Raw Material PO');

      expect(retDraft?.billNumber).toBe('DN-400');
      expect(retDraft?.originalBillNumber).toBe('PB-999');
      expect(retDraft?.returnReason).toBe('01-Defective Goods');
      expect(retDraft?.rows[0].name).toBe('Damaged Goods Return');
    });
  });

  describe('2. Sales Order Visual Presentation & Fields', () => {
    it('renders dedicated Sales Order title, badge, delivery label, and order status in InvoiceHeaderMeta', () => {
      act(() => {
        root.render(
          <InvoiceHeaderMeta
            onClose={() => {}}
            invoiceNumber="SO-001"
            invoiceDate="2026-10-19"
            dueDate="2026-10-30"
            posStateCode="27"
            isGstActive={true}
            isIntraState={true}
            selectedParty={mockCustomer}
            currentConflict={null}
            invoiceConflictError={null}
            allInvoices={[]}
            onSelectPartyClick={() => {}}
            onClearParty={() => {}}
            onAddPartyClick={() => {}}
            onOpenInvoiceNumberModal={() => {}}
            onOpenDueDateModal={() => {}}
            onAutoFixConflict={() => {}}
            invoiceType="SALES_ORDER"
            orderStatus="PENDING"
          />
        );
      });

      // Distinct Title and Badge
      expect(container.textContent).toContain('New Sales Order');
      expect(container.textContent).toContain('Sales Order');

      // Delivery Date Label
      expect(container.textContent).toContain('Delivery:');

      // Order Status Badge
      expect(container.textContent).toContain('Status: PENDING');
    });

    it('renders dedicated Sales Order action buttons and labels in InvoiceActionDock', () => {
      act(() => {
        root.render(
          <InvoiceActionDock
            finalGrandTotal={15000}
            onSaveAndPrint={() => {}}
            onSaveInvoice={() => {}}
            onPayAndSave={() => {}}
            invoiceType="SALES_ORDER"
          />
        );
      });

      // Label and Buttons
      expect(container.textContent).toContain('Total Order Value');
      expect(container.textContent).toContain('Save Sales Order');
      expect(container.textContent).toContain('Advance & Save');
    });
  });

  describe('3. Sales Return (Credit Note) Visual Presentation & Fields', () => {
    it('renders Credit Note title, badge, and original invoice return fields in InvoiceHeaderMeta', () => {
      let origInv = 'INV-456';
      let origDate = '2026-10-10';
      let reason = '01-Sales Return';

      act(() => {
        root.render(
          <InvoiceHeaderMeta
            onClose={() => {}}
            invoiceNumber="CN-001"
            invoiceDate="2026-10-19"
            dueDate="2026-10-19"
            posStateCode="27"
            isGstActive={true}
            isIntraState={true}
            selectedParty={mockCustomer}
            currentConflict={null}
            invoiceConflictError={null}
            allInvoices={[]}
            onSelectPartyClick={() => {}}
            onClearParty={() => {}}
            onAddPartyClick={() => {}}
            onOpenInvoiceNumberModal={() => {}}
            onOpenDueDateModal={() => {}}
            onAutoFixConflict={() => {}}
            invoiceType="CREDIT_NOTE"
            originalInvoiceNumber={origInv}
            onOriginalInvoiceNumberChange={(v) => { origInv = v; }}
            originalInvoiceDate={origDate}
            onOriginalInvoiceDateChange={(v) => { origDate = v; }}
            returnReason={reason}
            onReturnReasonChange={(v) => { reason = v; }}
          />
        );
      });

      // Title & Badge
      expect(container.textContent).toContain('New Sales Return (Credit Note)');
      expect(container.textContent).toContain('Credit Note (Return)');

      // Return Reference fields
      expect(container.textContent).toContain('Orig Inv #:');
      const origInvInput = container.querySelector('input[placeholder="e.g. INV-001"]') as HTMLInputElement;
      expect(origInvInput).not.toBeNull();
      expect(origInvInput.value).toBe('INV-456');

      expect(container.textContent).toContain('Orig Date:');
      expect(container.textContent).toContain('Reason:');
    });

    it('renders dedicated Credit Note action buttons and labels in InvoiceActionDock', () => {
      act(() => {
        root.render(
          <InvoiceActionDock
            finalGrandTotal={4200}
            onSaveAndPrint={() => {}}
            onSaveInvoice={() => {}}
            onPayAndSave={() => {}}
            invoiceType="CREDIT_NOTE"
          />
        );
      });

      expect(container.textContent).toContain('Total Return Value');
      expect(container.textContent).toContain('Save Credit Note');
      expect(container.textContent).toContain('Refund & Save');
    });
  });

  describe('4. Purchase Order Visual Presentation & Fields', () => {
    it('renders dedicated Purchase Order title, badge, expected delivery label, and order status in PurchaseHeaderMeta', () => {
      act(() => {
        root.render(
          <PurchaseHeaderMeta
            onClose={() => {}}
            isEditing={false}
            purchaseType="PO"
            selectedSupplier={mockSupplier}
            billNumber="PO-101"
            billDate="2026-10-19"
            dueDate="2026-11-05"
            supplierStateCode="27"
            itcEligibility="ELIGIBLE_INPUTS"
            isGstActive={true}
            onSelectSupplierClick={() => {}}
            onAddSupplierClick={() => {}}
            onClearSupplier={() => {}}
            onOpenBillNoModal={() => {}}
            onOpenDueDateModal={() => {}}
            orderStatus="PENDING"
          />
        );
      });

      // Distinct Header
      expect(container.textContent).toContain('New Purchase Order');
      expect(container.textContent).toContain('Purchase Order');

      // Distinct Pills
      expect(container.textContent).toContain('PO #:');
      expect(container.textContent).toContain('Expected:');
      expect(container.textContent).toContain('Status: PENDING');
    });

    it('renders dedicated Purchase Order action dock buttons and total label in PurchaseActionDock', () => {
      act(() => {
        root.render(
          <PurchaseActionDock
            finalGrandTotal={78000}
            onClose={() => {}}
            onSaveBill={() => {}}
            purchaseType="PO"
          />
        );
      });

      expect(container.textContent).toContain('Total Order Value');
      expect(container.textContent).toContain('Save Purchase Order');
    });
  });

  describe('5. Purchase Return (Debit Note) Visual Presentation & Fields', () => {
    it('renders Debit Note title, badge, and original bill return fields in PurchaseHeaderMeta', () => {
      let origBill = 'PB-888';
      let origDate = '2026-10-01';
      let reason = '01-Defective Goods';

      act(() => {
        root.render(
          <PurchaseHeaderMeta
            onClose={() => {}}
            isEditing={false}
            purchaseType="RETURN"
            selectedSupplier={mockSupplier}
            billNumber="DN-202"
            billDate="2026-10-19"
            dueDate="2026-10-19"
            supplierStateCode="27"
            itcEligibility="ELIGIBLE_INPUTS"
            isGstActive={true}
            onSelectSupplierClick={() => {}}
            onAddSupplierClick={() => {}}
            onClearSupplier={() => {}}
            onOpenBillNoModal={() => {}}
            onOpenDueDateModal={() => {}}
            originalBillNumber={origBill}
            onOriginalBillNumberChange={(v) => { origBill = v; }}
            originalBillDate={origDate}
            onOriginalBillDateChange={(v) => { origDate = v; }}
            returnReason={reason}
            onReturnReasonChange={(v) => { reason = v; }}
          />
        );
      });

      // Distinct Header
      expect(container.textContent).toContain('New Purchase Return (Debit Note)');
      expect(container.textContent).toContain('Debit Note (Return)');

      // Return Reference fields
      expect(container.textContent).toContain('DN #:');
      expect(container.textContent).toContain('Orig Bill #:');
      const origBillInput = container.querySelector('input[placeholder="e.g. PB-001"]') as HTMLInputElement;
      expect(origBillInput).not.toBeNull();
      expect(origBillInput.value).toBe('PB-888');

      expect(container.textContent).toContain('Orig Date:');
    });

    it('renders dedicated Debit Note action dock buttons and total label in PurchaseActionDock', () => {
      act(() => {
        root.render(
          <PurchaseActionDock
            finalGrandTotal={6500}
            onClose={() => {}}
            onSaveBill={() => {}}
            purchaseType="RETURN"
          />
        );
      });

      expect(container.textContent).toContain('Total Return Value');
      expect(container.textContent).toContain('Save Debit Note');
    });
  });
});
