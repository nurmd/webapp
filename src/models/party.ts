export type PartyType = 'CUSTOMER' | 'SUPPLIER';

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
  creditLimit?: number;
  currentBalance: number; // Positive: Receivable (Dr), Negative: Payable (Cr)
  createdAt: string;
  updatedAt: string;
}
