import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PouchService } from '../services/pouchdb.ts';
import {
  isDocDivergent,
  hasOnlyDerivedDivergence,
  getDerivedDivergenceFields,
  DERIVED_OR_VOLATILE_FIELDS,
} from '../core/sync/derivedFields.ts';

describe('persistDoc 409 Race & Derived Fields Conflict Shield', () => {
  let pouchService: PouchService;
  let mockLocalDB: {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    allDocs: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    pouchService = new PouchService();
    // Disarm any scheduled write queue timers from constructor
    if ((pouchService as any).writeQueueTimer) {
      clearTimeout((pouchService as any).writeQueueTimer);
      (pouchService as any).writeQueueTimer = null;
    }
    (pouchService as any).isDrainingWriteQueue = false;

    mockLocalDB = {
      get: vi.fn().mockImplementation(async (id: string) => {
        if (id.startsWith('tombstone:')) {
          throw { status: 404, message: 'missing' };
        }
        throw { status: 404, message: 'missing' };
      }),
      put: vi.fn().mockResolvedValue({ ok: true }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
      allDocs: vi.fn().mockResolvedValue({ rows: [] }),
    };
    (pouchService as any).localDB = mockLocalDB;
    (pouchService as any).explicitConflicts.clear();
  });

  afterEach(() => {
    if ((pouchService as any).writeQueueTimer) {
      clearTimeout((pouchService as any).writeQueueTimer);
      (pouchService as any).writeQueueTimer = null;
    }
  });

  describe('1. Shared derivedFields helper unit invariants', () => {
    it('recognizes standard derived and volatile fields', () => {
      expect(DERIVED_OR_VOLATILE_FIELDS.has('currentBalance')).toBe(true);
      expect(DERIVED_OR_VOLATILE_FIELDS.has('updatedAt')).toBe(true);
      expect(DERIVED_OR_VOLATILE_FIELDS.has('syncedAt')).toBe(true);
      expect(DERIVED_OR_VOLATILE_FIELDS.has('docType')).toBe(true);
      expect(DERIVED_OR_VOLATILE_FIELDS.has('paiseSchema')).toBe(true);
    });

    it('identifies derived-only divergence correctly across integer-paise twins and timestamps', () => {
      const docA = {
        id: 'party-1',
        name: 'Sharma Traders',
        currentBalance: 24000,
        balancePaise: 2400000,
        updatedAt: '2026-11-17T01:00:00.000Z',
        syncedAt: '2026-11-17T01:00:01.000Z',
        docType: 'party',
        paiseSchema: 1,
      };

      const docB = {
        id: 'party-1',
        name: 'Sharma Traders',
        currentBalance: 19000,
        balancePaise: 1900000,
        updatedAt: '2026-11-17T01:00:05.000Z',
        syncedAt: '2026-11-17T01:00:06.000Z',
        docType: 'party',
        paiseSchema: 2,
        _rev: '2-latest-rev',
      };

      expect(isDocDivergent(docA, docB)).toBe(true);
      expect(hasOnlyDerivedDivergence(docA, docB)).toBe(true);

      const diffs = getDerivedDivergenceFields(docA, docB);
      expect(diffs).toContain('currentBalance');
      expect(diffs).toContain('balancePaise');
      expect(diffs).toContain('updatedAt');
      expect(diffs).not.toContain('name');
    });

    it('detects real user-visible divergence when substantial fields differ', () => {
      const docA = {
        id: 'party-1',
        name: 'Sharma Traders Guwahati',
        currentBalance: 24000,
      };

      const docB = {
        id: 'party-1',
        name: 'Sharma Traders Dispur',
        currentBalance: 19000,
      };

      expect(isDocDivergent(docA, docB)).toBe(true);
      expect(hasOnlyDerivedDivergence(docA, docB)).toBe(false);
    });
  });

  describe('2. persistDoc 409 handling specifications', () => {
    it('1. 409 where pending doc differs only in currentBalance -> no conflict added, stored doc keeps latest currentBalance', async () => {
      const docId = 'party:party-1';
      const pendingDoc = {
        id: 'party-1',
        name: 'Guwahati Hardware',
        gstin: '18AABCU9603R1ZM',
        currentBalance: 24000,
      };

      const storedLatestDoc = {
        _id: docId,
        _rev: '2-latest-from-replication',
        id: 'party-1',
        name: 'Guwahati Hardware',
        gstin: '18AABCU9603R1ZM',
        currentBalance: 19000,
      };

      let getCallCount = 0;
      mockLocalDB.get.mockImplementation(async (id: string) => {
        if (id.startsWith('tombstone:')) {
          throw { status: 404, message: 'missing' };
        }
        if (id === docId) {
          getCallCount++;
          if (getCallCount === 1) {
            return { _id: docId, _rev: '1-initial', ...pendingDoc, currentBalance: 20000 };
          }
          return storedLatestDoc;
        }
        throw { status: 404, message: 'missing' };
      });

      mockLocalDB.put.mockRejectedValueOnce({
        status: 409,
        name: 'conflict',
        message: 'Document update conflict',
      });

      await (pouchService as any).persistDoc('party', pendingDoc);

      const conflicts = await pouchService.getConflicts();
      expect(conflicts).toHaveLength(0);

      // Verify that stored latest doc was NOT overwritten
      expect(mockLocalDB.put).toHaveBeenCalledTimes(1);
      expect(storedLatestDoc.currentBalance).toBe(19000);
    });

    it('2. 409 where pending doc differs only in updatedAt/syncedAt/docType/a *Paise twin -> no conflict entry', async () => {
      const docId = 'party:party-2';
      const pendingDoc = {
        id: 'party-2',
        name: 'Brahmaputra Retail',
        currentBalance: 5000,
        balancePaise: 500000,
        openingBalancePaise: 100000,
        updatedAt: '2026-11-17T02:00:00.000Z',
        syncedAt: '2026-11-17T02:00:00.000Z',
        docType: 'party',
        paiseSchema: 1,
      };

      const storedLatestDoc = {
        _id: docId,
        _rev: '3-remote-rev',
        id: 'party-2',
        name: 'Brahmaputra Retail',
        currentBalance: 5000,
        balancePaise: 500000,
        openingBalancePaise: 100000,
        updatedAt: '2026-11-17T02:05:00.000Z',
        syncedAt: '2026-11-17T02:05:01.000Z',
        docType: 'party',
        paiseSchema: 2,
      };

      let getCallCount = 0;
      mockLocalDB.get.mockImplementation(async (id: string) => {
        if (id.startsWith('tombstone:')) {
          throw { status: 404, message: 'missing' };
        }
        if (id === docId) {
          getCallCount++;
          if (getCallCount === 1) {
            return { _id: docId, _rev: '2-prev' };
          }
          return storedLatestDoc;
        }
        throw { status: 404, message: 'missing' };
      });

      mockLocalDB.put.mockRejectedValueOnce({
        status: 409,
        name: 'conflict',
        message: 'Document update conflict',
      });

      await (pouchService as any).persistDoc('party', pendingDoc);

      const conflicts = await pouchService.getConflicts();
      expect(conflicts).toHaveLength(0);
    });

    it('3. 409 where a real field differs (e.g. name) -> exactly one conflict entry is created with local-409 and both revisions are readable', async () => {
      const docId = 'party:party-3';
      const pendingDoc = {
        id: 'party-3',
        name: 'Assam Steels (New Head Office)',
        phone: '9876543210',
        currentBalance: 50000,
      };

      const storedLatestDoc = {
        _id: docId,
        _rev: '4-concurrent-remote',
        id: 'party-3',
        name: 'Assam Steels (Old Branch)',
        phone: '9876543210',
        currentBalance: 50000,
      };

      let getCallCount = 0;
      mockLocalDB.get.mockImplementation(async (id: string) => {
        if (id.startsWith('tombstone:')) {
          throw { status: 404, message: 'missing' };
        }
        if (id === docId) {
          getCallCount++;
          if (getCallCount === 1) {
            return { _id: docId, _rev: '3-prev' };
          }
          return storedLatestDoc;
        }
        throw { status: 404, message: 'missing' };
      });

      mockLocalDB.put.mockRejectedValueOnce({
        status: 409,
        name: 'conflict',
        message: 'Document update conflict',
      });

      await (pouchService as any).persistDoc('party', pendingDoc);

      const conflicts = await pouchService.getConflicts();
      expect(conflicts).toHaveLength(1);

      const conflict = conflicts[0];
      expect(conflict.docId).toBe(docId);
      expect(conflict.conflictingRev).toBe('local-409');
      expect(conflict.winningRev).toBe('4-concurrent-remote');
      expect(conflict.winningDoc.name).toBe('Assam Steels (Old Branch)');
      expect(conflict.conflictingDoc.name).toBe('Assam Steels (New Head Office)');
    });

    it('4. regression assertion: a party with an identical body raises no conflict', async () => {
      const docId = 'party:party-4';
      const pendingDoc = {
        id: 'party-4',
        name: 'Kamakhya Enterprises',
        gstin: '18ABCDE1234F1Z5',
        currentBalance: 12500,
      };

      const storedLatestDoc = {
        _id: docId,
        _rev: '2-fresh-rev-same-body',
        id: 'party-4',
        name: 'Kamakhya Enterprises',
        gstin: '18ABCDE1234F1Z5',
        currentBalance: 12500,
      };

      let getCallCount = 0;
      mockLocalDB.get.mockImplementation(async (id: string) => {
        if (id.startsWith('tombstone:')) {
          throw { status: 404, message: 'missing' };
        }
        if (id === docId) {
          getCallCount++;
          if (getCallCount === 1) {
            return { _id: docId, _rev: '1-old-rev' };
          }
          return storedLatestDoc;
        }
        throw { status: 404, message: 'missing' };
      });

      mockLocalDB.put.mockRejectedValueOnce({
        status: 409,
        name: 'conflict',
        message: 'Document update conflict',
      });

      await (pouchService as any).persistDoc('party', pendingDoc);

      const conflicts = await pouchService.getConflicts();
      expect(conflicts).toHaveLength(0);
    });
  });
});
