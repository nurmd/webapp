export type PartyType = 'CUSTOMER' | 'SUPPLIER';

export type BalanceType = 'TO_RECEIVE' | 'TO_PAY'; // TO_RECEIVE = Receivable (Dr), TO_PAY = Payable (Cr)

export interface Party {
  id: string;
  name: string;
  type: PartyType;
  phone: string;
  email?: string;
  gstin?: string;
  pan?: string;
  stateCode: string;
  billingAddress: string;
  shippingAddress?: string;
  pincode?: string;
  city?: string;
  creditLimit?: number;
  openingBalance?: number; // Raw absolute amount
  openingBalanceType?: BalanceType; // 'TO_RECEIVE' | 'TO_PAY'
  openingBalanceDate?: string; // YYYY-MM-DD
  currentBalance: number; // Signed: Positive: Receivable (Dr), Negative: Payable (Cr)
  createdAt: string;
  updatedAt: string;
}
