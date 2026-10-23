import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import PouchDB from 'pouchdb-browser';

class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });

import { pouch, PouchService, DEFAULT_COUCHDB_REMOTE_URL } from '../services/pouchdb.ts';

describe('PouchDB Credential Isolation & Auto-Sync Disarming', () => {
  beforeEach(() => {
    testStorage.clear();
  });

  afterEach(() => {
    testStorage.clear();
    vi.restoreAllMocks();
  });

  it('verifies DEFAULT_COUCHDB_REMOTE_URL contains no embedded credentials', () => {
    expect(DEFAULT_COUCHDB_REMOTE_URL).toBe('');
  });

  it('preserves a user-configured URL on the sync.brahmaputrahw.store host', () => {
    const customUrl = 'https://vyapar:secret@sync.brahmaputrahw.store/vyapar_prod';
    testStorage.setItem('couchdb_remote_url', customUrl);

    expect(pouch.getStoredRemoteUrl()).toBe(customUrl);
    expect(testStorage.getItem('couchdb_remote_url')).toBe(customUrl);
  });

  it('never auto-deletes any configured sync URL, regardless of host or database name', () => {
    const customUrl = 'https://admin:secret@sync.example.com/gst_demo';
    testStorage.setItem('couchdb_remote_url', customUrl);

    expect(pouch.getStoredRemoteUrl()).toBe(customUrl);
    expect(testStorage.getItem('couchdb_remote_url')).toBe(customUrl);
  });

  it('getStoredRemoteUrl falls back to Android SharedPreferences when localStorage is empty', () => {
    const bridge = {
      getPreference: vi.fn(() => 'https://android:secret@couch.example.com/gst'),
      setPreference: vi.fn(),
      removePreference: vi.fn(),
    };
    (window as any).AndroidBridge = bridge;
    testStorage.clear();

    expect(pouch.getStoredRemoteUrl()).toBe('https://android:secret@couch.example.com/gst');

    delete (window as any).AndroidBridge;
  });

  it('persistRemoteUrl mirrors the link into Android SharedPreferences', async () => {
    const bridge = {
      getPreference: vi.fn(() => ''),
      setPreference: vi.fn(),
      removePreference: vi.fn(),
    };
    (window as any).AndroidBridge = bridge;

    await (pouch as any).persistRemoteUrl('https://admin:secret@couch.example.com/gst');

    expect(testStorage.getItem('couchdb_remote_url')).toBe('https://admin:secret@couch.example.com/gst');
    expect(bridge.setPreference).toHaveBeenCalledWith(
      'couchdb_remote_url',
      'https://admin:secret@couch.example.com/gst'
    );

    delete (window as any).AndroidBridge;
  });

  describe('Cloud Sync Push Path, Connection Probes & Status Guarantees', () => {
    it('syncNow returns false and sets status offline when no remote URL is configured', async () => {
      testStorage.removeItem('couchdb_remote_url');

      const result = await pouch.syncNow();
      expect(result).toBe(false);
      expect(pouch.getSyncState().status).toBe('offline');
      expect(pouch.getSyncState().lastSyncedAt).toBeUndefined();
    });

    it('probeRemoteConnection verifies both read and write capabilities on healthy remote', async () => {
      const mockRemoteDB = {
        info: vi.fn(async () => ({ db_name: 'test_db', doc_count: 42 })),
        put: vi.fn(async () => ({ ok: true, rev: '1-mock' })),
        remove: vi.fn(async () => ({ ok: true })),
      };
      vi.spyOn(pouch as any, 'createRemoteDB').mockReturnValue(mockRemoteDB);

      const probe = await pouch.probeRemoteConnection('https://user:pass@sync.example.com/test_db');
      expect(probe.ok).toBe(true);
      expect(probe.details?.canRead).toBe(true);
      expect(probe.details?.canWrite).toBe(true);
      expect(probe.details?.dbName).toBe('test_db');
      expect(probe.details?.docCount).toBe(42);
    });

    it('probeRemoteConnection catches 401 Unauthorized read failure', async () => {
      const mockRemoteDB = {
        info: vi.fn(async () => {
          const err = new Error('Unauthorized');
          (err as any).status = 401;
          throw err;
        }),
      };
      vi.spyOn(pouch as any, 'createRemoteDB').mockReturnValue(mockRemoteDB);

      const probe = await pouch.probeRemoteConnection('https://baduser:badpass@sync.example.com/test_db');
      expect(probe.ok).toBe(false);
      expect(probe.error).toContain('401');
      expect(probe.details?.canRead).toBe(false);
      expect(pouch.getSyncState().status).toBe('error');
    });

    it('probeRemoteConnection detects read-only 403 Forbidden on probe write', async () => {
      const mockRemoteDB = {
        info: vi.fn(async () => ({ db_name: 'readonly_db', doc_count: 10 })),
        put: vi.fn(async () => {
          const err = new Error('Forbidden');
          (err as any).status = 403;
          throw err;
        }),
      };
      vi.spyOn(pouch as any, 'createRemoteDB').mockReturnValue(mockRemoteDB);

      const probe = await pouch.probeRemoteConnection('https://readonly:pass@sync.example.com/readonly_db');
      expect(probe.ok).toBe(false);
      expect(probe.error).toContain('Read-only');
      expect(probe.details?.canRead).toBe(true);
      expect(probe.details?.canWrite).toBe(false);
      expect(pouch.getSyncState().status).toBe('error');
    });

    it('putDoc surfaces database write errors in syncState and rethrows', async () => {
      const origPut = (pouch as any).localDB.put;
      (pouch as any).localDB.put = vi.fn(async () => {
        throw new Error('QuotaExceededError: Local database storage is full');
      });

      await expect(
        pouch.putDoc('invoice', { id: 'INV-TEST-ERR', total: 100 } as any)
      ).rejects.toThrow('QuotaExceededError');

      expect(pouch.getSyncState().status).toBe('error');
      expect(pouch.getSyncState().error).toContain('QuotaExceededError');

      (pouch as any).localDB.put = origPut;
    });

    it('createRemoteDB sanitizes URL by stripping inline credentials and trailing slashes', () => {
      const remote = (pouch as any).createRemoteDB('https://alice:secret123@sync.example.com/gst_demo/');
      expect(remote.name).toBe('https://sync.example.com/gst_demo');
    });

    it('createRemoteDB parses unencoded special characters in credentials gracefully', () => {
      const remote = (pouch as any).createRemoteDB('https://alice:p@ss#word@sync.example.com/gst_demo');
      expect(remote.name).toBe('https://sync.example.com/gst_demo');
    });

    it('clears transient sync error and transitions to synced when paused without error, while retaining push errors', async () => {
      const listeners: Record<string, Function> = {};
      const pushListeners: Record<string, Function> = {};
      const mockSync = {
        cancel: vi.fn(),
        push: {
          on: vi.fn((event: string, fn: Function) => {
            pushListeners[event] = fn;
            return mockSync.push;
          }),
        },
        pull: {
          on: vi.fn((_event: string, _fn: Function) => {
            return mockSync.pull;
          }),
        },
        on: vi.fn((event: string, fn: Function) => {
          listeners[event] = fn;
          return mockSync;
        }),
      };

      const syncSpy = vi.spyOn(PouchDB, 'sync').mockReturnValue(mockSync as any);

      PouchService.switchToRemoteDb('https://user:pass@sync.example.com/db');
      await pouch.startSync('https://user:pass@sync.example.com/db');

      // 1. Simulate a transient network error on paused
      listeners['paused']({ message: 'ETIMEDOUT' });
      expect(pouch.getSyncState().status).toBe('error');
      expect(pouch.getSyncState().error).toContain('ETIMEDOUT');

      // 2. Simulate recovery: paused fires with null/undefined error
      listeners['paused'](null);
      expect(pouch.getSyncState().status).toBe('synced');
      expect(pouch.getSyncState().error).toBeUndefined();

      // 3. Simulate push permission denied (403)
      pushListeners['error']({ status: 403, message: 'Forbidden' });
      expect(pouch.getSyncState().status).toBe('error');
      expect(pouch.getSyncState().error).toContain('Push permission denied (403)');

      // 4. Idle pull pause must NOT wipe the push error
      listeners['paused'](null);
      expect(pouch.getSyncState().status).toBe('error');
      expect(pouch.getSyncState().error).toContain('Push permission denied (403)');

      syncSpy.mockRestore();
    });

    it('handles fire-and-forget putDoc/deleteDoc rejections gracefully across domain storage entities', async () => {
      const origPut = (pouch as any).localDB.put;
      (pouch as any).localDB.put = vi.fn(async () => {
        throw new Error('QuotaExceeded: Disk full');
      });

      const { db } = await import('../services/db.ts');

      expect(() => {
        db.saveParty({
          id: 'PTY-PUT-ERR',
          name: 'Error Party',
          type: 'CUSTOMER',
          phone: '9999999999',
          currentBalance: 0,
          stateCode: '07',
          billingAddress: 'Street 1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
      }).not.toThrow();

      expect(() => {
        db.saveItem({
          id: 'ITEM-PUT-ERR',
          name: 'Error Item',
          currentStock: 10,
          salePrice: 100,
          purchasePrice: 80,
          category: 'Default',
          gstRate: 18,
          hsnSacCode: '1234',
          unit: 'PCS',
        } as any);
      }).not.toThrow();

      expect(() => {
        db.saveVoucher({
          id: 'VCH-PUT-ERR',
          voucherNumber: 'V-ERR-1',
          voucherType: 'PAYMENT',
          date: '2026-10-23',
          totalAmount: 50,
          paymentMode: 'CASH',
          entries: [],
        } as any);
      }).not.toThrow();

      expect(() => {
        db.saveExpense({
          id: 'EXP-PUT-ERR',
          date: '2026-10-23',
          category: 'General Operational',
          amount: 20,
          paymentMode: 'CASH',
        } as any);
      }).not.toThrow();

      expect(() => {
        db.saveCompany({
          id: 'company_profile',
          businessName: 'Test Biz',
        } as any);
      }).not.toThrow();

      (pouch as any).localDB.put = origPut;
    });

    it('blocks loadDemoData when not in demo mode, but allows it in demo mode even with saved remote URL', async () => {
      const { db } = await import('../services/db.ts');
      const { pouch, PouchService } = await import('../services/pouchdb.ts');

      // 1. Outside demo mode -> rejected
      testStorage.removeItem('gst_demo_mode');
      await expect(db.loadDemoData()).rejects.toThrow(
        /Demo data can only be loaded in the isolated demo database/
      );

      // 2. In demo mode with remote URL saved -> allowed
      testStorage.setItem('couchdb_remote_url', 'https://user:pass@sync.example.com/db');
      PouchService.enterDemoMode();
      expect(pouch.isDemoMode()).toBe(true);
      await expect(db.loadDemoData()).resolves.not.toThrow();

      PouchService.exitDemoMode();
    });

    it('isolates local databases per remote URL and derives deterministic names with FNV-1a hash', async () => {
      const { computeUrlHash, getPerRemoteDbName } = await import('../services/pouchdb.ts');

      const url1 = 'https://admin:secret123@couch.example.com/company_store';
      const url2 = 'https://other:pass@couch.example.com/company_store/';
      const url3 = 'https://admin:secret123@couch.example.com/other_store';

      const name1 = getPerRemoteDbName(url1);
      const name2 = getPerRemoteDbName(url2);
      const name3 = getPerRemoteDbName(url3);

      expect(name1).toMatch(/^vyapar_remote_company_store_[0-9a-f]{8}$/);
      // Stripping credentials and trailing slashes makes normalized names identical
      expect(name1).toBe(name2);
      // Different DB path generates different database name
      expect(name1).not.toBe(name3);

      // Unencoded special characters in password (@, #) must be stripped without changing DB name
      const urlSpecial1 = 'https://admin:p@ss#123@couch.example.com/company_store';
      const urlSpecial2 = 'https://admin:different#pass@couch.example.com/company_store';
      const nameSpecial1 = getPerRemoteDbName(urlSpecial1);
      const nameSpecial2 = getPerRemoteDbName(urlSpecial2);
      expect(nameSpecial1).toBe(name1);
      expect(nameSpecial2).toBe(name1);
    });

    it('determineActiveLocalDbName respects priority order and reads Android SharedPreferences synchronously', async () => {
      const { determineActiveLocalDbName, DEFAULT_LOCAL_DB_NAME, DEMO_LOCAL_DB_NAME } = await import('../services/pouchdb.ts');

      testStorage.clear();

      // 1. Empty storage -> default offline database
      expect(determineActiveLocalDbName()).toBe(DEFAULT_LOCAL_DB_NAME);

      // 2. Synchronous Android SharedPreferences fallback when localStorage is empty
      (window as any).AndroidBridge = {
        getPreference: vi.fn((key: string) => (key === 'couchdb_remote_url' ? 'https://sync.example.com/android_db' : '')),
      };
      testStorage.clear();
      const derivedFromAndroid = determineActiveLocalDbName();
      expect(derivedFromAndroid).toContain('vyapar_remote_android_db_');
      // Persisted active DB at startup
      expect(testStorage.getItem('gst_active_local_db')).toBe(derivedFromAndroid);
      delete (window as any).AndroidBridge;

      // 3. Explicit gst_active_local_db is authoritative
      testStorage.setItem('gst_active_local_db', 'custom_company_db');
      expect(determineActiveLocalDbName()).toBe('custom_company_db');

      // 4. Demo mode overrides all
      testStorage.setItem('gst_demo_mode', 'true');
      expect(determineActiveLocalDbName()).toBe(DEMO_LOCAL_DB_NAME);
      testStorage.removeItem('gst_demo_mode');
      testStorage.removeItem('gst_active_local_db');
    });

    it('switches between offline, remote, and demo databases cleanly', async () => {
      const { PouchService, DEFAULT_LOCAL_DB_NAME, DEMO_LOCAL_DB_NAME } = await import('../services/pouchdb.ts');

      // 1. Switch to remote DB
      testStorage.setItem('gst_last_hydrated_db', 'old_db');
      const remoteName = PouchService.switchToRemoteDb('https://user:pass@sync.example.com/store');
      expect(remoteName).toContain('vyapar_remote_store_');
      expect(testStorage.getItem('gst_active_local_db')).toBe(remoteName);
      expect(testStorage.getItem('couchdb_remote_url')).toBe('https://user:pass@sync.example.com/store');
      expect(testStorage.getItem('gst_sync_remote_url')).toBe('https://user:pass@sync.example.com/store');
      // activateLocalDatabase keeps last hydrated DB marker untouched
      expect(testStorage.getItem('gst_last_hydrated_db')).toBe('old_db');

      // 2. Switch to offline DB
      PouchService.switchToOfflineDb();
      expect(testStorage.getItem('gst_active_local_db')).toBe(DEFAULT_LOCAL_DB_NAME);
      // Saved remote URL remains preserved
      expect(testStorage.getItem('couchdb_remote_url')).toBe('https://user:pass@sync.example.com/store');

      // 3. Reconnect cloud
      const reconnected = PouchService.reconnectCloudDb();
      expect(reconnected).toBe(true);
      expect(testStorage.getItem('gst_active_local_db')).toBe(remoteName);

      // 4. Enter and exit demo mode
      PouchService.enterDemoMode();
      expect(testStorage.getItem('gst_demo_mode')).toBe('true');
      expect(testStorage.getItem('gst_active_local_db')).toBe(DEMO_LOCAL_DB_NAME);
      expect(testStorage.getItem('gst_pre_demo_db')).toBe(remoteName);

      PouchService.exitDemoMode();
      expect(testStorage.getItem('gst_demo_mode')).toBe('false');
      expect(testStorage.getItem('gst_active_local_db')).toBe(remoteName);

      // 5. Switch to remote DB without credentials preserves display label without blanking
      PouchService.switchToRemoteDb('https://sync.example.com/store');
      const registry = PouchService.getRegisteredDatabases();
      const entry = registry.find((e) => e.localDbName === remoteName);
      expect(entry?.label).toBe('Cloud Sync (sync.example.com/store)');
    });

    it('clearSyncedDataKeys clears synced entities, tombstones, conflicts, and settings while preserving device printing', async () => {
      const { db } = await import('../services/db.ts');

      testStorage.setItem('gst_sync_tombstones', JSON.stringify({ 'item:ITM-1': { type: 'item', id: 'ITM-1' } }));
      testStorage.setItem('gst_sync_conflicts', JSON.stringify([{ id: 'conf-1' }]));
      testStorage.setItem('gst_invoices', JSON.stringify([{ id: 'INV-1' }]));
      testStorage.setItem('gst_allow_negative_stock', 'true');
      testStorage.setItem(
        'gst_app_settings',
        JSON.stringify({
          printerWidth: '58mm',
          printerType: 'thermal',
          appLanguage: 'Hindi',
        })
      );

      db.clearSyncedDataKeys();

      expect(testStorage.getItem('gst_sync_tombstones')).toBeNull();
      expect(testStorage.getItem('gst_sync_conflicts')).toBeNull();
      expect(testStorage.getItem('gst_invoices')).toBeNull();
      expect(testStorage.getItem('gst_allow_negative_stock')).toBeNull();
      expect(testStorage.getItem('gst_app_settings')).toBeNull();

      // Device-local printing settings preserved
      const preservedPrinting = JSON.parse(testStorage.getItem('local_device_printing_settings') || '{}');
      expect(preservedPrinting.printerWidth).toBe('58mm');
      expect(preservedPrinting.printerType).toBe('thermal');
    });

    it('deduplicates concurrent startSync calls and initiates single replication', async () => {
      let syncCallCount = 0;

      const mockSync = {
        on: vi.fn().mockReturnThis(),
        cancel: vi.fn(),
      };

      const syncSpy = vi.spyOn(PouchDB, 'sync').mockImplementation(() => {
        syncCallCount++;
        return mockSync as any;
      });

      // Fire 3 concurrent calls with matching active DB
      PouchService.switchToRemoteDb('https://user:pass@sync.example.com/db');
      const p1 = pouch.startSync('https://user:pass@sync.example.com/db');
      const p2 = pouch.startSync('https://user:pass@sync.example.com/db');
      const p3 = pouch.startSync('https://user:pass@sync.example.com/db');

      await Promise.all([p1, p2, p3]);

      expect(syncCallCount).toBe(1);

      syncSpy.mockRestore();
    });

    it('switchToRemoteDb writes both sync URL keys; stopSync removes both and the Android pref', async () => {
      const bridge = {
        getPreference: vi.fn(() => ''),
        setPreference: vi.fn(),
        removePreference: vi.fn(),
      };
      (window as any).AndroidBridge = bridge;

      PouchService.switchToRemoteDb('https://user:pass@sync.example.com/store');
      expect(testStorage.getItem('couchdb_remote_url')).toBe('https://user:pass@sync.example.com/store');
      expect(testStorage.getItem('gst_sync_remote_url')).toBe('https://user:pass@sync.example.com/store');
      expect(bridge.setPreference).toHaveBeenCalledWith('couchdb_remote_url', 'https://user:pass@sync.example.com/store');

      pouch.stopSync();
      expect(testStorage.getItem('couchdb_remote_url')).toBeNull();
      expect(testStorage.getItem('gst_sync_remote_url')).toBeNull();
      expect(bridge.removePreference).toHaveBeenCalledWith('couchdb_remote_url');

      delete (window as any).AndroidBridge;
    });
  });
});
