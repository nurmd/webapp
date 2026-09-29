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

type SyncListener = (state: PouchSyncState) => void;
type DataChangeListener = () => void;

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

    // Listen for local/remote changes
    this.localDB
      .changes({ since: 'now', live: true, include_docs: true })
      .on('change', () => {
        this.notifyDataChange();
      })
      .on('error', (err) => {
        console.warn('PouchDB changes feed error:', err);
      });

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

  private notifyDataChange() {
    this.changeListeners.forEach((l) => l());
  }

  public startSync(remoteUrl: string): void {
    if (this.syncHandler) {
      this.syncHandler.cancel();
      this.syncHandler = null;
    }

    if (!remoteUrl.trim()) {
      localStorage.removeItem('couchdb_remote_url');
      this.notifySyncState({ status: 'offline', remoteUrl: '', error: undefined });
      return;
    }

    localStorage.setItem('couchdb_remote_url', remoteUrl.trim());
    this.notifySyncState({ status: 'connecting', remoteUrl: remoteUrl.trim(), error: undefined });

    try {
      let cleanUrl = remoteUrl.trim();
      let authConfig: { username?: string; password?: string } | undefined;

      try {
        const parsed = new URL(cleanUrl);
        if (parsed.username || parsed.password) {
          authConfig = {
            username: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
          };
          parsed.username = '';
          parsed.password = '';
          cleanUrl = parsed.toString();
        }
      } catch {
        // Retain cleanUrl as-is if unparseable
      }

      const remoteDB = new PouchDB(cleanUrl, {
        skip_setup: true,
        auth: authConfig?.username ? { username: authConfig.username, password: authConfig.password || '' } : undefined,
        fetch: authConfig?.username
          ? (url: string | URL | Request, opts?: RequestInit) => {
              const headers = new Headers(opts?.headers || {});
              if (!headers.has('Authorization')) {
                headers.set('Authorization', 'Basic ' + btoa(`${authConfig!.username}:${authConfig!.password || ''}`));
              }
              return fetch(url, { ...opts, headers });
            }
          : undefined,
      });

      this.syncHandler = PouchDB.sync(this.localDB, remoteDB, {
        live: true,
        retry: true,
        back_off_function: (delay) => (delay === 0 ? 1000 : Math.min(delay * 2, 30000)),
      })
        .on('change', (info) => {
          this.notifySyncState({
            status: 'syncing',
            lastSyncedAt: new Date().toISOString(),
            pendingChanges: info.change.docs.length,
          });
          this.notifyDataChange();
        })
        .on('paused', (err) => {
          if (err) {
            this.notifySyncState({ status: 'error', error: String(err) });
          } else {
            this.notifySyncState({ status: 'synced', error: undefined });
          }
        })
        .on('active', () => {
          this.notifySyncState({ status: 'syncing' });
        })
        .on('denied', (err) => {
          this.notifySyncState({ status: 'error', error: 'Authentication Denied' });
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
    this.notifySyncState({ status: 'offline', remoteUrl: '', error: undefined });
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
    } catch (e) {
      console.error(`PouchDB putDoc error [${docId}]:`, e);
    }
  }

  public async deleteDoc(type: string, id: string): Promise<void> {
    const docId = `${type}:${id}`;
    try {
      const existing = await this.localDB.get(docId);
      await this.localDB.remove(existing);
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

  // --- Migration from localStorage ---
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
      await this.putDoc('company', data.company);
      for (const p of data.parties) await this.putDoc('party', p);
      for (const i of data.items) await this.putDoc('item', i);
      for (const inv of data.invoices) await this.putDoc('invoice', inv);
      for (const pur of data.purchases) await this.putDoc('purchase', pur);
      for (const exp of data.expenses) await this.putDoc('expense', exp);
      for (const adj of data.adjustments) await this.putDoc('adjustment', adj);
      for (const v of data.vouchers) await this.putDoc('voucher', v);

      localStorage.setItem('pouchdb_initial_migrated', 'true');
    } catch (e) {
      console.error('PouchDB initial migration error:', e);
    }
  }
}

export const pouch = new PouchService();
