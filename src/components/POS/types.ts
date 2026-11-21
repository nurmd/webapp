import { InventoryItem, ItemPriceMode } from '../../models/item.ts';
import { Party } from '../../models/party.ts';
import { PaymentMode } from '../../models/invoice.ts';
import { exclusiveFromInclusive, inclusiveFromExclusive } from '../../core/gst/pricing.ts';

export interface PosCartItem {
  item: InventoryItem;
  qty: number;
  unitPrice: number;             // GST-exclusive
  unitPriceInclusive?: number;   // GST-inclusive
  priceMode?: ItemPriceMode;     // defaults to EXCLUSIVE
  priceTier?: 'RETAIL' | 'SEMI_WHOLESALE' | 'WHOLESALE';
  cessRate?: number;
  discountPercent?: number;
  discountAmount?: number;
  customNote?: string;
  isCustomItem?: boolean;
}

export function createPosCartItem(item: InventoryItem, qty = 1): PosCartItem {
  const gst = item.gstRate ?? 18;
  const mode = item.salePriceMode ?? 'EXCLUSIVE';
  const tier = item.defaultPriceTier || 'RETAIL';
  let tierPrice = item.salePrice || 0;
  if (tier === 'SEMI_WHOLESALE' && item.semiWholesalePrice && item.semiWholesalePrice > 0) {
    tierPrice = item.semiWholesalePrice;
  } else if (tier === 'WHOLESALE' && item.wholesalePrice && item.wholesalePrice > 0) {
    tierPrice = item.wholesalePrice;
  }

  const excl = tierPrice;
  const incl = (mode === 'INCLUSIVE' && item.salePriceInclusive !== undefined && tier === 'RETAIL')
    ? item.salePriceInclusive
    : inclusiveFromExclusive(excl, gst);
  return {
    item,
    qty,
    priceTier: tier,
    unitPrice: mode === 'INCLUSIVE' ? exclusiveFromInclusive(incl, gst) : excl,
    unitPriceInclusive: mode === 'INCLUSIVE' ? incl : inclusiveFromExclusive(excl, gst),
    priceMode: mode,
    cessRate: item.cessRate ?? 0,
    discountPercent: 0,
    discountAmount: 0,
  };
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
