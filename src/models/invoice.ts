import { UnitOfMeasurement } from './item.ts';

export type InvoiceType =
  | 'B2B'           // Registered business to registered business
  | 'B2CS'          // B2C Small (Inter-state <= 2.5 Lakhs or Intra-state any amount)
  | 'B2CL'          // B2C Large (Inter-state invoice > 2.5 Lakhs to unregistered)
  | 'EXPORT'        // Export with or without IGST payment
  | 'ESTIMATE'      // Non-tax quotation / estimate
  | 'DELIVERY_CHALLAN';

export type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'NET_BANKING' | 'CHEQUE' | 'CREDIT';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface InvoiceItemEntry {
  itemId: string;
  name: string;
  hsnSacCode: string;
  unit: UnitOfMeasurement;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  taxableAmount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalAmount: number;
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
  grandTotal: number;
  amountInWords: string;

  paymentMode: PaymentMode;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  balanceAmount: number;

  notes?: string;
  terms?: string;
  createdAt: string;
  updatedAt: string;
}
