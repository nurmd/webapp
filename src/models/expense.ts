export type ExpenseCategory =
  | 'Rent & Utilities'
  | 'Electricity & Water'
  | 'Transport & Logistics'
  | 'Salaries & Wages'
  | 'Packaging & Courier'
  | 'Repairs & Maintenance'
  | 'Tea, Coffee & Refreshments'
  | 'Marketing & Advertising'
  | 'Software & Telecom'
  | 'General Operational';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
  taxableAmount: number;
  gstRate: number; // e.g. 0, 5, 12, 18, 28
  taxAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  date: string;
  paymentMode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CREDIT_CARD';
  vendorName?: string;
  vendorGstin?: string;
  voucherNumber?: string;
  notes?: string;
  itcEligible: boolean; // Input Tax Credit eligibility
  createdAt: string;
}
