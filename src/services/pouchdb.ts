import PouchDB from 'pouchdb-browser';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem, StockAdjustment } from '../models/item.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Expense } from '../models/expense.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';

export type SyncStatus = 'offline' | 'connecting' | 'synced' | 'syncing' | 'error';

export const DEFAULT_COUCHDB_REMOTE_URL = '';

// The sync URL is user configuration. It is persisted redundantly so that a
// browser-storage reset or an app update cannot silently disconnect the device.
const SYNC_URL_STORAGE_KEY = 'couchdb_remote_url';
const SYNC_URL_LOCAL_DOC_ID = '_local/sync_remote_url';
const SYNC_URL_ANDROID_PREF_KEY = 'couchdb_remote_url';

export interface SyncConflict {
  id: string; // e.g. `${docId}#${conflictingRev}`
  docId: string; // e.g. 'invoice:INV-001'
  docType: string;
  entityId: string;
  winningRev: string;
  conflictingRev: string;
  winningDoc: any;
  conflictingDoc: any;
  detectedAt: string;
}

export interface ReplicatedTombstone {
  _id: string; // `tombstone:${type}:${id}`
  _rev?: string;
  docType: 'tombstone';
  targetType: string;
  targetId: string;
  deletedAt: string;
  syncedAt: string;
}

export interface PouchSyncState {
  status: SyncStatus;
  remoteUrl: string;
  lastSyncedAt?: string;
  error?: string;
  pendingChanges: number;
  conflicts?: SyncConflict[];
  conflictsCount?: number;
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
  private explicitConflicts: Map<string, SyncConflict> = new Map();

  private currentState: PouchSyncState = {
    status: 'offline',
    remoteUrl: '',
    pendingChanges: 0,
    conflicts: [],
    conflictsCount: 0,
  };

  constructor() {
    try {
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
    } catch {
      this.localDB = {
        changes: () => ({ on: () => ({ on: () => {} }) }),
        get: async () => { throw { status: 404 }; },
        put: async () => ({ ok: true }),
        remove: async () => ({ ok: true }),
        allDocs: async () => ({ rows: [] }),
        bulkDocs: async () => [],
      } as any;
    }

    // Auto-reconnect when device comes online or screen/app becomes visible.
    // Never auto-delete a user-configured URL here; the URL is restored from
    // localStorage, Android SharedPreferences, or the local-only PouchDB doc.
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        const saved = this.getStoredRemoteUrl();
        if (saved) {
          this.startSync(saved);
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          const saved = this.getStoredRemoteUrl();
          if (saved && (!this.syncHandler || this.currentState.status === 'error' || this.currentState.status === 'offline')) {
            this.startSync(saved);
          }
        }
      });
    }

    // Restore the explicitly configured remote URL. A legacy demo URL is kept
    // (with a visible security warning) instead of being silently deleted.
    const savedRemote = this.getStoredRemoteUrl();
    if (savedRemote) {
      this.startSync(savedRemote);
    } else {
      this.restorePersistedRemoteUrl().catch(() => {});
    }
  }

  private getAndroidBridge(): any {
    if (typeof window === 'undefined') return null;
    return (window as any).AndroidBridge || null;
  }

  private readAndroidPreference(key: string): string {
    try {
      const bridge = this.getAndroidBridge();
      if (bridge && typeof bridge.getPreference === 'function') {
        const value = bridge.getPreference(key);
        return typeof value === 'string' ? value.trim() : '';
      }
    } catch {
      // Android bridge is optional (PWA / browser).
    }
    return '';
  }

  private writeAndroidPreference(key: string, value: string): void {
    try {
      const bridge = this.getAndroidBridge();
      if (bridge && typeof bridge.setPreference === 'function') {
        bridge.setPreference(key, value);
      }
    } catch {
      // Best-effort only.
    }
  }

  private removeAndroidPreference(key: string): void {
    try {
      const bridge = this.getAndroidBridge();
      if (bridge && typeof bridge.removePreference === 'function') {
        bridge.removePreference(key);
      }
    } catch {
      // Best-effort only.
    }
  }

  /**
   * Returns the configured remote URL without side effects. Checks
   * localStorage first (fast path), then Android SharedPreferences.
   */
  public getStoredRemoteUrl(): string {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(SYNC_URL_STORAGE_KEY);
        if (saved && saved.trim()) return saved.trim();
      }
    } catch {
      // Storage may be unavailable in private browsing.
    }
    return this.readAndroidPreference(SYNC_URL_ANDROID_PREF_KEY);
  }

  private async persistRemoteUrl(remoteUrl: string): Promise<void> {
    const clean = remoteUrl.trim();
    if (!clean) {
      await this.removePersistedRemoteUrl();
      return;
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SYNC_URL_STORAGE_KEY, clean);
      }
    } catch {
      // Ignore localStorage failures; Android prefs remain available.
    }
    this.writeAndroidPreference(SYNC_URL_ANDROID_PREF_KEY, clean);

    try {
      let rev: string | undefined;
      try {
        const existing = (await this.localDB.get(SYNC_URL_LOCAL_DOC_ID)) as any;
        rev = existing?._rev;
      } catch (e: any) {
        if (e?.status !== 404) throw e;
      }
      await this.localDB.put({
        _id: SYNC_URL_LOCAL_DOC_ID,
        _rev: rev,
        remoteUrl: clean,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Local doc storage is a backup layer; never fail the sync lifecycle.
    }
  }

  private async removePersistedRemoteUrl(): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SYNC_URL_STORAGE_KEY);
      }
    } catch {
      // Ignore.
    }
    this.removeAndroidPreference(SYNC_URL_ANDROID_PREF_KEY);

    try {
      const existing = await this.localDB.get(SYNC_URL_LOCAL_DOC_ID);
      await this.localDB.remove(existing);
    } catch {
      // Already absent.
    }
  }

  private async restorePersistedRemoteUrl(): Promise<void> {
    const fromPrefs = this.readAndroidPreference(SYNC_URL_ANDROID_PREF_KEY);
    if (fromPrefs) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(SYNC_URL_STORAGE_KEY, fromPrefs);
        }
      } catch {
        // Ignore.
      }
      this.startSync(fromPrefs);
      return;
    }

    try {
      const doc = (await this.localDB.get(SYNC_URL_LOCAL_DOC_ID)) as any;
      const url = typeof doc?.remoteUrl === 'string' ? doc.remoteUrl.trim() : '';
      if (url) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(SYNC_URL_STORAGE_KEY, url);
          }
        } catch {
          // Ignore.
        }
        this.writeAndroidPreference(SYNC_URL_ANDROID_PREF_KEY, url);
        this.startSync(url);
      }
    } catch {
      // No persisted URL.
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
      void this.removePersistedRemoteUrl();
      this.notifySyncState({ status: 'offline', remoteUrl: '', error: undefined, pendingChanges: 0 });
      return;
    }

    const cleanUrl = remoteUrl.trim();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SYNC_URL_STORAGE_KEY, cleanUrl);
      }
    } catch {
      // Ignore localStorage failures; Android prefs/local doc remain.
    }
    void this.persistRemoteUrl(cleanUrl);

    this.notifySyncState({ status: 'connecting', remoteUrl: cleanUrl, error: undefined });

    try {
      const remoteDB = this.createRemoteDB(cleanUrl);

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
      });

      // Capture push-specific replication errors & permission denial
      if ((this.syncHandler as any).push) {
        (this.syncHandler as any).push
          .on('error', (err: any) => {
            console.error('PouchDB sync push error:', err);
            const msg = err?.message || String(err);
            const errMsg = err?.status === 403 || err?.status === 401
              ? `Push permission denied (${err.status}): User cannot write to remote CouchDB`
              : `Push sync error: ${msg}`;
            this.notifySyncState({ status: 'error', error: errMsg });
          })
          .on('denied', (err: any) => {
            console.error('PouchDB sync push denied:', err);
            this.notifySyncState({ status: 'error', error: `Push Denied: ${err?.message || err || 'Write access rejected'}` });
          });
      }

      // Capture pull-specific replication errors & permission denial
      if ((this.syncHandler as any).pull) {
        (this.syncHandler as any).pull
          .on('error', (err: any) => {
            console.error('PouchDB sync pull error:', err);
            this.notifySyncState({ status: 'error', error: `Pull sync error: ${err?.message || err}` });
          })
          .on('denied', (err: any) => {
            console.error('PouchDB sync pull denied:', err);
            this.notifySyncState({ status: 'error', error: `Pull Denied: ${err?.message || err || 'Read access rejected'}` });
          });
      }

      this.syncHandler
        .on('change', (info) => {
          this.notifySyncState({
            status: 'syncing',
            lastSyncedAt: new Date().toISOString(),
            pendingChanges: info.change?.docs?.length || 0,
            error: undefined,
          });
          // Docs pulled into localDB trigger localDB.changes automatically.
          this.notifyDataChange();
          this.refreshConflicts().catch(() => {});
        })
        .on('paused', (err: any) => {
          if (err) {
            this.notifySyncState({ status: 'error', error: String(err?.message || err) });
          } else {
            // Do not clear error if an active push/pull/auth error is present
            if (this.currentState.status !== 'error') {
              this.notifySyncState({ status: 'synced', error: undefined, lastSyncedAt: new Date().toISOString() });
              this.refreshConflicts().catch(() => {});
            }
          }
        })
        .on('active', () => {
          if (this.currentState.status !== 'error') {
            this.notifySyncState({ status: 'syncing' });
          }
        })
        .on('denied', (err: any) => {
          this.notifySyncState({ status: 'error', error: 'Authentication Denied: ' + (err?.message || err || '') });
        })
        .on('error', (err: any) => {
          this.notifySyncState({ status: 'error', error: String(err?.message || err) });
        });
    } catch (e: any) {
      this.notifySyncState({ status: 'error', error: e.message || 'Invalid CouchDB URL' });
    }
  }

  /**
   * Probes remote CouchDB endpoint for:
   * 1. URL validity
   * 2. Read reachability and auth (via remoteDB.info())
   * 3. Write/push permissions (via test probe put & remove)
   * Returns structured diagnostic results with actionable error messages.
   */
  public async probeRemoteConnection(remoteUrl: string): Promise<{
    ok: boolean;
    error?: string;
    details?: {
      dbName?: string;
      docCount?: number;
      canRead?: boolean;
      canWrite?: boolean;
    };
  }> {
    const cleanUrl = remoteUrl?.trim();
    if (!cleanUrl) {
      return { ok: false, error: 'No CouchDB URL provided' };
    }

    let remoteDB: PouchDB.Database;
    try {
      remoteDB = this.createRemoteDB(cleanUrl);
    } catch (e: any) {
      const msg = `Invalid CouchDB URL format: ${e?.message || e}`;
      this.notifySyncState({ status: 'error', error: msg });
      return { ok: false, error: msg };
    }

    // 1. Read probe via remoteDB.info()
    let info: any;
    try {
      info = await remoteDB.info();
    } catch (readErr: any) {
      const status = readErr.status;
      let msg = readErr.message || 'Unable to connect to CouchDB';
      if (status === 401) {
        msg = 'Authentication failed (401 Unauthorized): Check CouchDB username and password';
      } else if (status === 403) {
        msg = 'Access forbidden (403 Forbidden): User lacks read permission for this database';
      } else if (status === 404) {
        msg = 'Database not found (404): The specified CouchDB database does not exist';
      } else if (String(readErr).includes('Failed to fetch') || readErr.name === 'TypeError') {
        msg = 'Network / CORS error: Unable to reach CouchDB. Ensure server is online and CORS is enabled';
      } else {
        msg = `Connection error (${status || 'network'}): ${msg}`;
      }
      this.notifySyncState({ status: 'error', error: msg });
      return {
        ok: false,
        error: msg,
        details: { canRead: false, canWrite: false },
      };
    }

    // 2. Write probe: test putting and removing a probe document
    const probeId = `probe_sync_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    try {
      const putRes = await remoteDB.put({
        _id: probeId,
        docType: 'probe',
        probeAt: new Date().toISOString(),
      });
      try {
        await remoteDB.remove(probeId, putRes.rev);
      } catch {
        // Non-fatal if cleanup fails as long as put succeeded
      }
    } catch (writeErr: any) {
      const status = writeErr.status;
      let msg = writeErr.message || 'Write permission test failed';
      if (status === 401 || status === 403) {
        msg = 'Write permission denied (403 Forbidden / Read-only): User cannot write or push data to this CouchDB database';
      } else {
        msg = `Write probe failed (${status || 'error'}): ${msg}`;
      }
      this.notifySyncState({ status: 'error', error: msg });
      return {
        ok: false,
        error: msg,
        details: {
          dbName: info?.db_name,
          docCount: info?.doc_count,
          canRead: true,
          canWrite: false,
        },
      };
    }

    return {
      ok: true,
      details: {
        dbName: info?.db_name,
        docCount: info?.doc_count,
        canRead: true,
        canWrite: true,
      },
    };
  }

  public stopSync(): void {
    if (this.syncHandler) {
      this.syncHandler.cancel();
      this.syncHandler = null;
    }
    void this.removePersistedRemoteUrl();
    this.notifySyncState({ status: 'offline', remoteUrl: '', error: undefined, pendingChanges: 0 });
  }

  public async syncNow(): Promise<boolean> {
    const savedRemote = this.getStoredRemoteUrl();
    if (savedRemote) {
      this.notifySyncState({ status: 'syncing' });
      try {
        const remoteDB = this.createRemoteDB(savedRemote);
        await PouchDB.replicate(remoteDB, this.localDB, { batch_size: 100 });
        await PouchDB.replicate(this.localDB, remoteDB, { batch_size: 100 });
        this.notifySyncState({
          status: 'synced',
          lastSyncedAt: new Date().toISOString(),
          error: undefined,
          pendingChanges: 0,
        });
        this.notifyDataChange();
        return true;
      } catch (err: any) {
        console.warn('Manual syncNow error:', err);
        this.notifySyncState({
          status: 'error',
          error: err?.message || 'Sync failed',
        });
        this.notifyDataChange();
        return false;
      }
    } else {
      this.notifySyncState({
        status: 'offline',
        error: undefined,
        pendingChanges: 0,
      });
      return false;
    }
  }

  // --- Document CRUD Operations with Document Type Prefixes ---

  private isDocDivergent(a: any, b: any): boolean {
    if (!a || !b) return true;
    const cleanA = { ...a };
    const cleanB = { ...b };
    delete cleanA._id;
    delete cleanA._rev;
    delete cleanA._conflicts;
    delete cleanA.syncedAt;
    delete cleanA.docType;
    delete cleanB._id;
    delete cleanB._rev;
    delete cleanB._conflicts;
    delete cleanB.syncedAt;
    delete cleanB.docType;

    return JSON.stringify(cleanA) !== JSON.stringify(cleanB);
  }

  public async putDoc<T extends { id: string }>(type: string, doc: T): Promise<void> {
    const docId = `${type}:${doc.id}`;
    const tombstoneId = `tombstone:${type}:${doc.id}`;
    try {
      // Clear any existing tombstone in PouchDB so entity is live
      try {
        const existingTomb = await this.localDB.get(tombstoneId);
        await this.localDB.remove(existingTomb);
      } catch (e: any) {
        if (e.status !== 404) {
          // Ignore
        }
      }

      let rev: string | undefined;
      try {
        const existing = await this.localDB.get(docId);
        rev = existing._rev;
      } catch (e: any) {
        if (e.status !== 404) throw e;
      }

      try {
        await this.localDB.put({
          ...doc,
          _id: docId,
          _rev: rev,
          docType: type,
          syncedAt: new Date().toISOString(),
        });
      } catch (putErr: any) {
        if (putErr && putErr.status === 409) {
          // 409 conflict: NEVER blind-overwrite latest revision!
          try {
            const latest = (await this.localDB.get(docId)) as any;
            const isDivergent = this.isDocDivergent(doc, latest);

            if (isDivergent) {
              // Enqueue conflict into visible queue; preserve both revisions
              const conflictId = `${docId}#409-${Date.now()}`;
              const conflict: SyncConflict = {
                id: conflictId,
                docId,
                docType: type,
                entityId: doc.id,
                winningRev: latest._rev,
                conflictingRev: 'local-409',
                winningDoc: latest,
                conflictingDoc: doc,
                detectedAt: new Date().toISOString(),
              };
              this.explicitConflicts.set(conflict.id, conflict);
              await this.refreshConflicts();
            }
          } catch (fetchErr) {
            console.warn(`Error handling 409 conflict for ${docId}:`, fetchErr);
          }
          return;
        } else {
          throw putErr;
        }
      }

      this.notifyDataChange({
        id: docId,
        doc: { ...doc, docType: type },
        deleted: false,
      });
      this.refreshConflicts().catch(() => {});
    } catch (e: any) {
      console.error(`PouchDB putDoc error [${docId}]:`, e);
      this.notifySyncState({
        status: 'error',
        error: `Database write failure [${docId}]: ${e?.message || e}`,
      });
      throw e;
    }
  }

  public async deleteDoc(type: string, id: string): Promise<void> {
    const docId = `${type}:${id}`;
    const tombstoneId = `tombstone:${type}:${id}`;
    const now = new Date().toISOString();

    try {
      // 1. Write replicated tombstone document so deletions propagate across all replicas
      let tombRev: string | undefined;
      try {
        const existingTomb = await this.localDB.get(tombstoneId);
        tombRev = existingTomb._rev;
      } catch (e: any) {
        if (e.status !== 404) throw e;
      }

      await this.localDB.put({
        _id: tombstoneId,
        _rev: tombRev,
        docType: 'tombstone',
        targetType: type,
        targetId: id,
        deletedAt: now,
        syncedAt: now,
      });

      // 2. Remove primary document from local PouchDB
      try {
        const existing = await this.localDB.get(docId);
        await this.localDB.remove(existing);
      } catch (e: any) {
        if (e.status !== 404) throw e;
      }

      this.notifyDataChange({
        id: docId,
        deleted: true,
      });
      this.refreshConflicts().catch(() => {});
    } catch (e: any) {
      console.error(`PouchDB deleteDoc error [${docId}]:`, e);
      this.notifySyncState({
        status: 'error',
        error: `Database delete failure [${docId}]: ${e?.message || e}`,
      });
      throw e;
    }
  }

  /**
   * Strict document write for backup restore:
   * - Clears tombstone
   * - Resolves 409 conflicts by fetching latest _rev and overwriting (restore wins)
   * - Rethrows any errors so the caller can safely roll back
   */
  public async putDocStrict<T extends { id?: string }>(type: string, doc: T): Promise<void> {
    const rawId = (doc as any).id || (type === 'company' ? 'COMP-001' : type === 'settings' ? 'app_settings' : 'doc');
    const docId = `${type}:${rawId}`;
    const tombstoneId = `tombstone:${type}:${rawId}`;

    // 1. Clear any existing tombstone in PouchDB so entity is live
    try {
      const existingTomb = await this.localDB.get(tombstoneId);
      await this.localDB.remove(existingTomb);
    } catch (e: any) {
      if (e.status !== 404) {
        try {
          const freshTomb = await this.localDB.get(tombstoneId);
          await this.localDB.remove(freshTomb);
        } catch (_tombErr: any) {
          // ignore
        }
      }
    }

    // 2. Fetch existing document revision if present
    let rev: string | undefined;
    try {
      const existing = await this.localDB.get(docId);
      rev = existing._rev;
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }

    // 3. Put document, resolving 409 conflicts by overwriting with latest revision
    try {
      await this.localDB.put({
        ...doc,
        id: rawId,
        _id: docId,
        _rev: rev,
        docType: type,
        syncedAt: new Date().toISOString(),
      });
    } catch (putErr: any) {
      if (putErr && putErr.status === 409) {
        const latest = (await this.localDB.get(docId)) as any;
        await this.localDB.put({
          ...doc,
          id: rawId,
          _id: docId,
          _rev: latest._rev,
          docType: type,
          syncedAt: new Date().toISOString(),
        });
      } else {
        throw putErr;
      }
    }

    this.notifyDataChange({
      id: docId,
      doc: { ...doc, id: rawId, docType: type },
      deleted: false,
    });
    this.refreshConflicts().catch(() => {});
  }

  /**
   * Strict document deletion for backup restore (REPLACE mode stale document removal):
   * - Writes tombstone with 409 resolution
   * - Removes primary document
   * - Rethrows any errors so the caller can safely roll back
   */
  public async deleteDocStrict(type: string, id: string): Promise<void> {
    const docId = `${type}:${id}`;
    const tombstoneId = `tombstone:${type}:${id}`;
    const now = new Date().toISOString();

    // 1. Write replicated tombstone document so deletions propagate across all replicas
    let tombRev: string | undefined;
    try {
      const existingTomb = await this.localDB.get(tombstoneId);
      tombRev = existingTomb._rev;
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }

    try {
      await this.localDB.put({
        _id: tombstoneId,
        _rev: tombRev,
        docType: 'tombstone',
        targetType: type,
        targetId: id,
        deletedAt: now,
        syncedAt: now,
      });
    } catch (putErr: any) {
      if (putErr && putErr.status === 409) {
        const latestTomb = await this.localDB.get(tombstoneId);
        await this.localDB.put({
          _id: tombstoneId,
          _rev: latestTomb._rev,
          docType: 'tombstone',
          targetType: type,
          targetId: id,
          deletedAt: now,
          syncedAt: now,
        });
      } else {
        throw putErr;
      }
    }

    // 2. Remove primary document from local PouchDB
    try {
      const existing = await this.localDB.get(docId);
      await this.localDB.remove(existing);
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }

    this.notifyDataChange({
      id: docId,
      deleted: true,
    });
    this.refreshConflicts().catch(() => {});
  }

  public async getAllTombstones(): Promise<ReplicatedTombstone[]> {
    try {
      const res = await this.localDB.allDocs({
        include_docs: true,
        startkey: 'tombstone:',
        endkey: 'tombstone:\ufff0',
      });
      return res.rows.map((r) => r.doc as any).filter((d) => d && d.docType === 'tombstone');
    } catch (e) {
      console.error('Error fetching tombstones from PouchDB:', e);
      return [];
    }
  }

  public async getAllDocsWithMeta<T>(
    type: string
  ): Promise<Array<T & { _id: string; _rev: string; _conflicts?: string[]; docType?: string; isDeleted?: boolean; deletedAt?: string; syncedAt?: string }>> {
    try {
      const res = await this.localDB.allDocs({
        include_docs: true,
        conflicts: true,
        startkey: `${type}:`,
        endkey: `${type}:\ufff0`,
      });
      return res.rows.map((r) => r.doc as any).filter(Boolean);
    } catch (e) {
      console.error(`PouchDB getAllDocsWithMeta error [${type}]:`, e);
      return [];
    }
  }

  public async getAllDocs<T>(type: string): Promise<T[]> {
    try {
      const docs = await this.getAllDocsWithMeta<T>(type);
      return docs.map(({ _id, _rev, _conflicts, docType, syncedAt, ...data }) => data as unknown as T);
    } catch (e) {
      console.error(`PouchDB getAllDocs error [${type}]:`, e);
      return [];
    }
  }

  public async getConflicts(): Promise<SyncConflict[]> {
    try {
      const res = await this.localDB.allDocs({
        include_docs: true,
        conflicts: true,
      });

      const conflicts: SyncConflict[] = [];

      for (const row of res.rows) {
        const doc = row.doc as any;
        if (doc && Array.isArray(doc._conflicts) && doc._conflicts.length > 0) {
          const colonIdx = row.id.indexOf(':');
          const docType = colonIdx !== -1 ? row.id.substring(0, colonIdx) : 'unknown';
          const entityId = colonIdx !== -1 ? row.id.substring(colonIdx + 1) : row.id;

          for (const conflictRev of doc._conflicts) {
            try {
              const conflictDoc = await this.localDB.get(row.id, { rev: conflictRev });
              conflicts.push({
                id: `${row.id}#${conflictRev}`,
                docId: row.id,
                docType,
                entityId,
                winningRev: doc._rev,
                conflictingRev: conflictRev,
                winningDoc: doc,
                conflictingDoc: conflictDoc,
                detectedAt: new Date().toISOString(),
              });
            } catch (err) {
              console.warn(`Could not load conflicting rev ${conflictRev} for ${row.id}:`, err);
            }
          }
        }
      }

      for (const explicitConflict of this.explicitConflicts.values()) {
        conflicts.push(explicitConflict);
      }

      return conflicts;
    } catch (e) {
      console.error('Error fetching conflicts from PouchDB:', e);
      return Array.from(this.explicitConflicts.values());
    }
  }

  public async refreshConflicts(): Promise<SyncConflict[]> {
    const conflicts = await this.getConflicts();
    this.notifySyncState({ conflicts, conflictsCount: conflicts.length });
    return conflicts;
  }

  public addExplicitConflict(conflict: SyncConflict): void {
    this.explicitConflicts.set(conflict.id, conflict);
    this.refreshConflicts().catch(() => {});
  }

  public removeExplicitConflict(conflictId: string): void {
    this.explicitConflicts.delete(conflictId);
    this.refreshConflicts().catch(() => {});
  }

  public async resolveConflict(
    docId: string,
    choice: 'keep_winning' | 'keep_conflicting' | 'merge',
    options?: { winningRev?: string; conflictingRev?: string; mergedDoc?: any }
  ): Promise<void> {
    try {
      // 1. Check if docId or conflict id is in explicitConflicts
      let explicitKey: string | undefined;
      for (const [key, c] of this.explicitConflicts.entries()) {
        if (
          key === docId ||
          c.id === docId ||
          c.docId === docId ||
          (options?.conflictingRev && c.conflictingRev === options.conflictingRev)
        ) {
          explicitKey = key;
          break;
        }
      }

      if (explicitKey) {
        const conflict = this.explicitConflicts.get(explicitKey)!;
        if (choice === 'keep_conflicting') {
          // Promote conflicting doc to PouchDB
          const existing = (await this.localDB.get(conflict.docId).catch(() => undefined)) as any;
          const { _id, _rev, _conflicts, ...content } = conflict.conflictingDoc;
          await this.localDB.put({
            ...content,
            _id: conflict.docId,
            _rev: existing?._rev,
            syncedAt: new Date().toISOString(),
          });
        }
        this.explicitConflicts.delete(explicitKey);
      } else {
        // 2. Native PouchDB revision conflict
        const existing = (await this.localDB.get(docId, { conflicts: true })) as any;
        const conflicts: string[] = existing._conflicts || [];
        const conflictRev = options?.conflictingRev || (conflicts.length > 0 ? conflicts[0] : undefined);

        if (choice === 'keep_conflicting' && conflictRev) {
          const conflictDoc = (await this.localDB.get(docId, { rev: conflictRev })) as any;
          const { _id, _rev, _conflicts, ...content } = conflictDoc;
          await this.localDB.put({
            ...content,
            _id: docId,
            _rev: existing._rev,
            syncedAt: new Date().toISOString(),
          });
          await this.localDB.remove(docId, conflictRev);
        } else if (choice === 'merge' && options?.mergedDoc) {
          const { _id, _rev, _conflicts, ...content } = options.mergedDoc;
          await this.localDB.put({
            ...content,
            _id: docId,
            _rev: existing._rev,
            syncedAt: new Date().toISOString(),
          });
          if (conflictRev) {
            await this.localDB.remove(docId, conflictRev);
          }
        } else {
          // 'keep_winning'
          if (conflictRev) {
            await this.localDB.remove(docId, conflictRev);
          } else {
            for (const cRev of conflicts) {
              await this.localDB.remove(docId, cRev);
            }
          }
        }
      }

      await this.refreshConflicts();
      this.notifyDataChange({ id: docId });
    } catch (e) {
      console.error(`Error resolving conflict for ${docId}:`, e);
      throw e;
    }
  }

  public async migrateFromLocalStorage(data: {
    company: CompanyProfile;
    parties: Party[];
    items: InventoryItem[];
    invoices: Invoice[];
    purchases: PurchaseBill[];
    expenses: Expense[];
    adjustments: StockAdjustment[];
    vouchers: Voucher[];
    bankAccounts?: any[];
    cashBankTxns?: any[];
  }): Promise<void> {
    const isMigrated = typeof localStorage !== 'undefined' ? localStorage.getItem('pouchdb_initial_migrated') : null;
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
      if (data.bankAccounts) {
        data.bankAccounts.forEach((b) => docs.push({ ...b, _id: `bank_account:${b.id}`, docType: 'bank_account', syncedAt: timestamp }));
      }
      if (data.cashBankTxns) {
        data.cashBankTxns.forEach((t) => docs.push({ ...t, _id: `cash_bank_txn:${t.id}`, docType: 'cash_bank_txn', syncedAt: timestamp }));
      }

      if (docs.length > 0) {
        await this.localDB.bulkDocs(docs);
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pouchdb_initial_migrated', 'true');
      }
    } catch (e) {
      console.error('PouchDB initial migration error:', e);
    }
  }
}

export const pouch = new PouchService();
