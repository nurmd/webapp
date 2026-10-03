export type BankAccountType = 'CASH' | 'BANK';

export interface BankAccount {
  id: string;
  accountName: string; // e.g. "Cash in Hand", "State Bank of India (Current A/C)", "HDFC Bank"
  accountType: BankAccountType; // 'CASH' or 'BANK'
  bankName?: string; // e.g. "State Bank of India"
  accountNumber?: string; // e.g. "32109876543"
  ifscCode?: string; // e.g. "SBIN0001234"
  branchName?: string; // e.g. "Shivaji Nagar, Pune"
  upiId?: string; // e.g. "bharatinfotech@sbi"
  openingBalance: number;
  openingBalanceDate?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CashBankTxnType =
  | 'DEPOSIT'       // Cash deposited to Bank (Cash - / Bank +)
  | 'WITHDRAWAL'    // Cash withdrawn from Bank (Bank - / Cash +)
  | 'TRANSFER'      // Bank to Bank transfer (Bank A - / Bank B +)
  | 'ADD_MONEY'     // Direct Inflow to Cash or Bank (Capital, Loan, Refund)
  | 'REDUCE_MONEY'; // Direct Outflow from Cash or Bank (Drawings, Bank Charges)

export interface CashBankTransaction {
  id: string;
  txnNumber: string; // e.g. "TXN-2026-001"
  date: string;
  type: CashBankTxnType;
  fromAccountId?: string; // Account ID money was deducted from (or 'ACC_CASH')
  toAccountId?: string;   // Account ID money was added to (or 'ACC_CASH')
  amount: number;
  referenceNo?: string;   // Cheque no, UTR, UPI Ref
  description: string;
  createdAt: string;
}

export interface UnifiedLedgerEntry {
  id: string;
  date: string;
  type: 'SALE' | 'PURCHASE' | 'EXPENSE' | 'PARTY_RECEIPT' | 'PARTY_PAYMENT' | 'CONTRA' | 'DIRECT_IN' | 'DIRECT_OUT';
  category: 'CASH' | 'BANK';
  accountId: string;
  accountName: string;
  counterpartyOrTitle: string;
  referenceNo?: string;
  mode: string;
  flow: 'IN' | 'OUT';
  amount: number;
  runningBalance?: number;
  description?: string;
}
