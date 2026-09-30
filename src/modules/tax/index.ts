/**
 * @module Tax
 * @description Comprehensive Indian GST & Legal Tax Engine.
 * 
 * Provides:
 * - Real-time GSTIN format and Luhn Mod 36 checksum verification.
 * - Intra-State (CGST + SGST 50/50 split) vs Inter-State (IGST 100%) tax calculation.
 * - Standard slab rates (0%, 5%, 12%, 18%, 28%) and Compensation Cess computation.
 * - 38 Indian State & Union Territory GST codes mapping.
 * - Official Government NIC E-Way Bill, E-Invoice, and GSTR-1 JSON export generators.
 */

export * from '../../core/gst/calculator.ts';
export * from '../../core/gst/validator.ts';
export * from '../../core/gst/stateCodes.ts';
export * from '../../core/gst/hsnCatalog.ts';
export * from '../../core/gst/gstrExport.ts';
export * from '../../core/gst/eWayBillExport.ts';
export * from '../../core/gst/eInvoiceExport.ts';
