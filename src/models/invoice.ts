import type { UnitOfMeasurement } from './item.ts';

export type InvoiceType =
  | 'B2B'           // Registered business to registered business
  | 'B2CS'          // B2C Small (Inter-state <= 2.5 Lakhs or Intra-state any amount)
  | 'B2CL'          // B2C Large (Inter-state invoice > 2.5 Lakhs to unregistered)
  | 'EXPORT'        // Export with or without IGST payment
  | 'ESTIMATE'      // Non-tax quotation / estimate
  | 'DELIVERY_CHALLAN'
  | 'CREDIT_NOTE'   // Credit note issued to customer (GSTR-1 Table 9B CDNR/CDNUR)
  | 'DEBIT_NOTE';   // Debit note issued to customer (GSTR-1 Table 9B CDNR/CDNUR)

export type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'NET_BANKING' | 'CHEQUE' | 'CREDIT' | 'SPLIT' | 'BANK';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface PaymentSplit {
  id: string;
  mode: PaymentMode;
  amount: number;
}

export interface InvoiceItemEntry {
  id?: string;                        // Optional line-item identifier
  itemId: string;
  name: string;
  description?: string;
  hsnSacCode: string;
  hsnCode?: string;                   // Optional alias for hsnSacCode (GSTR Table 12 compatibility)
  unit: UnitOfMeasurement;
  quantity: number;
  unitPrice: number;
  pricePerUnit?: number;              // Optional alias for unitPrice
  mrp?: number;
  discountPercent?: number;
  discountAmount?: number;
  taxableAmount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessRate?: number;                  // Optional Cess rate percentage
  cessAmount: number;
  totalAmount: number;
  total?: number;                     // Optional alias for totalAmount
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  date: string;
  dueDate?: string;
  partyId?: string;
  partyName: string;
  partyGstin?: string;
  partyAddress: string;
  partyStateCode: string;
  placeOfSupplyStateCode: string;
  isIntraState: boolean;
  isGstInvoice?: boolean;

  items: InvoiceItemEntry[];

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
  amountInWords: string;

  paymentMode: PaymentMode;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  balanceAmount: number;
  paymentSplits?: PaymentSplit[];

  notes?: string;
  terms?: string;
  createdAt: string;
  updatedAt: string;

  // --- Extended GSTR Compliance & Filing Fields ---
  exportType?: 'WPAY' | 'WOPAY';              // Export with payment ('WPAY') or without payment ('WOPAY') of tax (Table 6A)
  shippingBillNumber?: string;                 // Shipping bill / Bill of export number (Table 6A)
  shippingBillDate?: string;                   // Shipping bill date (YYYY-MM-DD or DD-MM-YYYY) (Table 6A)
  originalInvoiceNumber?: string;              // Referenced invoice number for Credit/Debit notes (Table 9B)
  originalInvoiceDate?: string;                // Referenced invoice date for Credit/Debit notes (Table 9B)
  noteType?: 'C' | 'D';                        // 'C' = Credit Note, 'D' = Debit Note (Table 9B)
  isRcm?: boolean;                             // Reverse Charge Mechanism flag (Table 4 / Table 3.1(d))
  isCancelled?: boolean;                       // Document cancelled status flag (Table 13 doc_issue)
}
