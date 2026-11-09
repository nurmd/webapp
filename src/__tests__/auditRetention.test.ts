import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import {
  getAuditRetentionPolicy,
  setAuditRetentionPolicy,
  resetAuditRetentionPolicyForTests,
  selectRetainedWindow,
  computeRetentionStats,
  DEFAULT_MAX_IN_MEMORY_RECORDS,
  LEGACY_AUDIT_EPOCH,
  CURRENT_AUDIT_EPOCH,
} from '../services/auditRetention.ts';
import {
  auditTrail,
  AuditRecord,
  GENESIS_PREVIOUS_HASH,
  computeRecordHash,
} from '../services/auditTrail.ts';
import { pouch } from '../services/pouchdb.ts';

describe('Phase 1.4 Audit Retention Engine Suite', () => {
  beforeEach(async () => {
    testStorage.clear();
    inMemoryDocs.clear();
    resetAuditRetentionPolicyForTests();
    await auditTrail._resetForTesting();
    vi.clearAllMocks();
  });

  describe('Audit retention policy configuration', () => {
    it('returns default policy when unset in localStorage', () => {
      const policy = getAuditRetentionPolicy();
      expect(policy.maxInMemoryRecords).toBe(DEFAULT_MAX_IN_MEMORY_RECORDS);
      expect(policy.maxInMemoryRecords).toBe(5000);
    });

    it('clamps policy below 100 and above 50000', () => {
      const low = setAuditRetentionPolicy({ maxInMemoryRecords: 20 });
      expect(low.maxInMemoryRecords).toBe(100);

      const high = setAuditRetentionPolicy({ maxInMemoryRecords: 999999 });
      expect(high.maxInMemoryRecords).toBe(50000);
    });

    it('persists policy override and reads it back', () => {
      setAuditRetentionPolicy({ maxInMemoryRecords: 1500 });
      const policy = getAuditRetentionPolicy();
      expect(policy.maxInMemoryRecords).toBe(1500);
    });

    it('resetAuditRetentionPolicyForTests removes policy key from localStorage', () => {
      setAuditRetentionPolicy({ maxInMemoryRecords: 2500 });
      resetAuditRetentionPolicyForTests();
      const policy = getAuditRetentionPolicy();
      expect(policy.maxInMemoryRecords).toBe(DEFAULT_MAX_IN_MEMORY_RECORDS);
    });
  });

  describe('selectRetainedWindow()', () => {
    it('keeps newest N records and preserves evicted order', () => {
      const records = [
        { sequence: 1, name: 'one' },
        { sequence: 2, name: 'two' },
        { sequence: 3, name: 'three' },
        { sequence: 4, name: 'four' },
        { sequence: 5, name: 'five' },
      ];

      const { retained, evicted } = selectRetainedWindow(records, 3);
      expect(retained).toHaveLength(3);
      expect(retained.map((r) => r.sequence)).toEqual([3, 4, 5]);

      expect(evicted).toHaveLength(2);
      expect(evicted.map((r) => r.sequence)).toEqual([1, 2]);
    });

    it('returns empty evicted array when records length is less than or equal to cap', () => {
      const records = [
        { sequence: 1 },
        { sequence: 2 },
      ];

      const { retained, evicted } = selectRetainedWindow(records, 5);
      expect(retained).toHaveLength(2);
      expect(evicted).toEqual([]);
    });

    it('computeRetentionStats calculates correct totals and boundaries', () => {
      const records = [
        { sequence: 1, epoch: 1 },
        { sequence: 2, epoch: 1 },
        { sequence: 3, epoch: 2 },
        { sequence: 4, epoch: 2 },
        { sequence: 5, epoch: 2 },
      ];
      const stats = computeRetentionStats(records);
      expect(stats.total).toBe(5);
      expect(stats.legacyEpoch).toBe(2);
      expect(stats.currentEpoch).toBe(3);
      expect(stats.oldestSequence).toBe(1);
      expect(stats.newestSequence).toBe(5);
    });
  });

  describe('End-to-End Retention Window Capping & Paging in AuditTrailService', () => {
    // Helper to generate 5 valid chained records
    async function seedFiveChainedRecords(): Promise<AuditRecord[]> {
      const records: AuditRecord[] = [];
      let prevHash = GENESIS_PREVIOUS_HASH;

      for (let i = 1; i <= 5; i++) {
        const timestamp = `2026-11-0${i}T10:00:00.000Z`;
        const recordData = {
          actionType: 'INVOICE_CREATE',
          documentId: `INV-${i}`,
          documentType: 'INVOICE',
          newSnapshot: { grandTotal: i * 100 },
          previousHash: prevHash,
          sequence: i,
          summary: `Invoice #${i} created`,
          timestamp,
          userId: 'usr_admin',
          userName: 'Admin User',
          userRole: 'OWNER',
        };
        const recordHash = await computeRecordHash(recordData);
        const record: AuditRecord = {
          id: `audit_rec_${i}`,
          sequence: i,
          epoch: CURRENT_AUDIT_EPOCH,
          timestamp,
          userId: 'usr_admin',
          userName: 'Admin User',
          userRole: 'OWNER',
          actionType: 'INVOICE_CREATE',
          documentId: `INV-${i}`,
          documentType: 'INVOICE',
          summary: `Invoice #${i} created`,
          newSnapshot: { grandTotal: i * 100 },
          previousHash: prevHash,
          recordHash,
        };
        records.push(record);
        prevHash = recordHash;
        await pouch.putDoc('audit_log', record);
      }
      return records;
    }

    it('retention cap end-to-end: seeds 5 chained records, caps in-memory to 3, retains 3, truncates 2 with anchor', async () => {
      const seeded = await seedFiveChainedRecords();
      setAuditRetentionPolicy({ maxInMemoryRecords: 3 }, true);

      await auditTrail.reloadFromStorage();

      const retention = auditTrail.getRetentionInfo();
      expect(retention.retainedCount).toBe(3);
      expect(retention.truncatedCount).toBe(2);
      expect(retention.totalCount).toBe(5);
      expect(retention.maxInMemoryRecords).toBe(3);
      expect(retention.anchorSequence).toBe(2);
      expect(retention.anchorHash).toBe(seeded[1].recordHash);

      const inMemoryRecords = auditTrail.getRecordsSync();
      expect(inMemoryRecords).toHaveLength(3);
      expect(inMemoryRecords.map((r) => r.sequence)).toEqual([3, 4, 5]);
    });

    it('append after truncation: new record receives sequence 6 and links previousHash to record #5', async () => {
      const seeded = await seedFiveChainedRecords();
      setAuditRetentionPolicy({ maxInMemoryRecords: 3 }, true);
      await auditTrail.reloadFromStorage();

      const newRec = await auditTrail.logEvent({
        actionType: 'INVOICE_CREATE',
        documentId: 'INV-6',
        documentType: 'INVOICE',
        userId: 'usr_admin',
        userName: 'Admin User',
        userRole: 'OWNER',
        summary: 'Invoice #6 created',
      });

      expect(newRec.sequence).toBe(6);
      expect(newRec.previousHash).toBe(seeded[4].recordHash);

      const info = auditTrail.getRetentionInfo();
      expect(info.retainedCount).toBe(3);
      expect(info.truncatedCount).toBe(3); // 1, 2, 3 now evicted
      expect(info.totalCount).toBe(6);
    });

    it('truncated reads: getAuditTrail and getAuditTrailCount transparently query all 5 records; verifyCurrentEpoch stays valid', async () => {
      await seedFiveChainedRecords();
      setAuditRetentionPolicy({ maxInMemoryRecords: 3 });
      await auditTrail.reloadFromStorage();

      // Transparent count & list
      const count = await auditTrail.getAuditTrailCount();
      expect(count).toBe(5);

      const trail = await auditTrail.getAuditTrail();
      expect(trail).toHaveLength(5);

      // Cryptographic chain verification works on full records without false sequence breaks
      const verification = await auditTrail.verifyCurrentEpoch();
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBe(5);
    });

    it('sequence bounds: afterSequence and beforeSequence filter exclusively', async () => {
      await seedFiveChainedRecords();
      await auditTrail.reloadFromStorage();

      // afterSequence (exclusive: sequence > 2)
      const after = await auditTrail.getAuditTrail({ afterSequence: 2 });
      expect(after.map((r) => r.sequence)).toEqual([3, 4, 5]);

      // beforeSequence (exclusive: sequence < 4)
      const before = await auditTrail.getAuditTrail({ beforeSequence: 4 });
      expect(before.map((r) => r.sequence)).toEqual([1, 2, 3]);

      // both bounds (2 < sequence < 5)
      const bounded = await auditTrail.getAuditTrail({ afterSequence: 2, beforeSequence: 5 });
      expect(bounded.map((r) => r.sequence)).toEqual([3, 4]);
    });

    it('archiveLegacyEpoch returns a manifest plus legacy records and performs no deletions', async () => {
      // Seed 2 legacy epoch records and 1 current epoch record
      const legacy1: AuditRecord = {
        id: 'legacy_1',
        sequence: 1,
        epoch: LEGACY_AUDIT_EPOCH,
        timestamp: '2025-01-01T00:00:00.000Z',
        userId: 'u1',
        userName: 'User 1',
        userRole: 'OWNER',
        actionType: 'INVOICE_CREATE',
        documentId: 'INV-LEGACY-1',
        documentType: 'INVOICE',
        summary: 'Legacy invoice',
        previousHash: GENESIS_PREVIOUS_HASH,
        recordHash: 'hash_legacy_1',
      };
      const legacy2: AuditRecord = {
        id: 'legacy_2',
        sequence: 2,
        epoch: LEGACY_AUDIT_EPOCH,
        timestamp: '2025-01-02T00:00:00.000Z',
        userId: 'u1',
        userName: 'User 1',
        userRole: 'OWNER',
        actionType: 'INVOICE_CREATE',
        documentId: 'INV-LEGACY-2',
        documentType: 'INVOICE',
        summary: 'Legacy invoice 2',
        previousHash: 'hash_legacy_1',
        recordHash: 'hash_legacy_2',
      };
      const current1: AuditRecord = {
        id: 'current_1',
        sequence: 1,
        epoch: CURRENT_AUDIT_EPOCH,
        timestamp: '2026-01-01T00:00:00.000Z',
        userId: 'u1',
        userName: 'User 1',
        userRole: 'OWNER',
        actionType: 'INVOICE_CREATE',
        documentId: 'INV-CURR-1',
        documentType: 'INVOICE',
        summary: 'Current invoice',
        previousHash: GENESIS_PREVIOUS_HASH,
        recordHash: 'hash_curr_1',
      };

      await pouch.putDoc('audit_log', legacy1);
      await pouch.putDoc('audit_log', legacy2);
      await pouch.putDoc('audit_log', current1);
      await auditTrail.reloadFromStorage();

      const deleteSpy = vi.spyOn(pouch, 'deleteDoc');

      const archive = await auditTrail.archiveLegacyEpoch();
      expect(archive.recordCount).toBe(2);
      expect(archive.manifest.firstSequence).toBe(1);
      expect(archive.manifest.lastSequence).toBe(2);
      expect(archive.manifest.lastRecordHash).toBe('hash_legacy_2');

      const parsed = JSON.parse(archive.json);
      expect(parsed.records).toHaveLength(2);
      expect(parsed.manifest.recordCount).toBe(2);

      // Strictly export-only: zero deletions
      expect(deleteSpy).not.toHaveBeenCalled();

      // When no legacy records exist:
      inMemoryDocs.clear();
      await auditTrail.reloadFromStorage();
      const emptyArchive = await auditTrail.archiveLegacyEpoch();
      expect(emptyArchive.recordCount).toBe(0);
      expect(emptyArchive.manifest.firstSequence).toBeNull();
      expect(emptyArchive.manifest.lastSequence).toBeNull();
      expect(emptyArchive.manifest.lastRecordHash).toBeNull();
    });

    it('_setRecordsForTesting clears truncation state and chainAnchor', async () => {
      await seedFiveChainedRecords();
      setAuditRetentionPolicy({ maxInMemoryRecords: 2 }, true);
      await auditTrail.reloadFromStorage();

      expect(auditTrail.getRetentionInfo().truncatedCount).toBe(3);

      auditTrail._setRecordsForTesting([{
        id: 'mock_1',
        sequence: 1,
        epoch: 2,
        timestamp: new Date().toISOString(),
        userId: 'u1',
        userName: 'User',
        userRole: 'OWNER',
        actionType: 'INVOICE_CREATE',
        documentId: 'INV-1',
        documentType: 'INVOICE',
        summary: 'Test',
        previousHash: GENESIS_PREVIOUS_HASH,
        recordHash: 'h1',
      }]);

      const info = auditTrail.getRetentionInfo();
      expect(info.truncatedCount).toBe(0);
      expect(info.anchorSequence).toBeNull();
      expect(info.anchorHash).toBeNull();
    });
  });
});
