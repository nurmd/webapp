import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

class TestStorage implements Storage {
  private store = new Map<string, string>();

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
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
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

const inMemoryDocs = new Map<string, any>();

vi.mock('../services/pouchdb.ts', () => {
  return {
    pouch: {
      putDoc: vi.fn(async (type: string, doc: any) => {
        inMemoryDocs.set(`${type}:${doc.id}`, { ...doc, docType: type });
      }),
      deleteDoc: vi.fn(async (type: string, id: string) => {
        inMemoryDocs.delete(`${type}:${id}`);
      }),
      getAllDocs: vi.fn(async (type: string) => {
        const prefix = `${type}:`;
        return Array.from(inMemoryDocs.entries())
          .filter(([k]) => k.startsWith(prefix))
          .map(([, v]) => ({ ...v }));
      }),
      syncNow: vi.fn(async () => ({ ok: true })),
      subscribeState: vi.fn(() => () => {}),
      onDataChange: vi.fn(() => () => {}),
      notifyDataChange: vi.fn(),
      getState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
      migrateFromLocalStorage: vi.fn(async () => {}),
    },
  };
});

import { auditTrail, AuditTrailService } from '../services/auditTrail.ts';
import { db } from '../services/db.ts';
import { pouch } from '../services/pouchdb.ts';

describe('5MB LocalStorage Limit Optimization & QuotaExceededError Handling', () => {
  beforeEach(async () => {
    testStorage.clear();
    inMemoryDocs.clear();
    await auditTrail._resetForTesting();
    vi.clearAllMocks();
  });

  describe('AuditTrailService LocalStorage Offloading & PouchDB Persistence', () => {
    it('TC-QUOTA-01: does not store audit records in localStorage gst_audit_logs', async () => {
      await auditTrail.logEvent({
        userId: 'usr_1',
        userName: 'Admin User',
        userRole: 'OWNER',
        actionType: 'INVOICE_CREATE',
        documentId: 'INV-001',
        documentType: 'INVOICE',
        summary: 'Created test invoice',
        newSnapshot: { id: 'INV-001', grandTotal: 5000, items: new Array(50).fill({ name: 'Bulk Item' }) },
      });

      // Verify localStorage is completely empty of gst_audit_logs
      expect(testStorage.getItem('gst_audit_logs')).toBeNull();

      // Verify record is in memory
      const inMemoryRecords = await auditTrail.getAuditTrail();
      expect(inMemoryRecords).toHaveLength(1);
      expect(inMemoryRecords[0].documentId).toBe('INV-001');

      // Verify record is persisted in PouchDB
      expect(pouch.putDoc).toHaveBeenCalledWith('audit_log', expect.objectContaining({
        documentId: 'INV-001',
        actionType: 'INVOICE_CREATE',
      }));
    });

    it('TC-QUOTA-02: automatically reclaims quota by removing gst_audit_logs if previously present', async () => {
      // Simulate legacy audit logs existing in localStorage from previous app versions
      const legacyLogs = [
        {
          id: 'audit_legacy_1',
          sequence: 1,
          timestamp: '2026-01-01T00:00:00.000Z',
          userId: 'usr_legacy',
          userName: 'Old User',
          userRole: 'OWNER',
          actionType: 'SETTINGS_UPDATE',
          documentId: 'COMP-001',
          documentType: 'SETTINGS',
          summary: 'Legacy company setup',
          previousHash: '0'.repeat(64),
          recordHash: '1111111111111111111111111111111111111111111111111111111111111111',
        },
      ];
      testStorage.setItem('gst_audit_logs', JSON.stringify(legacyLogs));
      expect(testStorage.getItem('gst_audit_logs')).not.toBeNull();

      // Create a fresh service instance to trigger reclaim
      const newService = new AuditTrailService();
      await newService.getAuditTrail();

      // gst_audit_logs must have been removed from localStorage immediately
      expect(testStorage.getItem('gst_audit_logs')).toBeNull();

      // The legacy logs should be loaded into memory and migrated to PouchDB
      const records = await newService.getAuditTrail();
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('audit_legacy_1');
      expect(pouch.putDoc).toHaveBeenCalledWith('audit_log', expect.objectContaining({
        id: 'audit_legacy_1',
      }));
    });

    it('TC-QUOTA-03: hydrates audit records from PouchDB IndexedDB on reload', async () => {
      // Seed PouchDB with records
      inMemoryDocs.set('audit_log:audit_pouch_1', {
        id: 'audit_pouch_1',
        sequence: 1,
        timestamp: '2026-03-01T10:00:00.000Z',
        userId: 'usr_pouch',
        userName: 'Pouch User',
        userRole: 'OWNER',
        actionType: 'INVOICE_CREATE',
        documentId: 'INV-POUCH-01',
        documentType: 'INVOICE',
        summary: 'Pouch stored record',
        previousHash: '0'.repeat(64),
        recordHash: '2222222222222222222222222222222222222222222222222222222222222222',
      });

      await auditTrail.reloadFromStorage();

      const trail = await auditTrail.getAuditTrail();
      expect(trail).toHaveLength(1);
      expect(trail[0].documentId).toBe('INV-POUCH-01');
      // Ensure it never wrote to localStorage
      expect(testStorage.getItem('gst_audit_logs')).toBeNull();
    });

    it('TC-QUOTA-04: getRecordsSync returns current in-memory audit logs snapshot', async () => {
      await auditTrail.logEvent({
        userId: 'usr_owner',
        userName: 'Owner',
        userRole: 'OWNER',
        actionType: 'PAYMENT_RECORD',
        documentId: 'PAY-001',
        documentType: 'PAYMENT',
        summary: 'Payment recorded',
      });

      const syncRecords = auditTrail.getRecordsSync();
      expect(syncRecords).toHaveLength(1);
      expect(syncRecords[0].documentId).toBe('PAY-001');
      expect(testStorage.getItem('gst_audit_logs')).toBeNull();
    });
  });

  describe('StorageService.set QuotaExceededError Graceful Handling', () => {
    let warnSpy: any;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('TC-QUOTA-05: catches DOMException QuotaExceededError and logs warning without throwing', () => {
      const quotaError = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      const originalSetItem = testStorage.setItem.bind(testStorage);

      vi.spyOn(testStorage, 'setItem').mockImplementationOnce(() => {
        throw quotaError;
      });

      // Saving an item invokes StorageService.set()
      expect(() => {
        db.saveItem({
          id: 'ITEM-OVERFLOW-1',
          name: 'Overflow Item',
          salePrice: 100,
          purchasePrice: 80,
          currentStock: 10,
          minStockAlert: 2,
          unit: 'PCS',
          gstRate: 18,
          hsnSacCode: '8471',
          category: 'cat_general',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('QuotaExceededError encountered'),
        quotaError
      );
    });

    it('TC-QUOTA-06: catches error object with code 22 or QuotaExceededError name', () => {
      const errorObj = {
        name: 'QuotaExceededError',
        code: 22,
        message: 'Storage quota reached',
      };

      vi.spyOn(testStorage, 'setItem').mockImplementationOnce(() => {
        throw errorObj;
      });

      expect(() => {
        db.saveParty({
          id: 'PARTY-OVERFLOW-1',
          name: 'Overflow Party',
          type: 'CUSTOMER',
          phone: '9999999999',
          stateCode: '27',
          billingAddress: '123 Main St',
          currentBalance: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('QuotaExceededError encountered'),
        errorObj
      );
    });

    it('TC-QUOTA-07: successfully writes to localStorage under normal non-quota circumstances', () => {
      db.saveParty({
        id: 'PARTY-NORMAL-1',
        name: 'Normal Party',
        type: 'CUSTOMER',
        phone: '9876543210',
        stateCode: '27',
        billingAddress: '456 Market St',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const partiesRaw = testStorage.getItem('gst_parties');
      expect(partiesRaw).not.toBeNull();
      const parties = JSON.parse(partiesRaw!);
      expect(parties.some((p: any) => p.id === 'PARTY-NORMAL-1')).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
