/**
 * @module Reports
 * @description Financial Analytics, Tax Returns, and Accounting Statements Module.
 * 
 * Provides:
 * - GSTR-1 Monthly Return computation (B2B, B2CS, HSN Summary) with 1-click JSON download for the GST portal.
 * - GSTR-3B tax computation with Input Tax Credit (ITC) reconciliation.
 * - Double-entry Daybook ledger with opening, closing, and period transaction balances.
 * - Profit & Loss statement, Stock valuation summary (FIFO), and receivable/payable aging.
 */

export { BusinessReportsView } from '../../components/Reports/BusinessReportsView.tsx';
export { DaybookView } from '../../components/Reports/DaybookView.tsx';
export { Gstr1View } from '../../components/Reports/Gstr1View.tsx';
export * from '../../core/accounting/ledger.ts';
export * from '../../core/accounting/voucherTypes.ts';
