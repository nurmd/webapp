import type { UnitOfMeasurement } from './item.ts';
import type { PaymentMode, PaymentStatus, PaymentSplit } from './invoice.ts';

export type ItcEligibility =
  | 'ELIGIBLE_INPUTS'           // GSTR-3B Table 4(A)(5) - Inputs
  | 'ELIGIBLE_CAPITAL_GOODS'    // GSTR-3B Table 4(A)(5) - Capital goods
  | 'ELIGIBLE_SERVICES'         // GSTR-3B Table 4(A)(5) - Input services
  | 'ALL_OTHER_ITC'             // GSTR-3B Table 4(A)(5) - All other ITC
  | 'IMPORT_GOODS'              // GSTR-3B Table 4(A)(1) - Import of goods
  | 'IMPORT_SERVICES'           // GSTR-3B Table 4(A)(2) - Import of services
  | 'INELIGIBLE_17_5'           // GSTR-3B Table 4(D)(1) - Ineligible under Section 17(5)
  | 'INELIGIBLE_OTHERS';        // GSTR-3B Table 4(D)(2) - Ineligible others

export interface PurchaseItemEntry {
  id?: string;
  itemId?: string;
  name: string;
  description?: string;
  hsnSacCode: string;
  hsnCode?: string;                   // Optional alias for hsnSacCode
  unit: UnitOfMeasurement;
  quantity: number;
  unitPrice: number;
  pricePerUnit?: number;              // Optional alias for unitPrice
  discountPercent?: number;
  discountAmount?: number;
  taxableAmount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessRate?: number;
  cessAmount: number;
  totalAmount: number;
  total?: number;                     // Optional alias for totalAmount
}

export interface PurchaseBill {
  id: string;
  billNumber: string;
  date: string;
  dueDate?: string;
  supplierId: string;
  supplierName: string;
  supplierGstin?: string;
  supplierAddress: string;
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
  isIntraState: boolean;

  items: PurchaseItemEntry[];

  itcEligibility: ItcEligibility;
  isRcm: boolean; // Reverse Charge Mechanism

  totalGrossAmount: number;
  totalDiscount: number;
  totalTaxableAmount: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  totalTax: number;
  roundOff: number;
  shippingAmount?: number;
  grandTotal: number;

  paymentMode: PaymentMode;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  balanceAmount: number;
  paymentSplits?: PaymentSplit[];

  notes?: string;
  createdAt: string;
  updatedAt: string;

  // --- Extended GSTR Compliance & Filing Fields ---
  originalBillNumber?: string;                 // For Supplier Credit/Debit notes
  originalBillDate?: string;                   // For Supplier Credit/Debit notes
  noteType?: 'C' | 'D';                        // 'C' (Supplier Credit Note) | 'D' (Debit Note)
  isCancelled?: boolean;                       // Cancelled purchase flag
  importType?: 'GOODS' | 'SERVICES';           // Import classification
}
