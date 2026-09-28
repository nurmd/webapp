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
  | 'BAG';

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
  gstRate: number; // e.g. 0, 5, 12, 18, 28
  cessRate?: number;
  currentStock: number;
  minStockAlert: number;
  createdAt: string;
  updatedAt: string;
}
