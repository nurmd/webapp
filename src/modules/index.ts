/**
 * @module VyaparModules
 * @description Master domain modules barrel for Vyapar GST Billing & Accounting.
 * 
 * Modular architecture partitioning the application into specialized domains:
 * - Bills: Sales Invoicing, Purchase Bills, Expenses, Estimates, Challans
 * - Parties: Customer & Supplier directory, ledger balances, statements
 * - Items: Inventory, stock adjustments, barcode scanning, catalog
 * - Tax: Indian GST calculation, Luhn Mod 36 validation, GSTR/E-Way/E-Invoice exports
 * - POS: High-speed retail counter, touch billing, thermal ESC/POS printing
 * - Reports: Financial analytics, Daybook, GSTR-1, GSTR-3B, FIFO stock valuation
 * - UI: Application shell, navigation hub, responsive layout, Stitch design tokens
 * - DB: Offline-first IndexedDB, PouchDB/CouchDB 2-way sync, local hardware printer isolation
 */

export * as BillsModule from './bills/index.ts';
export * as PartiesModule from './parties/index.ts';
export * as ItemsModule from './items/index.ts';
export * as TaxModule from './tax/index.ts';
export * as PosModule from './pos/index.ts';
export * as ReportsModule from './reports/index.ts';
export * as UiModule from './ui/index.ts';
export * as DbModule from './db/index.ts';
