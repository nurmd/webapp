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

export {
  DEFAULT_LOCAL_DB_NAME,
  DEMO_LOCAL_DB_NAME,
  POUCH_PERSIST_KEYS,
  LOCAL_DATABASES_REGISTRY_KEY,
} from './db/localDbConstants.ts';
import {
  DEFAULT_LOCAL_DB_NAME,
  DEMO_LOCAL_DB_NAME,
  POUCH_PERSIST_KEYS,
  LOCAL_DATABASES_REGISTRY_KEY,
} from './db/localDbConstants.ts';

/**
 * Computes deterministic 32-bit FNV-1a hex hash of a string.
 */
export function computeUrlHash(url: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Derives a deterministic local PouchDB name for a remote CouchDB URL.
 * Format: `vyapar_remote_<sanitized-db-name>_<short-hash>`
 * Normalizes by stripping inline credentials and trailing slashes.
 */
export function getPerRemoteDbName(remoteUrl: string): string {
  const clean = (remoteUrl || '').trim();
  if (!clean) return DEFAULT_LOCAL_DB_NAME;

  let sanitizedUrl = clean;
  let pathname = '';

  const credsMatch = clean.match(/^(https?:\/\/)([^/@:]+):(.*)@([^/@:]+)(:\d+)?(\/.*)?$/i);
  if (credsMatch) {
    const [, protocol, , , host, port = '', rest = ''] = credsMatch;
    const cleanRest = (rest || '').replace(/\/+$/, '') || '';
    pathname = cleanRest;
    sanitizedUrl = `${protocol}${host}${port}${cleanRest}`;
  } else {
    try {
      const parsed = new URL(clean);
      pathname = parsed.pathname.replace(/\/+$/, '') || '';
      sanitizedUrl = `${parsed.origin}${pathname}`;
    } catch {
      // If unparseable by new URL(), strip credentials using regex fallback
      const stripped = clean.replace(/^(https?:\/\/)([^/@:]+):(.*)@/i, '$1');
      sanitizedUrl = stripped.replace(/\/+$/, '');
      const protoIndex = sanitizedUrl.indexOf('://');
      const pathIndex = protoIndex >= 0 ? sanitizedUrl.indexOf('/', protoIndex + 3) : -1;
      if (pathIndex >= 0) {
        pathname = sanitizedUrl.substring(pathIndex);
      }
    }
  }

  const segments = pathname.split('/').filter(Boolean);
  const dbSegment = segments[segments.length - 1] || 'db';
  const sanitizedDb = dbSegment.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 24);
  const hash = computeUrlHash(sanitizedUrl.toLowerCase());
  return `vyapar_remote_${sanitizedDb}_${hash}`;
}

// The sync URL is user configuration. It is persisted redundantly so that a
// browser-storage reset or an app update cannot silently disconnect the device.
const SYNC_URL_STORAGE_KEY = 'couchdb_remote_url';
const SYNC_URL_LOCAL_DOC_ID = '_local/sync_remote_url';
const SYNC_URL_ANDROID_PREF_KEY = 'couchdb_remote_url';

function readAndroidPreferenceSync(key: string): string {
  try {
    if (typeof window !== 'undefined') {
      const bridge = (window as any).AndroidBridge;
      if (bridge && typeof bridge.getPreference === 'function') {
        const val = bridge.getPreference(key);
        return typeof val === 'string' ? val.trim() : '';
      }
    }
  } catch {}
  return '';
}

/**
 * Determines the currently active local PouchDB database name.
 * Priority:
 * 1. Demo Mode -> 'vyapar_demo'
 * 2. Explicitly set active DB in localStorage -> `gst_active_local_db`
 * 3. Saved remote URL (localStorage or synchronous Android SharedPreferences fallback) -> per-remote DB `vyapar_remote_<name>_<hash>`
 * 4. Default -> 'vyapar_fintech_store'
 * Persists the derived active DB at startup so subsequent reads remain consistent across reloads.
 */
export function determineActiveLocalDbName(): string {
  let activeDb: string = DEFAULT_LOCAL_DB_NAME;

  try {
    if (typeof localStorage !== 'undefined') {
      const isDemoMode = localStorage.getItem(POUCH_PERSIST_KEYS.DEMO_MODE) === 'true';
      if (isDemoMode) {
        return DEMO_LOCAL_DB_NAME;
      }
      const explicit = localStorage.getItem(POUCH_PERSIST_KEYS.ACTIVE_LOCAL_DB);
      if (explicit && explicit.trim()) {
        return explicit.trim();
      }
      let savedRemote =
        localStorage.getItem(SYNC_URL_STORAGE_KEY) ||
        localStorage.getItem(POUCH_PERSIST_KEYS.SYNC_REMOTE_URL) ||
        '';

      // Read Android SharedPreferences synchronously if localStorage was wiped or empty
      if (!savedRemote.trim()) {
        const fromAndroid = readAndroidPreferenceSync(SYNC_URL_ANDROID_PREF_KEY);
        if (fromAndroid.trim()) {
          savedRemote = fromAndroid.trim();
          try {
            localStorage.setItem(SYNC_URL_STORAGE_KEY, savedRemote);
            localStorage.setItem(POUCH_PERSIST_KEYS.SYNC_REMOTE_URL, savedRemote);
          } catch {}
        }
      }

      if (savedRemote && savedRemote.trim()) {
        activeDb = getPerRemoteDbName(savedRemote);
      }
    }
  } catch {}

  // Persist the derived active DB at startup
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(POUCH_PERSIST_KEYS.ACTIVE_LOCAL_DB, activeDb);
    }
  } catch {}

  return activeDb;
}

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

export interface LocalDatabaseEntry {
  localDbName: string;
  remoteUrl?: string;
  label: string;
  type: 'offline' | 'demo' | 'remote';
  lastUsedAt: string;
}

let activePouchInstance: PouchService | null = null;

export class PouchService {
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
  private pushError: string | null = null;
  private pullError: string | null = null;
  private syncStartPromise: Promise<void> | null = null;
  private activeDbName: string = DEFAULT_LOCAL_DB_NAME;

  public getActiveDbName(): string {
    return this.activeDbName;
  }

  public isDemoMode(): boolean {
    return this.activeDbName === DEMO_LOCAL_DB_NAME;
  }

  public isRemoteDbActive(): boolean {
    return this.activeDbName.startsWith('vyapar_remote_');
  }

  public shouldSync(): boolean {
    if (this.isDemoMode()) return false;
    const saved = this.getStoredRemoteUrl();
    if (!saved || !saved.trim()) return false;
    return getPerRemoteDbName(saved.trim()) === this.activeDbName;
  }

  public static activateLocalDatabase(opts: {
    localDbName: string;
    remoteUrl?: string;
    mode?: 'normal' | 'demo';
    label?: string;
  }): void {
    if (typeof localStorage === 'undefined') return;

    const localDbName = opts.localDbName.trim();
    const isDemo = opts.mode === 'demo' || localDbName === DEMO_LOCAL_DB_NAME;
    const isRemote = localDbName.startsWith('vyapar_remote_');
    const type: 'offline' | 'demo' | 'remote' = isDemo ? 'demo' : isRemote ? 'remote' : 'offline';

    const cleanRemoteUrl = (opts.remoteUrl || '').trim();

    localStorage.setItem(POUCH_PERSIST_KEYS.ACTIVE_LOCAL_DB, localDbName);
    localStorage.setItem(POUCH_PERSIST_KEYS.DEMO_MODE, isDemo ? 'true' : 'false');

    // Synchronous active-instance switch maintained because tests and immediate reloads rely on it.
    // Callers in production must perform a window.location.reload() before CRUD operations so
    // that domain caches and PouchDB singletons rehydrate cleanly from the new database.
    if (activePouchInstance) {
      if (activePouchInstance.syncHandler) {
        activePouchInstance.syncHandler.cancel();
        activePouchInstance.syncHandler = null;
      }
      activePouchInstance.activeDbName = localDbName;
      try {
        activePouchInstance.localDB = new PouchDB(localDbName, { auto_compaction: true });
        activePouchInstance.setupChangesListener();
      } catch {}
    }

    if (cleanRemoteUrl) {
      localStorage.setItem(SYNC_URL_STORAGE_KEY, cleanRemoteUrl);
      localStorage.setItem(POUCH_PERSIST_KEYS.SYNC_REMOTE_URL, cleanRemoteUrl);
      try {
        if (typeof window !== 'undefined') {
          const bridge = (window as any).AndroidBridge;
          if (bridge && typeof bridge.setPreference === 'function') {
            bridge.setPreference('couchdb_remote_url', cleanRemoteUrl);
          }
        }
      } catch {}
    }

    try {
      const existingRaw = localStorage.getItem(LOCAL_DATABASES_REGISTRY_KEY);
      let registry: LocalDatabaseEntry[] = existingRaw ? JSON.parse(existingRaw) : [];
      if (!Array.isArray(registry)) registry = [];

      const label =
        opts.label ||
        (isDemo ? 'Demo Sandbox' : isRemote ? `Cloud Database (${localDbName})` : 'Offline Primary Database');

      const existingIdx = registry.findIndex((e) => e.localDbName === localDbName);
      const entry: LocalDatabaseEntry = {
        localDbName,
        remoteUrl: cleanRemoteUrl || (existingIdx >= 0 ? registry[existingIdx].remoteUrl : undefined),
        label,
        type,
        lastUsedAt: new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        registry[existingIdx] = entry;
      } else {
        registry.push(entry);
      }

      localStorage.setItem(LOCAL_DATABASES_REGISTRY_KEY, JSON.stringify(registry));
    } catch (e) {
      console.warn('Failed to update local databases registry:', e);
    }
  }

  public static getRegisteredDatabases(): LocalDatabaseEntry[] {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(LOCAL_DATABASES_REGISTRY_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch {}
    return [
      {
        localDbName: DEFAULT_LOCAL_DB_NAME,
        label: 'Offline Primary Database',
        type: 'offline',
        lastUsedAt: new Date().toISOString(),
      },
    ];
  }

  public static switchToRemoteDb(remoteUrl: string): string {
    const cleanUrl = (remoteUrl || '').trim();
    const perRemoteDb = getPerRemoteDbName(cleanUrl);

    // Strip protocol first, then any inline credentials so URLs without credentials are not blanked
    let displayHostAndDb = cleanUrl.replace(/^https?:\/\//i, '');
    displayHostAndDb = displayHostAndDb.replace(/^[^/@]+@/, '');
    displayHostAndDb = displayHostAndDb.replace(/\/+$/, '');
    const label = `Cloud Sync (${displayHostAndDb || cleanUrl})`;

    PouchService.activateLocalDatabase({
      localDbName: perRemoteDb,
      remoteUrl: cleanUrl,
      mode: 'normal',
      label,
    });
    return perRemoteDb;
  }

  public static switchToOfflineDb(): void {
    PouchService.activateLocalDatabase({
      localDbName: DEFAULT_LOCAL_DB_NAME,
      mode: 'normal',
      label: 'Offline Primary Database',
    });
  }

  public static reconnectCloudDb(): boolean {
    if (typeof localStorage === 'undefined') return false;
    const savedRemote =
      localStorage.getItem(SYNC_URL_STORAGE_KEY) ||
      localStorage.getItem(POUCH_PERSIST_KEYS.SYNC_REMOTE_URL) ||
      '';
    if (!savedRemote.trim()) return false;
    PouchService.switchToRemoteDb(savedRemote);
    return true;
  }

  public static enterDemoMode(): void {
    if (typeof localStorage !== 'undefined') {
      const currentActive = localStorage.getItem(POUCH_PERSIST_KEYS.ACTIVE_LOCAL_DB) || DEFAULT_LOCAL_DB_NAME;
      const currentRemote =
        localStorage.getItem(SYNC_URL_STORAGE_KEY) ||
        localStorage.getItem(POUCH_PERSIST_KEYS.SYNC_REMOTE_URL) ||
        '';
      localStorage.setItem(POUCH_PERSIST_KEYS.PRE_DEMO_DB, currentActive);
      localStorage.setItem(POUCH_PERSIST_KEYS.PRE_DEMO_REMOTE, currentRemote);
      localStorage.setItem(POUCH_PERSIST_KEYS.PENDING_DEMO_LOAD, 'true');

      PouchService.activateLocalDatabase({
        localDbName: DEMO_LOCAL_DB_NAME,
        mode: 'demo',
        label: 'Demo Sandbox',
      });
    }
  }

  public static exitDemoMode(): void {
    if (typeof localStorage !== 'undefined') {
      const preDb = localStorage.getItem(POUCH_PERSIST_KEYS.PRE_DEMO_DB) || DEFAULT_LOCAL_DB_NAME;
      const preRemote = localStorage.getItem(POUCH_PERSIST_KEYS.PRE_DEMO_REMOTE) || '';

      PouchService.activateLocalDatabase({
        localDbName: preDb,
        remoteUrl: preRemote,
        mode: 'normal',
      });

      localStorage.removeItem(POUCH_PERSIST_KEYS.PRE_DEMO_DB);
      localStorage.removeItem(POUCH_PERSIST_KEYS.PRE_DEMO_REMOTE);
      localStorage.removeItem(POUCH_PERSIST_KEYS.PENDING_DEMO_LOAD);
    }
  }

  constructor() {
    activePouchInstance = this;
    this.activeDbName = determineActiveLocalDbName();
    try {
      this.localDB = new PouchDB(this.activeDbName, { auto_compaction: true });
      this.setupChangesListener();
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
    // Sync runs strictly when shouldSync() is true (activeDb is vyapar_remote_* and URL is saved).
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.shouldSync()) return;
        const saved = this.getStoredRemoteUrl();
        if (saved) {
          void this.startSync(saved);
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (!this.shouldSync()) return;
        if (document.visibilityState === 'visible') {
          const saved = this.getStoredRemoteUrl();
          if (saved && (!this.syncHandler || this.currentState.status === 'error' || this.currentState.status === 'offline')) {
            void this.startSync(saved);
          }
        }
      });
    }

    // Auto-sync gate on startup (50ms deferred).
    // Sync only starts when shouldSync() is true (activeDb is vyapar_remote_* and URL is saved).
    setTimeout(() => {
      if (!this.shouldSync()) {
        console.info(`[PouchDB] Auto-sync disarmed for database '${this.activeDbName}'.`);
        return;
      }
      const savedRemote = this.getStoredRemoteUrl();
      if (savedRemote) {
        void this.startSync(savedRemote);
      }
    }, 50);
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
   * localStorage 'couchdb_remote_url', then 'gst_sync_remote_url', then Android SharedPreferences.
   */
  public getStoredRemoteUrl(): string {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(SYNC_URL_STORAGE_KEY);
        if (saved && saved.trim()) return saved.trim();
        const alt = localStorage.getItem(POUCH_PERSIST_KEYS.SYNC_REMOTE_URL);
        if (alt && alt.trim()) return alt.trim();
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
        localStorage.setItem(POUCH_PERSIST_KEYS.SYNC_REMOTE_URL, clean);
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
        localStorage.removeItem(POUCH_PERSIST_KEYS.SYNC_REMOTE_URL);
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
    let sanitizedUrl = cleanUrl;
    let authConfig: { username?: string; password?: string } | undefined;

    // Check for credentials in URL (including unencoded special characters like #, :, or @ in passwords)
    const credsMatch = cleanUrl.match(/^(https?:\/\/)([^/@:]+):(.*)@([^/@:]+)(:\d+)?(\/.*)?$/i);
    if (credsMatch) {
      const [, protocol, username, password, host, port = '', rest = ''] = credsMatch;
      authConfig = {
        username: decodeURIComponent(username),
        password: decodeURIComponent(password),
      };
      const cleanRest = (rest || '').replace(/\/+$/, '') || '';
      sanitizedUrl = `${protocol}${host}${port}${cleanRest}`;
    } else {
      try {
        const parsed = new URL(cleanUrl);
        if (parsed.username || parsed.password) {
          authConfig = {
            username: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
          };
        }
        const cleanPath = parsed.pathname.replace(/\/+$/, '') || '';
        sanitizedUrl = `${parsed.origin}${cleanPath}${parsed.search}`;
      } catch {
        // Retain cleanUrl as-is if unparseable
      }
    }

    return new PouchDB(sanitizedUrl, {
      skip_setup: true,
      auth: authConfig?.username ? { username: authConfig.username, password: authConfig.password || '' } : undefined,
    });
  }

  private changesHandler: any = null;

  private setupChangesListener(): void {
    if (this.changesHandler && typeof this.changesHandler.cancel === 'function') {
      try {
        this.changesHandler.cancel();
      } catch {}
      this.changesHandler = null;
    }
    try {
      this.changesHandler = this.localDB
        .changes({ since: 'now', live: true, include_docs: true })
        .on('change', (change: any) => {
          this.notifyDataChange({
            id: change.id,
            doc: change.doc,
            deleted: change.deleted,
          });
        })
        .on('error', (err: any) => {
          console.warn('PouchDB changes feed error:', err);
        });
    } catch {}
  }

  public async startSync(remoteUrl: string): Promise<void> {
    if (this.isDemoMode()) {
      this.notifySyncState({
        status: 'offline',
        error: 'Cloud Sync is disabled in Demo Mode. Return to your live database first.',
      });
      return;
    }

    const cleanUrl = (remoteUrl || '').trim();
    if (!cleanUrl) {
      if (this.syncHandler) {
        this.syncHandler.cancel();
        this.syncHandler = null;
      }
      void this.removePersistedRemoteUrl();
      this.notifySyncState({ status: 'offline', remoteUrl: '', error: undefined, pendingChanges: 0 });
      return;
    }

    const targetDbName = getPerRemoteDbName(cleanUrl);
    if (this.activeDbName !== targetDbName) {
      this.notifySyncState({
        status: 'offline',
        error: `Active database '${this.activeDbName}' does not match cloud target '${targetDbName}'. Please reconnect or switch databases first.`,
      });
      return;
    }

    if (this.syncStartPromise) {
      return this.syncStartPromise;
    }
    this.syncStartPromise = this.doStartSync(cleanUrl).finally(() => {
      this.syncStartPromise = null;
    });
    return this.syncStartPromise;
  }

  private async doStartSync(remoteUrl: string): Promise<void> {
    if (this.syncHandler) {
      this.syncHandler.cancel();
      this.syncHandler = null;
    }
    this.pushError = null;
    this.pullError = null;

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
    await this.persistRemoteUrl(cleanUrl);

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

      // Capture push-specific replication events, errors & permission denial
      if ((this.syncHandler as any).push) {
        (this.syncHandler as any).push
          .on('change', () => {
            this.pushError = null;
          })
          .on('paused', (err: any) => {
            if (!err) {
              this.pushError = null;
              if (!this.pullError && this.currentState.status === 'error') {
                this.notifySyncState({ status: 'synced', error: undefined, lastSyncedAt: new Date().toISOString() });
              }
            }
          })
          .on('error', (err: any) => {
            console.error('PouchDB sync push error:', err);
            const msg = err?.message || String(err);
            const errMsg = err?.status === 403 || err?.status === 401
              ? `Push permission denied (${err.status}): User cannot write to remote CouchDB`
              : `Push sync error: ${msg}`;
            this.pushError = errMsg;
            this.notifySyncState({ status: 'error', error: errMsg });
          })
          .on('denied', (err: any) => {
            console.error('PouchDB sync push denied:', err);
            const errMsg = `Push Denied: ${err?.message || err || 'Write access rejected'}`;
            this.pushError = errMsg;
            this.notifySyncState({ status: 'error', error: errMsg });
          });
      }

      // Capture pull-specific replication events, errors & permission denial
      if ((this.syncHandler as any).pull) {
        (this.syncHandler as any).pull
          .on('change', () => {
            this.pullError = null;
          })
          .on('paused', (err: any) => {
            if (!err) {
              this.pullError = null;
              if (!this.pushError && this.currentState.status === 'error') {
                this.notifySyncState({ status: 'synced', error: undefined, lastSyncedAt: new Date().toISOString() });
              }
            }
          })
          .on('error', (err: any) => {
            console.error('PouchDB sync pull error:', err);
            const errMsg = `Pull sync error: ${err?.message || err}`;
            this.pullError = errMsg;
            this.notifySyncState({ status: 'error', error: errMsg });
          })
          .on('denied', (err: any) => {
            console.error('PouchDB sync pull denied:', err);
            const errMsg = `Pull Denied: ${err?.message || err || 'Read access rejected'}`;
            this.pullError = errMsg;
            this.notifySyncState({ status: 'error', error: errMsg });
          });
      }

      this.syncHandler
        .on('change', (info) => {
          this.pushError = null;
          this.pullError = null;
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
            const activeError = this.pushError || this.pullError;
            if (activeError) {
              this.notifySyncState({ status: 'error', error: activeError });
            } else {
              this.notifySyncState({ status: 'synced', error: undefined, lastSyncedAt: new Date().toISOString() });
              this.refreshConflicts().catch(() => {});
            }
          }
        })
        .on('active', () => {
          const activeError = this.pushError || this.pullError;
          if (activeError) {
            this.notifySyncState({ status: 'syncing' });
          } else {
            this.notifySyncState({ status: 'syncing', error: undefined });
          }
        })
        .on('denied', (err: any) => {
          const errMsg = 'Authentication Denied: ' + (err?.message || err || '');
          this.notifySyncState({ status: 'error', error: errMsg });
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
    this.pushError = null;
    this.pullError = null;
    void this.removePersistedRemoteUrl();
    this.notifySyncState({ status: 'offline', remoteUrl: '', error: undefined, pendingChanges: 0 });
  }

  public async syncNow(): Promise<boolean> {
    if (!this.shouldSync()) {
      let reason = `Manual sync is only available when a cloud database is active (current: '${this.activeDbName}').`;
      if (this.isDemoMode()) {
        reason = 'Sync is disabled while Demo Database is active.';
      } else {
        const saved = this.getStoredRemoteUrl();
        if (!saved || !saved.trim()) {
          reason = 'No remote CouchDB URL configured.';
        } else if (getPerRemoteDbName(saved.trim()) !== this.activeDbName) {
          reason = `Active database '${this.activeDbName}' does not match cloud target '${getPerRemoteDbName(saved.trim())}'. Reconnect or switch databases first.`;
        }
      }
      this.notifySyncState({
        status: 'offline',
        error: reason,
      });
      return false;
    }

    const savedRemote = this.getStoredRemoteUrl();
    if (savedRemote) {
      this.notifySyncState({ status: 'syncing' });
      try {
        const remoteDB = this.createRemoteDB(savedRemote);
        await PouchDB.replicate(remoteDB, this.localDB, { batch_size: 100 });
        await PouchDB.replicate(this.localDB, remoteDB, { batch_size: 100 });
        this.pushError = null;
        this.pullError = null;
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
