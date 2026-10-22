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

  it('purges leaked demo CouchDB URL from localStorage on detection', () => {
    testStorage.setItem(
      'couchdb_remote_url',
      'https://demo:passwordisdemo@sync.brahmaputrahw.store/gst_demo'
    );

    const purged = pouch.purgeLeakedDemoRemote();
    expect(purged).toBe(true);
    expect(testStorage.getItem('couchdb_remote_url')).toBeNull();
    expect(pouch.getSyncState().status).toBe('offline');
  });

  it('retains user-configured custom CouchDB URLs without purging', () => {
    const customUrl = 'https://admin:mycustomsecret@couch.mybusiness.com/gst';
    testStorage.setItem('couchdb_remote_url', customUrl);

    const purged = pouch.purgeLeakedDemoRemote();
    expect(purged).toBe(false);
    expect(testStorage.getItem('couchdb_remote_url')).toBe(customUrl);
  });
});
