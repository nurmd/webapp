import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageEngine } from '../services/db/storageEngine.ts';
import {
  getStorageHealth,
  subscribeStorageHealth,
  resetStorageHealthForTests,
} from '../services/db/storageHealth.ts';

/**
 * Real localStorage shim backed by an in-memory Map that throws DOMException
 * 'QuotaExceededError' once a configurable byte threshold is exceeded.
 */
class QuotaLocalStorageShim implements Storage {
  private store: Map<string, string> = new Map();
  private maxBytes: number;

  constructor(maxBytes: number = 2048) {
    this.maxBytes = maxBytes;
  }

  setMaxBytes(bytes: number): void {
    this.maxBytes = bytes;
  }

  getMaxBytes(): number {
    return this.maxBytes;
  }

  getCurrentBytes(): number {
    let bytes = 0;
    for (const [k, v] of this.store.entries()) {
      bytes += k.length + v.length;
    }
    return bytes;
  }

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    const strVal = String(value);
    const existingVal = this.store.get(key) || '';
    const currentBytes = this.getCurrentBytes();
    const oldEntryBytes = this.store.has(key) ? key.length + existingVal.length : 0;
    const newEntryBytes = key.length + strVal.length;
    const projectedBytes = currentBytes - oldEntryBytes + newEntryBytes;

    if (projectedBytes > this.maxBytes) {
      const err = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      Object.defineProperty(err, 'code', { value: 22 });
      throw err;
    }
    this.store.set(key, strVal);
  }
}

describe('StorageEngine quota recovery integration with QuotaLocalStorageShim (fake-indexeddb)', () => {
  let shim: QuotaLocalStorageShim;
  let engine: StorageEngine;
  let originalGlobalLocalStorage: Storage | undefined;
  let originalWindowLocalStorage: Storage | undefined;

  beforeEach(() => {
    resetStorageHealthForTests();

    // 1500 bytes initial budget for quota tests
    shim = new QuotaLocalStorageShim(1500);

    originalGlobalLocalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: shim,
      writable: true,
      configurable: true,
    });

    if (typeof window !== 'undefined') {
      originalWindowLocalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: shim,
        writable: true,
        configurable: true,
      });
    }

    engine = new StorageEngine();
  });

  afterEach(() => {
    resetStorageHealthForTests();

    if (originalGlobalLocalStorage !== undefined) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalGlobalLocalStorage,
        writable: true,
        configurable: true,
      });
    }

    if (typeof window !== 'undefined' && originalWindowLocalStorage !== undefined) {
      Object.defineProperty(window, 'localStorage', {
        value: originalWindowLocalStorage,
        writable: true,
        configurable: true,
      });
    }
  });

  it('a write that exceeds the threshold records quota exceeded via recordQuotaExceeded', () => {
    // 1. Initial baseline: clean health state
    expect(getStorageHealth().quotaExceeded).toBe(false);
    expect(getStorageHealth().failedWrites).toBe(0);
    expect(getStorageHealth().affectedKeys).toEqual([]);

    // 2. Small write comfortably within budget (1500 bytes)
    const smallParty = { id: 'party-1', name: 'Standard Store', balance: 500 };
    engine.set('gst_parties', [smallParty]);

    expect(getStorageHealth().quotaExceeded).toBe(false);
    expect(engine.getQuotaExceededKeys()).toEqual([]);
    expect(shim.getItem('gst_parties')).toBe(JSON.stringify([smallParty]));

    // 3. Write that exceeds the 1500-byte threshold
    const largeInvoices = Array.from({ length: 40 }, (_, idx) => ({
      id: `inv-${idx}`,
      invoiceNumber: `INV-2026-${String(idx).padStart(4, '0')}`,
      partyName: 'Large Distribution Partner Limited',
      grandTotal: 15400,
      notes: 'Line item breakdown notes exceeding quota threshold',
    }));

    // This write will trigger QuotaExceededError in the shim
    engine.set('gst_invoices', largeInvoices);

    // 4. Assertions:
    // Memory cache retains the data so the app continues without crashing
    expect(engine.get('gst_invoices', [])).toEqual(largeInvoices);

    // StorageEngine tracks the failed key
    expect(engine.getQuotaExceededKeys()).toContain('gst_invoices');

    // Health snapshot is updated via recordQuotaExceeded
    const health = getStorageHealth();
    expect(health.quotaExceeded).toBe(true);
    expect(health.affectedKeys).toContain('gst_invoices');
    expect(health.failedWrites).toBeGreaterThanOrEqual(1);
    expect(health.lastQuotaAt).toBeDefined();

    // The key was not committed to disk
    expect(shim.getItem('gst_invoices')).toBeNull();
  });

  it('a subsequent successful write clears it via recordQuotaRecovered', () => {
    // 1. Trigger quota exceeded condition
    const hugePayload = { id: 'large-data', blob: 'x'.repeat(2500) };
    engine.set('gst_large_payload', hugePayload);

    expect(getStorageHealth().quotaExceeded).toBe(true);
    expect(engine.getQuotaExceededKeys()).toContain('gst_large_payload');

    // 2. Expand quota budget (simulating disk cleanup or quota increase)
    shim.setMaxBytes(10000);

    // 3. Retry failed writes via StorageEngine retryQuotaFailedWrites
    const retryResult = engine.retryQuotaFailedWrites();
    expect(retryResult.retried).toBe(1);
    expect(retryResult.recovered).toBe(1);
    expect(retryResult.stillFailing).toBe(0);

    // 4. Assertions:
    // StorageEngine cleared the quota-exceeded key
    expect(engine.getQuotaExceededKeys()).toEqual([]);

    // Health snapshot cleared quotaExceeded via recordQuotaRecovered
    const health = getStorageHealth();
    expect(health.quotaExceeded).toBe(false);
    expect(health.affectedKeys).not.toContain('gst_large_payload');
    expect(health.lastRecoveredAt).toBeDefined();

    // The item is now durably stored in the shim
    expect(shim.getItem('gst_large_payload')).toBe(JSON.stringify(hugePayload));
  });

  it('health snapshot reflects quotaExceeded correctly across multiple keys and reactive subscribers', () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeStorageHealth(subscriber);

    // Set tight budget: 500 bytes
    shim.setMaxBytes(500);

    // Write key 1: consumes ~202 bytes
    const doc1 = { id: 'item-1', name: 'Item Alpha', data: 'A'.repeat(150) };
    engine.set('key_alpha', doc1);
    expect(getStorageHealth().quotaExceeded).toBe(false);

    // Write key 2: will exceed 500 bytes (202 + 350 = 552 bytes)
    const doc2 = { id: 'item-2', name: 'Item Beta', data: 'B'.repeat(300) };
    engine.set('key_beta', doc2);

    expect(getStorageHealth().quotaExceeded).toBe(true);
    expect(getStorageHealth().affectedKeys).toEqual(['key_beta']);
    expect(subscriber).toHaveBeenCalled();

    // Write key 3: will also exceed 500 bytes (202 + 352 = 554 bytes)
    const doc3 = { id: 'item-3', name: 'Item Gamma', data: 'C'.repeat(300) };
    engine.set('key_gamma', doc3);

    expect(getStorageHealth().quotaExceeded).toBe(true);
    expect(getStorageHealth().affectedKeys).toContain('key_beta');
    expect(getStorageHealth().affectedKeys).toContain('key_gamma');
    expect(getStorageHealth().failedWrites).toBe(2);

    // Overwrite key_beta with tiny payload that fits into available space
    engine.set('key_beta', { id: 'item-2', mini: true });

    // key_beta recovered, key_gamma still failing
    expect(getStorageHealth().quotaExceeded).toBe(true);
    expect(getStorageHealth().affectedKeys).toEqual(['key_gamma']);
    expect(engine.getQuotaExceededKeys()).toEqual(['key_gamma']);

    // Expand storage limit to clear remaining key_gamma
    shim.setMaxBytes(10000);
    const retryResult = engine.retryQuotaFailedWrites();
    expect(retryResult.recovered).toBe(1);

    // All keys recovered: quotaExceeded must be false and affectedKeys empty
    const finalHealth = getStorageHealth();
    expect(finalHealth.quotaExceeded).toBe(false);
    expect(finalHealth.affectedKeys).toEqual([]);
    expect(engine.getQuotaExceededKeys()).toEqual([]);

    unsubscribe();
  });
});
