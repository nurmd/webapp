export type VoucherType =
  | 'SALES'
  | 'PURCHASE'
  | 'PAYMENT'
  | 'RECEIPT'
  | 'CONTRA'
  | 'JOURNAL'
  | 'DEBIT_NOTE'
  | 'CREDIT_NOTE';

export interface LedgerAccount {
  id: string;
  name: string;
  group:
    | 'Sundry Debtors'
    | 'Sundry Creditors'
    | 'Sales Accounts'
    | 'Purchase Accounts'
    | 'Bank Accounts'
    | 'Cash-in-hand'
    | 'Duties & Taxes'
    | 'Direct Expenses'
    | 'Indirect Expenses'
    | 'Direct Incomes'
    | 'Indirect Incomes'
    | 'Capital Account';
  openingBalance: number;
  currentBalance: number;
}

export interface JournalEntryLine {
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  narration?: string;
}

export interface Voucher {
  id: string;
  voucherNumber: string;
  voucherType: VoucherType;
  date: string;
  referenceNo?: string;
  entries: JournalEntryLine[];
  narration: string;
  totalAmount: number;
  createdAt: string;
}
