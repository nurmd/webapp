import { InventoryItem } from '../../models/item.ts';
import { Party } from '../../models/party.ts';
import { PaymentMode } from '../../models/invoice.ts';

export interface PosCartItem {
  item: InventoryItem;
  qty: number;
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  customNote?: string;
  isCustomItem?: boolean;
}

export interface PosCustomerState {
  party: Party | null;
  phone: string;
  isB2b: boolean;
  gstin?: string;
  stateCode: string;
}

export interface HeldBill {
  id: string;
  heldAt: string; // ISO string
  label: string; // e.g. "Hold #1"
  customer: PosCustomerState;
  cart: PosCartItem[];
  cartDiscount: {
    type: 'PERCENT' | 'FLAT';
    value: number;
  };
  additionalCharges: number;
  paymentMode: PaymentMode | 'SPLIT';
  totalAmount: number;
}
