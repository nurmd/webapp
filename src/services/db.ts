import { SyncStorage } from './db/syncStorage.ts';

export * from './db/index.ts';

/**
 * StorageService Facade.
 * Unified Offline-First Data Access and Multi-Device Synchronization Engine.
 *
 * Composes focused domain modules:
 * - StorageEngine: LocalStorage cache, O(1) in-memory cache, BroadcastChannel
 * - SettingsStorage: Company profile, synced settings, privacy configurations
 * - PartyStorage: Customers & Suppliers, linear O(P+I+V+U) party balance sync
 * - ItemStorage: Catalog, stock persistence, category management
 * - FinancialStorage: Double-entry vouchers, cash/bank accounts, loans, expenses
 * - InvoicePurchaseStorage: Sales invoices, credit notes, purchase bills, debit notes, stock adjustments
 * - BackupRestoreStorage: Full JSON database backups, SHA-256 checksums, Disaster Recovery
 * - SyncStorage: Real-time PouchDB/CouchDB 2-way sync, demo data lifecycle
 */
export class StorageService extends SyncStorage {}

export const db = new StorageService();
