import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

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

import { pouch, DEFAULT_COUCHDB_REMOTE_URL } from '../services/pouchdb.ts';

describe('PouchDB Credential Isolation & Auto-Sync Disarming', () => {
  beforeEach(() => {
    testStorage.clear();
  });

  afterEach(() => {
    testStorage.clear();
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

    it('startSync preserves error status and does not clear it when paused with no error', () => {
      (pouch as any).currentState = {
        status: 'error',
        remoteUrl: 'https://user:pass@sync.example.com/db',
        error: 'Push permission denied (403): User cannot write to remote CouchDB',
        pendingChanges: 0,
      };

      // Simulate a paused event arriving with no error (idle pull)
      // Since status is 'error', it must NOT overwrite status with 'synced' or clear error
      (pouch as any).notifySyncState({});
      expect(pouch.getSyncState().status).toBe('error');
      expect(pouch.getSyncState().error).toContain('Push permission denied');
    });
  });
});
