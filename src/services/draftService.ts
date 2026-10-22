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
  originalInvoiceNumber?: string;
  originalInvoiceDate?: string;
  returnReason?: string;
  orderStatus?: string;
  challanStatus?: 'DRAFT' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  challanType?: 'SUPPLY_ON_APPROVAL' | 'JOB_WORK' | 'FOR_REMOVAL' | 'OTHERS';
  consigneeName?: string;
  vehicleNumber?: string;
  transporterName?: string;
  transporterId?: string;
  ewayBillNumber?: string;
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
  originalBillNumber?: string;
  originalBillDate?: string;
  returnReason?: string;
  orderStatus?: string;
  challanStatus?: 'DRAFT' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  challanType?: 'SUPPLY_ON_APPROVAL' | 'JOB_WORK' | 'FOR_REMOVAL' | 'OTHERS';
  consigneeName?: string;
  vehicleNumber?: string;
  transporterName?: string;
  transporterId?: string;
  ewayBillNumber?: string;
}

export const getInvoiceDraftKey = (docType?: string | null): string => {
  if (docType === 'SALES_ORDER') return 'gst_draft_sales_order';
  if (docType === 'CREDIT_NOTE') return 'gst_draft_credit_note';
  if (docType === 'DEBIT_NOTE') return 'gst_draft_debit_note';
  if (docType === 'ESTIMATE') return 'gst_draft_quotation';
  if (docType === 'DELIVERY_CHALLAN') return 'gst_draft_delivery_challan';
  return 'gst_draft_new_invoice';
};

export const getPurchaseDraftKey = (docType?: string | null): string => {
  if (docType === 'PO') return 'gst_draft_purchase_order';
  if (docType === 'RETURN') return 'gst_draft_purchase_return';
  return 'gst_draft_new_purchase';
};

export const draftService = {
  /**
   * Evaluates whether an invoice draft has user-entered content
   */
  isInvoiceDraftNotEmpty(draft: Partial<InvoiceDraft> | null | undefined): boolean {
    if (!draft) return false;
    if (draft.selectedParty) return true;
    if (draft.originalInvoiceNumber && draft.originalInvoiceNumber.trim().length > 0) return true;
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
  saveInvoiceDraft(draft: Omit<InvoiceDraft, 'updatedAt'>, docType?: string | null): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const key = getInvoiceDraftKey(docType || draft.manualInvoiceType);
    if (!this.isInvoiceDraftNotEmpty(draft)) {
      this.clearInvoiceDraft(docType || draft.manualInvoiceType);
      return;
    }
    try {
      const payload: InvoiceDraft = {
        ...draft,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      console.warn('[DraftService] Failed to save invoice draft:', e);
    }
  },

  /**
   * Retrieve active invoice draft
   */
  getInvoiceDraft(docType?: string | null): InvoiceDraft | null {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    const key = getInvoiceDraftKey(docType);
    try {
      const raw = localStorage.getItem(key);
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
  clearInvoiceDraft(docType?: string | null): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const key = getInvoiceDraftKey(docType);
    try {
      localStorage.removeItem(key);
    } catch {}
  },

  /**
   * Check if invoice draft exists
   */
  hasInvoiceDraft(docType?: string | null): boolean {
    return this.getInvoiceDraft(docType) !== null;
  },

  /**
   * Evaluates whether a purchase draft has user-entered content
   */
  isPurchaseDraftNotEmpty(draft: Partial<PurchaseDraft> | null | undefined): boolean {
    if (!draft) return false;
    if (draft.selectedSupplier) return true;
    if (draft.originalBillNumber && draft.originalBillNumber.trim().length > 0) return true;
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
  savePurchaseDraft(draft: Omit<PurchaseDraft, 'updatedAt'>, docType?: string | null): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const key = getPurchaseDraftKey(docType);
    if (!this.isPurchaseDraftNotEmpty(draft)) {
      this.clearPurchaseDraft(docType);
      return;
    }
    try {
      const payload: PurchaseDraft = {
        ...draft,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      console.warn('[DraftService] Failed to save purchase draft:', e);
    }
  },

  /**
   * Retrieve active purchase draft
   */
  getPurchaseDraft(docType?: string | null): PurchaseDraft | null {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    const key = getPurchaseDraftKey(docType);
    try {
      const raw = localStorage.getItem(key);
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
  clearPurchaseDraft(docType?: string | null): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const key = getPurchaseDraftKey(docType);
    try {
      localStorage.removeItem(key);
    } catch {}
  },

  /**
   * Check if purchase draft exists
   */
  hasPurchaseDraft(docType?: string | null): boolean {
    return this.getPurchaseDraft(docType) !== null;
  },
};
