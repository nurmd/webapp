export * from './category.ts';

export type ItemPriceMode = 'EXCLUSIVE' | 'INCLUSIVE';

export const STANDARD_UNITS = [
  'PCS',
  'NOS',
  'KGS',
  'GMS',
  'LTR',
  'ML',
  'MTR',
  'BOX',
  'PKT',
  'SET',
  'BAG',
  'HOURS',
  'DAYS',
] as const;

export type StandardUnitOfMeasurement = (typeof STANDARD_UNITS)[number];

export type UnitOfMeasurement = string;

export interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  hsnSacCode: string;
  category: string;
  unit: UnitOfMeasurement;
  subUnit?: string;
  subUnitFactor?: number;
  salePrice: number;
  salePriceInclusive?: number;
  salePriceMode?: ItemPriceMode;
  purchasePrice: number;
  purchasePriceInclusive?: number;
  purchasePriceMode?: ItemPriceMode;
  /**
   * Wholesale price tier.
   * Tax Mode Note: Tier prices inherit the active priceMode of the transaction line/item.
   * - In EXCLUSIVE mode, wholesalePrice is treated as GST-exclusive rate (unitPrice).
   * - In INCLUSIVE mode, wholesalePrice is treated as GST-inclusive rate (unitPriceInclusive).
   */
  wholesalePrice?: number;
  /**
   * Semi-wholesale price tier.
   * Tax Mode Note: Tier prices inherit the active priceMode of the transaction line/item.
   * - In EXCLUSIVE mode, semiWholesalePrice is treated as GST-exclusive rate (unitPrice).
   * - In INCLUSIVE mode, semiWholesalePrice is treated as GST-inclusive rate (unitPriceInclusive).
   */
  semiWholesalePrice?: number;
  defaultPriceTier?: 'RETAIL' | 'SEMI_WHOLESALE' | 'WHOLESALE';
  mrp?: number;
  gstRate: number; // e.g. 0, 5, 12, 18, 28
  cessRate?: number;
  currentStock: number;
  minStockAlert: number;
  batchNumber?: string;
  expiryDate?: string;
  manufacturingDate?: string;
  isActive?: boolean;
  isDisabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export function isItemDisabled(item: InventoryItem): boolean {
  return item.isDisabled === true || item.isActive === false;
}

export function isItemActive(item: InventoryItem): boolean {
  return !isItemDisabled(item);
}

export type StockAdjustmentType = 'STOCK_IN' | 'STOCK_OUT' | 'WASTAGE' | 'CORRECTION';

export interface StockAdjustment {
  id: string;
  itemId: string;
  itemName: string;
  type: StockAdjustmentType;
  quantity: number;
  date: string;
  reason: string;
  adjustedBy?: string;
  createdAt: string;
}
