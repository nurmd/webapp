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
  utgstAmount?: number;
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
  totalUtgst?: number;
  isUtgst?: boolean;
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
  purchaseType?: 'BILL' | 'PO' | 'RETURN' | 'CHALLAN'; // 'BILL' = Inward Bill, 'PO' = Purchase Order, 'RETURN' = Purchase Return / Debit Note, 'CHALLAN' = Inward Purchase Challan (GRN)
  orderStatus?: 'PENDING' | 'FULFILLED' | 'CANCELLED'; // For Purchase Orders
  challanStatus?: 'RECEIVED' | 'IN_TRANSIT' | 'DRAFT' | 'CANCELLED'; // For Purchase Challans
  challanType?: string;                        // Optional classification e.g. Regular Inward, Job Work Return, Branch Transfer, Sample
  challanNumber?: string;                      // Optional supplier/delivery challan ref number
  lrNumber?: string;                           // Lorry Receipt / Consignment Note No.
  lrDate?: string;                             // Lorry Receipt Date
  vehicleNumber?: string;                      // Delivery Vehicle Number
  transporterName?: string;                    // Transporter / Courier Name
  ewayBillNumber?: string;                     // E-Way Bill Number
  receivedDate?: string;                       // Date goods received at warehouse/store
  receivedBy?: string;                         // Person / staff receiving goods
  returnReason?: string;                       // Reason for Return / Debit Note (e.g. Defective Goods, Rate Difference)
  originalBillNumber?: string;                 // For Supplier Credit/Debit notes
  originalBillDate?: string;                   // For Supplier Credit/Debit notes
  noteType?: 'C' | 'D';                        // 'C' (Supplier Credit Note) | 'D' (Debit Note)
  isCancelled?: boolean;                       // Cancelled purchase flag
  importType?: 'GOODS' | 'SERVICES';           // Import classification

  // --- Document Conversion & Flow Tracking ---
  isConverted?: boolean;                       // True if this PO or Challan has been converted into a Purchase Bill
  convertedToBillId?: string;                  // Resulting Purchase Bill ID
  convertedToBillNumber?: string;              // Resulting Purchase Bill Number (e.g. PUR-001)
  convertedFromPoId?: string;                  // Source PO ID
  convertedFromPoNumber?: string;              // Source PO Number
  convertedFromChallanId?: string;             // Source Purchase Challan ID
  convertedFromChallanNumber?: string;         // Source Purchase Challan Number
}
