export type DocumentSeriesType =
  | 'SALES_INVOICE'    // Standard B2B / B2C Tax Invoice
  | 'POS_INVOICE'      // Retail POS / Counter Cash Memo
  | 'ESTIMATE'         // Quotation / Proforma / Estimate
  | 'SALES_ORDER'      // Sales Order
  | 'DELIVERY_CHALLAN' // Delivery Challan / Job Work
  | 'CREDIT_NOTE'      // Credit Note (GST Table 9B)
  | 'DEBIT_NOTE'       // Debit Note (GST Table 9B)
  | 'PURCHASE_BILL'    // Purchase Invoices
  | 'PURCHASE_ORDER'   // Purchase Order
  | 'PURCHASE_CHALLAN' // Inward Goods Receipt / Purchase Challan
  | 'PAYMENT_RECEIPT'   // Cash / Bank Receipt Voucher (Payment In)
  | 'PAYMENT_VOUCHER';   // Cash / Bank Payment Voucher (Payment Out)

export type SeriesYearFormat = 'NONE' | 'YYYY' | 'YY_YY';
export type SeriesSeparator = '-' | '/' | '.' | '';

export interface DocumentSeriesConfig {
  prefix: string;                       // e.g. "INV", "POS", "EST", "CN", "DN", "DC", "PUR", "REC"
  separator: SeriesSeparator;           // "-", "/", ".", ""
  yearFormat: SeriesYearFormat;         // NONE ("INV-0001"), YYYY ("INV-2026-0001"), YY_YY ("INV/26-27/0001")
  paddingDigits: number;                // 3, 4, 5, 6 (default 4)
  startingNumber: number;               // 1, 101, 1001, etc.
}

export type DocumentSeriesSettings = Partial<Record<DocumentSeriesType, DocumentSeriesConfig>>;

export interface CompanyProfile {
  id: string;
  businessName: string;
  tradeName?: string;
  gstin: string;
  pan: string;
  stateCode: string;
  address: string;
  pincode: string;
  city?: string;
  phone: string;
  email: string;
  website?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branchName?: string;
  upiId?: string;
  termsAndConditions?: string;
  invoicePrefix?: string;
  documentSeries?: DocumentSeriesSettings;
  logoUrl?: string;
  isGstEnabled?: boolean;
  isCompositionScheme?: boolean;
}

