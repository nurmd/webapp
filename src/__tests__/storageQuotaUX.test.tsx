// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  getStorageHealth,
  subscribeStorageHealth,
  recordQuotaExceeded,
  recordQuotaRecovered,
  resetStorageHealthForTests,
  getStorageEstimate,
  formatBytes,
} from '../services/db/storageHealth.ts';
import { StorageEngine } from '../services/db/storageEngine.ts';
import { db } from '../services/db.ts';
import { StorageQuotaBanner } from '../components/Common/StorageQuotaBanner.tsx';

// ---------------------------------------------------------------------------
// Mock Storage Implementation for Test Environment
// ---------------------------------------------------------------------------
class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
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
    this.store.set(key, String(value));
  }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: testStorage,
  writable: true,
  configurable: true,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: testStorage,
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Mocks for External Storage Engines (PouchDB & AuditTrail)
// ---------------------------------------------------------------------------
vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => {}),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
    isDemoMode: vi.fn(() => false),
  },
  PouchService: vi.fn(),
}));

vi.mock('../services/auditTrail.ts', () => ({
  auditTrail: {
    logEvent: vi.fn(async () => {}),
    getRecentLogs: vi.fn(async () => []),
    getLogsByDocument: vi.fn(async () => []),
  },
}));

describe('Phase 1.2 Storage Quota UX Suite', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    testStorage.clear();
    resetStorageHealthForTests();
    vi.restoreAllMocks();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      container.remove();
    }
    resetStorageHealthForTests();
    vi.restoreAllMocks();
  });

  describe('storageHealth unit diagnostics', () => {
    it('formatBytes correctly scales bytes from B to GB and handles edge values', () => {
      expect(formatBytes(undefined)).toBe('0 B');
      expect(formatBytes(NaN)).toBe('0 B');
      expect(formatBytes(-100)).toBe('0 B');
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1024 * 1024 * 5)).toBe('5.0 MB');
      expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB');
    });

    it('recordQuotaExceeded updates snapshot, increments failedWrites, and notifies subscribers', () => {
      const subscriber = vi.fn();
      const unsubscribe = subscribeStorageHealth(subscriber);

      expect(getStorageHealth().quotaExceeded).toBe(false);
      expect(getStorageHealth().failedWrites).toBe(0);

      recordQuotaExceeded('gst_invoices');

      const health = getStorageHealth();
      expect(health.quotaExceeded).toBe(true);
      expect(health.affectedKeys).toEqual(['gst_invoices']);
      expect(health.failedWrites).toBe(1);
      expect(health.lastQuotaAt).toBeDefined();
      expect(subscriber).toHaveBeenCalledTimes(1);

      // Multiple keys
      recordQuotaExceeded('gst_items');
      const health2 = getStorageHealth();
      expect(health2.affectedKeys).toEqual(['gst_invoices', 'gst_items']);
      expect(health2.failedWrites).toBe(2);
      expect(subscriber).toHaveBeenCalledTimes(2);

      unsubscribe();
      recordQuotaExceeded('gst_parties');
      expect(subscriber).toHaveBeenCalledTimes(2); // no more calls after unsubscribe
    });

    it('recordQuotaRecovered updates snapshot and clears quotaExceeded when empty', () => {
      recordQuotaExceeded('key_a');
      recordQuotaExceeded('key_b');
      expect(getStorageHealth().affectedKeys).toEqual(['key_a', 'key_b']);
      expect(getStorageHealth().quotaExceeded).toBe(true);

      // Partially recover key_a
      recordQuotaRecovered(['key_a']);
      expect(getStorageHealth().affectedKeys).toEqual(['key_b']);
      expect(getStorageHealth().quotaExceeded).toBe(true);
      expect(getStorageHealth().lastRecoveredAt).toBeDefined();

      // Recover remaining key_b
      recordQuotaRecovered(['key_b']);
      expect(getStorageHealth().affectedKeys).toEqual([]);
      expect(getStorageHealth().quotaExceeded).toBe(false);

      // Calling with no args clears everything
      recordQuotaExceeded('key_c');
      recordQuotaRecovered();
      expect(getStorageHealth().affectedKeys).toEqual([]);
      expect(getStorageHealth().quotaExceeded).toBe(false);
    });

    it('getStorageEstimate returns estimates when navigator.storage is supported and gracefully degrades', async () => {
      const originalStorage = navigator.storage;

      // Mock navigator.storage.estimate
      const mockEstimate = vi.fn().mockResolvedValue({
        usage: 2500000,
        quota: 10000000,
      });

      Object.defineProperty(navigator, 'storage', {
        value: { estimate: mockEstimate },
        configurable: true,
      });

      const est = await getStorageEstimate();
      expect(est.supported).toBe(true);
      expect(est.usage).toBe(2500000);
      expect(est.quota).toBe(10000000);
      expect(est.percent).toBe(25);

      // Fallback when estimate throws
      mockEstimate.mockRejectedValue(new Error('Permission denied'));
      const fallbackEst = await getStorageEstimate();
      expect(fallbackEst.supported).toBe(false);

      // Restore
      Object.defineProperty(navigator, 'storage', {
        value: originalStorage,
        configurable: true,
      });
    });
  });

  describe('StorageEngine quota handling & recovery', () => {
    it('catches QuotaExceededError, preserves in-memory cache, flags storageHealth, and recovers on retry', () => {
      const engine = new StorageEngine();
      const testKey = 'test_quota_key';
      const testData = { name: 'Item Alpha', stock: 42 };

      // Make localStorage.setItem throw QuotaExceededError
      const quotaErr = new Error('Storage quota exceeded');
      quotaErr.name = 'QuotaExceededError';
      const originalSetItem = testStorage.setItem.bind(testStorage);
      const setItemSpy = vi.spyOn(testStorage, 'setItem').mockImplementation(() => {
        throw quotaErr;
      });

      // Write through engine
      engine.set(testKey, testData);

      // 1. In-memory cache returns the written value without failure
      expect(engine.get(testKey, { name: '', stock: 0 })).toEqual(testData);

      // 2. Storage health and quota exceeded keys reflect the failure
      const health = getStorageHealth();
      expect(health.quotaExceeded).toBe(true);
      expect(health.affectedKeys).toContain(testKey);
      expect(engine.getQuotaExceededKeys()).toContain(testKey);

      // 3. Restore localStorage.setItem to work normally
      setItemSpy.mockRestore();

      // 4. Retry quota failed writes
      const retryResult = engine.retryQuotaFailedWrites();
      expect(retryResult.retried).toBe(1);
      expect(retryResult.recovered).toBe(1);
      expect(retryResult.stillFailing).toBe(0);

      // 5. Verification: health cleared and persisted to localStorage
      expect(getStorageHealth().quotaExceeded).toBe(false);
      expect(engine.getQuotaExceededKeys()).toEqual([]);
      expect(testStorage.getItem(testKey)).toBe(JSON.stringify(testData));
    });

    it('attempts safe one-time reclaim of legacy gst_audit_logs on first quota error', () => {
      const engine = new StorageEngine();
      testStorage.setItem('gst_audit_logs', 'huge_old_audit_data');

      let attemptCount = 0;
      const quotaErr = new Error('Storage quota exceeded');
      quotaErr.name = 'QuotaExceededError';

      vi.spyOn(testStorage, 'setItem').mockImplementation((key, value) => {
        attemptCount++;
        if (key === 'new_doc' && testStorage.getItem('gst_audit_logs') !== null) {
          throw quotaErr;
        }
        testStorage.removeItem(key);
      });

      engine.set('new_doc', { success: true });

      // The legacy audit logs should have been removed to reclaim space
      expect(testStorage.getItem('gst_audit_logs')).toBeNull();
    });
  });

  describe('<StorageQuotaBanner /> UX Component', () => {
    it('renders null when there is no storage quota failure', async () => {
      await act(async () => {
        root!.render(<StorageQuotaBanner />);
      });

      expect(container!.querySelector('[data-testid="storage-quota-banner"]')).toBeNull();
    });

    it('renders banner when quota is exceeded, showing device full message and count', async () => {
      recordQuotaExceeded('party_data');
      recordQuotaExceeded('invoice_data');

      await act(async () => {
        root!.render(<StorageQuotaBanner />);
      });

      const banner = container!.querySelector('[data-testid="storage-quota-banner"]');
      expect(banner).not.toBeNull();
      expect(banner!.getAttribute('role')).toBe('status');
      expect(banner!.textContent).toContain('Device storage is full');
      expect(banner!.textContent).toContain('2 change(s) are saved to the database but could not be cached locally.');
    });

    it('hides when the Dismiss button is clicked', async () => {
      recordQuotaExceeded('settings_data');

      await act(async () => {
        root!.render(<StorageQuotaBanner />);
      });

      expect(container!.querySelector('[data-testid="storage-quota-banner"]')).not.toBeNull();

      const dismissBtn = container!.querySelector(
        'button[aria-label="Dismiss storage warning"]'
      ) as HTMLButtonElement;
      expect(dismissBtn).not.toBeNull();

      await act(async () => {
        dismissBtn.click();
      });

      expect(container!.querySelector('[data-testid="storage-quota-banner"]')).toBeNull();
    });

    it('calls db.retryQuotaFailedWrites when Retry save is clicked and disappears upon recovery', async () => {
      // Setup a failing write in db
      const quotaErr = new Error('Quota exceeded');
      quotaErr.name = 'QuotaExceededError';

      const setItemSpy = vi.spyOn(testStorage, 'setItem').mockImplementation(() => {
        throw quotaErr;
      });

      db.set('test_party_key', { id: 'P1', name: 'Test Party' });
      expect(getStorageHealth().quotaExceeded).toBe(true);

      await act(async () => {
        root!.render(<StorageQuotaBanner />);
      });

      expect(container!.querySelector('[data-testid="storage-quota-banner"]')).not.toBeNull();

      // Restore setItem so retry succeeds
      setItemSpy.mockRestore();

      const retryBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Retry save')
      ) as HTMLButtonElement;
      expect(retryBtn).not.toBeNull();

      await act(async () => {
        retryBtn.click();
      });

      // After recovery, health is cleared and banner disappears
      expect(getStorageHealth().quotaExceeded).toBe(false);
      expect(container!.querySelector('[data-testid="storage-quota-banner"]')).toBeNull();
    });
  });
});
