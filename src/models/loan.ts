export type LoanType =
  | 'TERM_LOAN'
  | 'WORKING_CAPITAL'
  | 'VEHICLE_LOAN'
  | 'EQUIPMENT_LOAN'
  | 'PERSONAL_LOAN'
  | 'DIRECTOR_LOAN'
  | 'OTHER_BORROWING';

export type LoanStatus = 'ACTIVE' | 'CLOSED' | 'OVERDUE';

export interface LoanAccount {
  id: string;
  lenderName: string; // e.g. "HDFC Bank", "SBI Term Loan", "Director / Promoter"
  accountNumber?: string;
  loanType: LoanType;
  sanctionAmount: number; // Original principal
  disbursedDate: string; // YYYY-MM-DD
  interestRateAnnual: number; // e.g. 10.5 for 10.5%
  tenorMonths: number; // e.g. 36
  emiAmount?: number;
  currentPrincipalOutstanding: number;
  collateralDetails?: string;
  status: LoanStatus;
  createdAt: string;
  updatedAt: string;
}

export type LoanTxnType = 'DISBURSEMENT' | 'EMI_PAYMENT' | 'PREPAYMENT' | 'CHARGES';

export interface LoanTransaction {
  id: string;
  loanId: string;
  date: string;
  type: LoanTxnType;
  principalPaid: number;
  interestPaid: number;
  chargesPaid?: number;
  totalAmount: number;
  paymentMode: string;
  bankAccountId?: string;
  referenceNo?: string;
  notes?: string;
  remainingPrincipal: number;
  createdAt: string;
}
