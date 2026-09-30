/**
 * @module Items
 * @description Inventory, Stock Management, and Catalog Domain Module.
 * 
 * Provides:
 * - InventoryItem and StockAdjustment data models.
 * - Units of Measurement (PCS, KGS, LTR, BOX, MTR, PKT, DOZ, SET, QNT).
 * - Real-time stock levels, low-stock threshold alerts, and hidden/revealed purchase prices.
 * - Barcode & QR code scanning integration for fast inventory management.
 * - Full Inventory View component.
 */

export * from '../../models/item.ts';
export { InventoryView } from '../../components/Inventory/InventoryView.tsx';
export { hardwareScanner, audioService } from '../../services/barcodeService.ts';
