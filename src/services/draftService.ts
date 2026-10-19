import { Party } from '../models/party.ts';
import { InvoiceType, PaymentSplit } from '../models/invoice.ts';
import { GridRow } from '../components/Invoicing/TableGridInvoiceModal.tsx';
import { PurchaseGridRow } from '../components/Purchases/components/PurchaseLineItemsGrid.tsx';
import { ItcEligibility } from '../models/purchase.ts';

export interface InvoiceDraft {
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  selectedParty?: Party | null;
  posStateCode?: string;
  manualInvoiceType?: InvoiceType | null;
  isRcm?: boolean;
  overallDiscountPercent?: number;
  shippingAmount?: number;
  shippingAddress?: string;
  shippingPincode?: string;
  rows: GridRow[];
  updatedAt: string;
}

export interface PurchaseDraft {
  billNumber?: string;
  billDate?: string;
  dueDate?: string;
  selectedSupplier?: Party | null;
  supplierStateCode?: string;
  itcEligibility?: ItcEligibility;
  isRcm?: boolean;
  shippingAmount?: number;
  rows: PurchaseGridRow[];
  paymentSplits?: PaymentSplit[];
  updatedAt: string;
}

const INVOICE_DRAFT_KEY = 'gst_draft_new_invoice';
const PURCHASE_DRAFT_KEY = 'gst_draft_new_purchase';

export const draftService = {
  /**
   * Evaluates whether an invoice draft has user-entered content
   */
  isInvoiceDraftNotEmpty(draft: Partial<InvoiceDraft> | null | undefined): boolean {
    if (!draft) return false;
    if (draft.selectedParty) return true;
    if (
      Array.isArray(draft.rows) &&
      draft.rows.some(
        (r) =>
          (r.name && r.name.trim().length > 0) ||
          (Number(r.quantity) > 0 && Number(r.unitPrice || 0) > 0)
      )
    ) {
      return true;
    }
    if (Number(draft.shippingAmount || 0) > 0 || Number(draft.overallDiscountPercent || 0) > 0) {
      return true;
    }
    return false;
  },

  /**
   * Save invoice draft to persistent storage
   */
  saveInvoiceDraft(draft: Omit<InvoiceDraft, 'updatedAt'>): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    if (!this.isInvoiceDraftNotEmpty(draft)) {
      this.clearInvoiceDraft();
      return;
    }
    try {
      const payload: InvoiceDraft = {
        ...draft,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(INVOICE_DRAFT_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('[DraftService] Failed to save invoice draft:', e);
    }
  },

  /**
   * Retrieve active invoice draft
   */
  getInvoiceDraft(): InvoiceDraft | null {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(INVOICE_DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (this.isInvoiceDraftNotEmpty(parsed)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Clear invoice draft
   */
  clearInvoiceDraft(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(INVOICE_DRAFT_KEY);
    } catch {}
  },

  /**
   * Check if invoice draft exists
   */
  hasInvoiceDraft(): boolean {
    return this.getInvoiceDraft() !== null;
  },

  /**
   * Evaluates whether a purchase draft has user-entered content
   */
  isPurchaseDraftNotEmpty(draft: Partial<PurchaseDraft> | null | undefined): boolean {
    if (!draft) return false;
    if (draft.selectedSupplier) return true;
    if (
      Array.isArray(draft.rows) &&
      draft.rows.some(
        (r) =>
          (r.name && r.name.trim().length > 0) ||
          (Number(r.quantity) > 0 && Number(r.unitPrice || 0) > 0)
      )
    ) {
      return true;
    }
    if (Number(draft.shippingAmount || 0) > 0) return true;
    return false;
  },

  /**
   * Save purchase draft to persistent storage
   */
  savePurchaseDraft(draft: Omit<PurchaseDraft, 'updatedAt'>): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    if (!this.isPurchaseDraftNotEmpty(draft)) {
      this.clearPurchaseDraft();
      return;
    }
    try {
      const payload: PurchaseDraft = {
        ...draft,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(PURCHASE_DRAFT_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('[DraftService] Failed to save purchase draft:', e);
    }
  },

  /**
   * Retrieve active purchase draft
   */
  getPurchaseDraft(): PurchaseDraft | null {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(PURCHASE_DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (this.isPurchaseDraftNotEmpty(parsed)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Clear purchase draft
   */
  clearPurchaseDraft(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(PURCHASE_DRAFT_KEY);
    } catch {}
  },

  /**
   * Check if purchase draft exists
   */
  hasPurchaseDraft(): boolean {
    return this.getPurchaseDraft() !== null;
  },
};
