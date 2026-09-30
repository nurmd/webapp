/**
 * @module Database
 * @description Offline-First Storage & Multi-Device Synchronization Subsystem.
 * 
 * Provides:
 * - Local storage persistence with IndexedDB / LocalStorage backing.
 * - PouchDB + CouchDB continuous bidirectional synchronization for multi-terminal sync.
 * - Multi-tab instant sync via Web BroadcastChannel (`vyapar_multi_device_sync`).
 * - Hardware printer settings isolation (thermal paper width 58/80mm, Bluetooth/USB addresses preserved locally).
 * - Comprehensive CRUD operations for Parties, Items, Invoices, Purchases, Expenses, Adjustments, and Vouchers.
 */

export { db, type SyncedSettings } from '../../services/db.ts';
export { pouch, type PouchSyncState } from '../../services/pouchdb.ts';
