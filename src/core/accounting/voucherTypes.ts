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

  // --- Integer paise twins (Phase 3.2, derived from rupee fields; rupee remains authoritative) ---
  debitPaise?: number;
  creditPaise?: number;
}

export type PaymentAllocationDocumentType = 'INVOICE' | 'PURCHASE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';

export interface PaymentAllocation {
  documentType: PaymentAllocationDocumentType;
  documentId: string;
  documentNumber: string;
  amount: number;
  date?: string;

  // --- Integer paise twins (Phase 3.2, derived from rupee fields; rupee remains authoritative) ---
  amountPaise?: number;
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

  // --- Integer paise twins & schema marker (Phase 3.2, derived from rupee fields; rupee remains authoritative) ---
  paiseSchema?: number;
  __paiseSchema?: number;
  totalAmountPaise?: number;

  createdAt: string;
  isCancelled?: boolean;
  isReversed?: boolean;
  reversalVoucherId?: string;
  reversalOfVoucherId?: string;
  partyId?: string;
  partyName?: string;
  paymentAllocations?: PaymentAllocation[];
  allocationMode?: 'MANUAL' | 'AUTO_FIFO' | 'UNALLOCATED' | 'SOURCE_DOCUMENT';
  sourceDocumentType?: PaymentAllocationDocumentType;
  sourceDocumentId?: string;
  sourceDocumentNumber?: string;
}
