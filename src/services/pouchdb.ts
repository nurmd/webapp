import PouchDB from 'pouchdb-browser';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem, StockAdjustment } from '../models/item.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Expense } from '../models/expense.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';

export type SyncStatus = 'offline' | 'connecting' | 'synced' | 'syncing' | 'error';

export interface PouchSyncState {
  status: SyncStatus;
  remoteUrl: string;
  lastSyncedAt?: string;
  error?: string;
  pendingChanges: number;
}

export interface PouchDocChange {
  id: string;
  doc?: any;
  deleted?: boolean;
}

export type SyncListener = (state: PouchSyncState) => void;
export type DataChangeListener = (change?: PouchDocChange) => void;

class PouchService {
  private localDB: PouchDB.Database;
  private syncHandler: PouchDB.Replication.Sync<{}> | null = null;
  private listeners: Set<SyncListener> = new Set();
  private changeListeners: Set<DataChangeListener> = new Set();

  private currentState: PouchSyncState = {
    status: 'offline',
    remoteUrl: '',
    pendingChanges: 0,
  };

  constructor() {
    this.localDB = new PouchDB('vyapar_fintech_store', { auto_compaction: true });

    // Listen for local and remote changes continuously
    this.localDB
      .changes({ since: 'now', live: true, include_docs: true })
      .on('change', (change) => {
        this.notifyDataChange({
          id: change.id,
          doc: change.doc,
          deleted: change.deleted,
        });
      })
      .on('error', (err) => {
        console.warn('PouchDB changes feed error:', err);
      });

    // Auto-reconnect when device comes online or screen/app becomes visible
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        const saved = localStorage.getItem('couchdb_remote_url');
        if (saved && saved.trim()) {
          this.startSync(saved.trim());
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          const saved = localStorage.getItem('couchdb_remote_url');
          if (saved && saved.trim()) {
            if (!this.syncHandler || this.currentState.status === 'error' || this.currentState.status === 'offline') {
              this.startSync(saved.trim());
            }
          }
        }
      });
    }

    // Auto-restore remote sync URL from settings
    const savedRemote = localStorage.getItem('couchdb_remote_url');
    if (savedRemote && savedRemote.trim()) {
      this.startSync(savedRemote.trim());
    }
  }

  // --- Remote CouchDB Continuous Two-Way Sync ---

  public getSyncState(): PouchSyncState {
    return { ...this.currentState };
  }

  public subscribeSync(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => this.listeners.delete(listener);
  }

  public subscribeDataChange(listener: DataChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private notifySyncState(partial: Partial<PouchSyncState>) {
    this.currentState = { ...this.currentState, ...partial };
    this.listeners.forEach((l) => l(this.currentState));
  }

  private notifyDataChange(change?: PouchDocChange) {
    this.changeListeners.forEach((l) => l(change));
  }

  private createRemoteDB(remoteUrl: string): PouchDB.Database {
    const cleanUrl = remoteUrl.trim();
    let authConfig: { username?: string; password?: string } | undefined;

    try {
      const parsed = new URL(cleanUrl);
      if (parsed.username || parsed.password) {
        authConfig = {
          username: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password),
        };
      }
    } catch {
      // Retain cleanUrl as-is if unparseable
    }

    return new PouchDB(cleanUrl, {
      skip_setup: true,
      auth: authConfig?.username ? { username: authConfig.username, password: authConfig.password || '' } : undefined,
    });
  }

  public startSync(remoteUrl: string): void {
    if (this.syncHandler) {
      this.syncHandler.cancel();
      this.syncHandler = null;
    }

    if (!remoteUrl.trim()) {
      localStorage.removeItem('couchdb_remote_url');
      this.notifySyncState({ status: 'offline', remoteUrl: '', error: undefined, pendingChanges: 0 });
      return;
    }

    localStorage.setItem('couchdb_remote_url', remoteUrl.trim());
    this.notifySyncState({ status: 'connecting', remoteUrl: remoteUrl.trim(), error: undefined });

    try {
      const remoteDB = this.createRemoteDB(remoteUrl);

      this.syncHandler = PouchDB.sync(this.localDB, remoteDB, {
        live: true,
        retry: true,
        back_off_function: (delay) => (delay === 0 ? 1000 : Math.min(delay * 1.5, 10000)),
        pull: {
          heartbeat: 10000,
          batch_size: 100,
          batches_limit: 10,
        },
        push: {
          heartbeat: 10000,
          batch_size: 100,
          batches_limit: 10,
        },
      })
        .on('change', (info) => {
          this.notifySyncState({
            status: 'syncing',
            lastSyncedAt: new Date().toISOString(),
            pendingChanges: info.change?.docs?.length || 0,
          });
          // Docs pulled into localDB trigger localDB.changes automatically.
          this.notifyDataChange();
        })
        .on('paused', (err) => {
          if (err) {
            this.notifySyncState({ status: 'error', error: String(err) });
          } else {
            this.notifySyncState({ status: 'synced', error: undefined, lastSyncedAt: new Date().toISOString() });
          }
        })
        .on('active', () => {
          this.notifySyncState({ status: 'syncing' });
        })
        .on('denied', (err) => {
          this.notifySyncState({ status: 'error', error: 'Authentication Denied: ' + (err || '') });
        })
        .on('error', (err) => {
          this.notifySyncState({ status: 'error', error: String(err) });
        });
    } catch (e: any) {
      this.notifySyncState({ status: 'error', error: e.message || 'Invalid CouchDB URL' });
    }
  }

  public stopSync(): void {
    if (this.syncHandler) {
      this.syncHandler.cancel();
      this.syncHandler = null;
    }
    localStorage.removeItem('couchdb_remote_url');
    this.notifySyncState({ status: 'offline', remoteUrl: '', error: undefined, pendingChanges: 0 });
  }

  public async syncNow(): Promise<void> {
    const savedRemote = localStorage.getItem('couchdb_remote_url');
    if (savedRemote && savedRemote.trim()) {
      this.notifySyncState({ status: 'syncing' });
      try {
        const remoteDB = this.createRemoteDB(savedRemote.trim());
        await PouchDB.replicate(remoteDB, this.localDB, { batch_size: 100 });
        await PouchDB.replicate(this.localDB, remoteDB, { batch_size: 100 });
        this.notifySyncState({
          status: 'synced',
          lastSyncedAt: new Date().toISOString(),
          error: undefined,
          pendingChanges: 0,
        });
      } catch (err: any) {
        console.warn('Manual syncNow error:', err);
        this.notifySyncState({
          status: 'error',
          error: err?.message || 'Sync failed',
        });
      }
      this.notifyDataChange();
    } else {
      this.notifyDataChange();
      this.notifySyncState({
        status: 'synced',
        lastSyncedAt: new Date().toISOString(),
        error: undefined,
        pendingChanges: 0,
      });
    }
  }

  // --- Document CRUD Operations with Document Type Prefixes ---

  public async putDoc<T extends { id: string }>(type: string, doc: T): Promise<void> {
    const docId = `${type}:${doc.id}`;
    try {
      let rev: string | undefined;
      try {
        const existing = await this.localDB.get(docId);
        rev = existing._rev;
      } catch (e: any) {
        if (e.status !== 404) throw e;
      }

      await this.localDB.put({
        ...doc,
        _id: docId,
        _rev: rev,
        docType: type,
        syncedAt: new Date().toISOString(),
      });
      this.notifyDataChange({
        id: docId,
        doc: { ...doc, docType: type },
        deleted: false,
      });
    } catch (e) {
      console.error(`PouchDB putDoc error [${docId}]:`, e);
    }
  }

  public async deleteDoc(type: string, id: string): Promise<void> {
    const docId = `${type}:${id}`;
    try {
      const existing = await this.localDB.get(docId);
      await this.localDB.remove(existing);
      this.notifyDataChange({
        id: docId,
        deleted: true,
      });
    } catch (e: any) {
      if (e.status !== 404) {
        console.error(`PouchDB deleteDoc error [${docId}]:`, e);
      }
    }
  }

  public async getAllDocs<T>(type: string): Promise<T[]> {
    try {
      const res = await this.localDB.allDocs({
        include_docs: true,
        startkey: `${type}:`,
        endkey: `${type}:\ufff0`,
      });
      return res.rows
        .map((r) => r.doc as any)
        .filter(Boolean)
        .map(({ _id, _rev, docType, syncedAt, ...data }) => data as T);
    } catch (e) {
      console.error(`PouchDB getAllDocs error [${type}]:`, e);
      return [];
    }
  }

  // --- Fast Batch Migration from localStorage ---
  public async migrateFromLocalStorage(data: {
    company: CompanyProfile;
    parties: Party[];
    items: InventoryItem[];
    invoices: Invoice[];
    purchases: PurchaseBill[];
    expenses: Expense[];
    adjustments: StockAdjustment[];
    vouchers: Voucher[];
  }): Promise<void> {
    const isMigrated = localStorage.getItem('pouchdb_initial_migrated');
    if (isMigrated) return;

    try {
      const docs: any[] = [];
      const timestamp = new Date().toISOString();

      if (data.company) {
        docs.push({ ...data.company, _id: `company:${data.company.id || 'COMP-001'}`, docType: 'company', syncedAt: timestamp });
      }
      data.parties.forEach((p) => docs.push({ ...p, _id: `party:${p.id}`, docType: 'party', syncedAt: timestamp }));
      data.items.forEach((i) => docs.push({ ...i, _id: `item:${i.id}`, docType: 'item', syncedAt: timestamp }));
      data.invoices.forEach((inv) => docs.push({ ...inv, _id: `invoice:${inv.id}`, docType: 'invoice', syncedAt: timestamp }));
      data.purchases.forEach((pur) => docs.push({ ...pur, _id: `purchase:${pur.id}`, docType: 'purchase', syncedAt: timestamp }));
      data.expenses.forEach((exp) => docs.push({ ...exp, _id: `expense:${exp.id}`, docType: 'expense', syncedAt: timestamp }));
      data.adjustments.forEach((adj) => docs.push({ ...adj, _id: `adjustment:${adj.id}`, docType: 'adjustment', syncedAt: timestamp }));
      data.vouchers.forEach((v) => docs.push({ ...v, _id: `voucher:${v.id}`, docType: 'voucher', syncedAt: timestamp }));

      if (docs.length > 0) {
        await this.localDB.bulkDocs(docs);
      }
      localStorage.setItem('pouchdb_initial_migrated', 'true');
    } catch (e) {
      console.error('PouchDB initial migration error:', e);
    }
  }
}

export const pouch = new PouchService();
