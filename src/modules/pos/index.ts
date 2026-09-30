/**
 * @module POS
 * @description Point of Sale (POS) High-Speed Retail Counter Module.
 * 
 * Provides:
 * - Ultra-fast touch & barcode-assisted supermarket billing.
 * - Dynamic live cart calculation with instant discount & tax updates.
 * - Payment modes: Cash, UPI Dynamic QR Code, Credit Card, Net Banking.
 * - One-click ESC/POS thermal receipt printing (58mm/80mm) with auto-cut and cash drawer trigger.
 */

export { QuickBillingView } from '../../components/POS/QuickBillingView.tsx';
export * from '../../core/printer/escpos.ts';
export * from '../../core/printer/escposBinary.ts';
