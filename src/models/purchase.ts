import { UnitOfMeasurement } from './item.ts';
import { PaymentMode, PaymentStatus } from './invoice.ts';

export type ItcEligibility =
  | 'ELIGIBLE_INPUTS'
  | 'ELIGIBLE_CAPITAL_GOODS'
  | 'ELIGIBLE_SERVICES'
  | 'INELIGIBLE_17_5';

export interface PurchaseItemEntry {
  itemId?: string;
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

  notes?: string;
  createdAt: string;
  updatedAt: string;
}
