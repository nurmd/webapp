export type UnitOfMeasurement =
  | 'PCS'
  | 'NOS'
  | 'KGS'
  | 'GMS'
  | 'LTR'
  | 'ML'
  | 'MTR'
  | 'BOX'
  | 'PKT'
  | 'SET'
  | 'BAG'
  | 'HOURS'
  | 'DAYS';

export interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  hsnSacCode: string;
  category: string;
  unit: UnitOfMeasurement;
  salePrice: number;
  purchasePrice: number;
  wholesalePrice?: number;
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
