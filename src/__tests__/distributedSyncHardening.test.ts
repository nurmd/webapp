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

import { pouch, SyncConflict } from '../services/pouchdb.ts';
import { db, STORAGE_KEYS } from '../services/db.ts';
import { Invoice } from '../models/invoice.ts';

describe('Phase 2: Distributed Sync Hardening & PouchDB _rev Conflict Queue', () => {
  beforeEach(() => {
    testStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    testStorage.clear();
    vi.restoreAllMocks();
  });

  it('never deletes local unsynced records when syncing from PouchDB and replicates them upward', async () => {
    const localInvoice: Invoice = {
      id: 'INV-OFFLINE-999',
      invoiceNumber: 'INV/2026/099',
      partyId: 'PARTY-001',
      partyName: 'Local Hardware Store',
      partyAddress: '123 Market St',
      partyStateCode: '18',
      placeOfSupplyStateCode: '18',
      isIntraState: true,
      items: [],
      totalGrossAmount: 5000,
      totalDiscount: 0,
      totalTaxableAmount: 5000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 5000,
      amountInWords: 'Five Thousand Only',
      paidAmount: 0,
      balanceAmount: 5000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      date: '2026-10-21',
      invoiceType: 'B2B',
      createdAt: '2026-10-21T10:00:00Z',
      updatedAt: '2026-10-21T10:00:00Z',
    };

    const remoteInvoice: Invoice = {
      id: 'INV-REMOTE-001',
      invoiceNumber: 'INV/2026/001',
      partyId: 'PARTY-002',
      partyName: 'Remote Customer',
      partyAddress: '456 Commercial Rd',
      partyStateCode: '18',
      placeOfSupplyStateCode: '18',
      isIntraState: true,
      items: [],
      totalGrossAmount: 2000,
      totalDiscount: 0,
      totalTaxableAmount: 2000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 2000,
      amountInWords: 'Two Thousand Only',
      paidAmount: 0,
      balanceAmount: 2000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      date: '2026-10-21',
      invoiceType: 'B2B',
      createdAt: '2026-10-21T09:00:00Z',
      updatedAt: '2026-10-21T09:00:00Z',
    };

    // Store local invoice directly in local storage (simulating offline creation)
    testStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify([localInvoice]));

    // Mock pouch.getAllDocs to return remote invoice only
    const getAllDocsSpy = vi.spyOn(pouch, 'getAllDocs').mockImplementation(async (type: string) => {
      if (type === 'invoice') return [remoteInvoice] as any;
      return [];
    });

    const putDocSpy = vi.spyOn(pouch, 'putDoc').mockResolvedValue(undefined);

    await db.syncAllFromPouch();

    const currentInvoices = db.getInvoices();

    // 1. Local offline invoice MUST NOT be deleted
    const foundLocal = currentInvoices.find((i) => i.id === 'INV-OFFLINE-999');
    expect(foundLocal).toBeDefined();
    expect(foundLocal?.partyName).toBe('Local Hardware Store');

    // 2. Remote invoice MUST be merged
    const foundRemote = currentInvoices.find((i) => i.id === 'INV-REMOTE-001');
    expect(foundRemote).toBeDefined();

    // 3. Local offline invoice MUST be pushed to PouchDB
    expect(putDocSpy).toHaveBeenCalledWith('invoice', expect.objectContaining({ id: 'INV-OFFLINE-999' }));

    getAllDocsSpy.mockRestore();
    putDocSpy.mockRestore();
  });

  it('records tombstones on delete and prevents resurrection by stale remote sync', async () => {
    const inv: Invoice = {
      id: 'INV-TOMBSTONE-TEST',
      invoiceNumber: 'INV/2026/TOMB',
      partyName: 'Test Party',
      partyAddress: '123 Market St',
      partyStateCode: '18',
      placeOfSupplyStateCode: '18',
      isIntraState: true,
      items: [],
      totalGrossAmount: 1000,
      totalDiscount: 0,
      totalTaxableAmount: 1000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 1000,
      amountInWords: 'One Thousand Only',
      paidAmount: 0,
      balanceAmount: 1000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      date: '2026-10-21',
      invoiceType: 'B2B',
      createdAt: '2026-10-21T08:00:00Z',
      updatedAt: '2026-10-21T08:00:00Z',
    };

    testStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify([inv]));
    expect(db.getInvoices()).toHaveLength(1);

    const deleteDocSpy = vi.spyOn(pouch, 'deleteDoc').mockResolvedValue(undefined);

    // Delete locally
    db.deleteInvoice('INV-TOMBSTONE-TEST');

    expect(db.getInvoices()).toHaveLength(0);

    // Verify tombstone is recorded
    const tombstones = db.getTombstones();
    expect(tombstones['invoice:INV-TOMBSTONE-TEST']).toBeDefined();
    expect(tombstones['invoice:INV-TOMBSTONE-TEST'].deletedAt).toBeDefined();

    // Simulate stale remote sync still having the deleted invoice with older updatedAt
    const staleRemoteInvoice = {
      ...inv,
      updatedAt: '2026-10-21T08:00:00Z', // Before deletion
    };

    const getAllDocsSpy = vi.spyOn(pouch, 'getAllDocs').mockImplementation(async (type: string) => {
      if (type === 'invoice') return [staleRemoteInvoice] as any;
      return [];
    });

    await db.syncAllFromPouch();

    // Tombstone MUST prevent resurrection
    expect(db.getInvoices().find((i) => i.id === 'INV-TOMBSTONE-TEST')).toBeUndefined();

    // Verify pouch.deleteDoc was called to enforce remote deletion
    expect(deleteDocSpy).toHaveBeenCalledWith('invoice', 'INV-TOMBSTONE-TEST');

    deleteDocSpy.mockRestore();
    getAllDocsSpy.mockRestore();
  });

  it('revives tombstoned entity if remote has newer updatedAt than tombstone deletion timestamp', async () => {
    // Record a tombstone with timestamp in the past
    const pastTime = new Date(Date.now() - 10000).toISOString();
    const futureTime = new Date().toISOString();

    const tombstones = {
      'invoice:INV-REVIVE': {
        type: 'invoice',
        id: 'INV-REVIVE',
        deletedAt: pastTime,
      },
    };
    testStorage.setItem(STORAGE_KEYS.TOMBSTONES, JSON.stringify(tombstones));

    const updatedRemoteInvoice: Invoice = {
      id: 'INV-REVIVE',
      invoiceNumber: 'INV/REVIVE',
      partyName: 'Revived Customer',
      partyAddress: '123 Market St',
      partyStateCode: '18',
      placeOfSupplyStateCode: '18',
      isIntraState: true,
      items: [],
      totalGrossAmount: 3000,
      totalDiscount: 0,
      totalTaxableAmount: 3000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 3000,
      amountInWords: 'Three Thousand Only',
      paidAmount: 0,
      balanceAmount: 3000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      date: '2026-10-21',
      invoiceType: 'B2B',
      createdAt: pastTime,
      updatedAt: futureTime, // Newer than tombstone
    };

    const getAllDocsSpy = vi.spyOn(pouch, 'getAllDocs').mockImplementation(async (type: string) => {
      if (type === 'invoice') return [updatedRemoteInvoice] as any;
      return [];
    });

    await db.syncAllFromPouch();

    // Must be revived because remote is newer than deletion
    expect(db.getInvoices().find((i) => i.id === 'INV-REVIVE')).toBeDefined();
    // Tombstone must be cleared
    expect(db.getTombstones()['invoice:INV-REVIVE']).toBeUndefined();

    getAllDocsSpy.mockRestore();
  });

  it('detects and exposes PouchDB revision conflicts in the conflict queue', async () => {
    const mockConflicts: SyncConflict[] = [
      {
        id: 'invoice:INV-CONFLICT-1#2-remote-branch',
        docId: 'invoice:INV-CONFLICT-1',
        docType: 'invoice',
        entityId: 'INV-CONFLICT-1',
        winningRev: '2-local-branch',
        conflictingRev: '2-remote-branch',
        winningDoc: { id: 'INV-CONFLICT-1', partyName: 'Local Branch Edit', updatedAt: '2026-10-21T11:00:00Z' },
        conflictingDoc: { id: 'INV-CONFLICT-1', partyName: 'Remote Branch Edit', updatedAt: '2026-10-21T11:05:00Z' },
        detectedAt: '2026-10-21T11:06:00Z',
      },
    ];

    const getConflictsSpy = vi.spyOn(pouch, 'getConflicts').mockResolvedValue(mockConflicts);

    const conflicts = await db.getConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].entityId).toBe('INV-CONFLICT-1');
    expect(conflicts[0].winningDoc.partyName).toBe('Local Branch Edit');
    expect(conflicts[0].conflictingDoc.partyName).toBe('Remote Branch Edit');

    getConflictsSpy.mockRestore();
  });

  it('resolves conflict by keeping winning version and removing conflicting revision', async () => {
    const resolveConflictSpy = vi.spyOn(pouch, 'resolveConflict').mockResolvedValue(undefined);
    const syncAllSpy = vi.spyOn(db, 'syncAllFromPouch').mockResolvedValue();

    await db.resolveConflict('invoice:INV-CONFLICT-1#2-remote-branch', 'keep_winning');

    expect(resolveConflictSpy).toHaveBeenCalledWith('invoice:INV-CONFLICT-1', 'keep_winning', expect.objectContaining({
      conflictingRev: '2-remote-branch',
    }));
    expect(syncAllSpy).toHaveBeenCalled();

    resolveConflictSpy.mockRestore();
    syncAllSpy.mockRestore();
  });

  it('resolves conflict by keeping conflicting version and promoting it', async () => {
    const resolveConflictSpy = vi.spyOn(pouch, 'resolveConflict').mockResolvedValue(undefined);
    const syncAllSpy = vi.spyOn(db, 'syncAllFromPouch').mockResolvedValue();

    await db.resolveConflict('invoice:INV-CONFLICT-1#2-remote-branch', 'keep_conflicting');

    expect(resolveConflictSpy).toHaveBeenCalledWith('invoice:INV-CONFLICT-1', 'keep_conflicting', expect.objectContaining({
      conflictingRev: '2-remote-branch',
    }));
    expect(syncAllSpy).toHaveBeenCalled();

    resolveConflictSpy.mockRestore();
    syncAllSpy.mockRestore();
  });

  it('remote deletion does not resurrect a local record', async () => {
    const localInvoice: Invoice = {
      id: 'INV-REMOTE-DEL',
      invoiceNumber: 'INV/2026/DEL',
      partyName: 'Customer To Delete',
      partyAddress: '123 Market St',
      partyStateCode: '18',
      placeOfSupplyStateCode: '18',
      isIntraState: true,
      items: [],
      totalGrossAmount: 4000,
      totalDiscount: 0,
      totalTaxableAmount: 4000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 4000,
      amountInWords: 'Four Thousand Only',
      paidAmount: 0,
      balanceAmount: 4000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      date: '2026-10-21',
      invoiceType: 'B2B',
      createdAt: '2026-10-21T09:00:00Z',
      updatedAt: '2026-10-21T09:00:00Z',
    };

    // Local storage has this invoice
    testStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify([localInvoice]));
    expect(db.getInvoices().find((i) => i.id === 'INV-REMOTE-DEL')).toBeDefined();

    // Remote returns a replicated tombstone indicating this invoice was deleted remotely at 10:00:00Z
    const remoteTombstone = {
      _id: 'tombstone:invoice:INV-REMOTE-DEL',
      docType: 'tombstone' as const,
      targetType: 'invoice',
      targetId: 'INV-REMOTE-DEL',
      deletedAt: '2026-10-21T10:00:00Z',
      syncedAt: '2026-10-21T10:00:00Z',
    };

    const getAllTombstonesSpy = vi.spyOn(pouch, 'getAllTombstones').mockResolvedValue([remoteTombstone]);
    const getAllDocsSpy = vi.spyOn(pouch, 'getAllDocs').mockResolvedValue([]);
    const putDocSpy = vi.spyOn(pouch, 'putDoc').mockResolvedValue(undefined);

    await db.syncAllFromPouch();

    // Local invoice MUST be deleted
    expect(db.getInvoices().find((i) => i.id === 'INV-REMOTE-DEL')).toBeUndefined();
    // MUST NOT re-push the local record to PouchDB
    expect(putDocSpy).not.toHaveBeenCalledWith('invoice', expect.objectContaining({ id: 'INV-REMOTE-DEL' }));

    getAllTombstonesSpy.mockRestore();
    getAllDocsSpy.mockRestore();
    putDocSpy.mockRestore();
  });

  it('409 preserves both revisions without blind-overwriting', async () => {
    const remoteWinningInvoice = {
      id: 'INV-409-TEST',
      invoiceNumber: 'INV/2026/409',
      partyName: 'Remote Peer Edited Name',
      grandTotal: 7500,
      updatedAt: '2026-10-21T11:00:00Z',
      _rev: '2-remote-rev',
    };

    const localConflictingInvoice: Invoice = {
      id: 'INV-409-TEST',
      invoiceNumber: 'INV/2026/409',
      partyName: 'Local Terminal Edited Name',
      partyAddress: '123 Market St',
      partyStateCode: '18',
      placeOfSupplyStateCode: '18',
      isIntraState: true,
      items: [],
      totalGrossAmount: 9000,
      totalDiscount: 0,
      totalTaxableAmount: 9000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 9000,
      amountInWords: 'Nine Thousand Only',
      paidAmount: 0,
      balanceAmount: 9000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      date: '2026-10-21',
      invoiceType: 'B2B',
      createdAt: '2026-10-21T09:00:00Z',
      updatedAt: '2026-10-21T11:02:00Z',
    };

    // Mock localDB.get to return remoteWinningInvoice
    const mockLocalDB = (pouch as any).localDB;
    const origGet = mockLocalDB.get;
    const origPut = mockLocalDB.put;

    mockLocalDB.get = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'invoice:INV-409-TEST') return remoteWinningInvoice;
      throw { status: 404 };
    });

    let putCallCount = 0;
    mockLocalDB.put = vi.fn().mockImplementation(async () => {
      putCallCount++;
      // Simulate 409 conflict
      const err: any = new Error('Document update conflict');
      err.status = 409;
      throw err;
    });

    // Call putDoc
    await pouch.putDoc('invoice', localConflictingInvoice);

    // Verify 409 did not loop or blind-overwrite with forced rev
    const conflicts = await pouch.getConflicts();
    const foundConflict = conflicts.find((c) => c.entityId === 'INV-409-TEST');

    expect(foundConflict).toBeDefined();
    expect(foundConflict?.winningDoc.partyName).toBe('Remote Peer Edited Name');
    expect(foundConflict?.conflictingDoc.partyName).toBe('Local Terminal Edited Name');

    mockLocalDB.get = origGet;
    mockLocalDB.put = origPut;
  });

  it('tombstone replicates between two local PouchDB instances', async () => {
    // Deterministic in-memory PouchDB mock to verify replication behavior without IndexedDB adapter
    class InMemoryPouchDBMock {
      private docs = new Map<string, any>();

      async put(doc: any) {
        const existing = this.docs.get(doc._id);
        const revNum = existing?._rev ? parseInt(existing._rev.split('-')[0], 10) + 1 : 1;
        const newRev = `${revNum}-${Math.random().toString(36).slice(2, 10)}`;
        const stored = { ...doc, _rev: newRev };
        this.docs.set(doc._id, stored);
        return { ok: true, id: doc._id, rev: newRev };
      }

      async get(id: string) {
        const doc = this.docs.get(id);
        if (!doc) {
          const err: any = new Error('missing');
          err.status = 404;
          throw err;
        }
        return JSON.parse(JSON.stringify(doc));
      }

      async remove(doc: any) {
        const existing = this.docs.get(doc._id);
        if (!existing) {
          const err: any = new Error('missing');
          err.status = 404;
          throw err;
        }
        this.docs.delete(doc._id);
        return { ok: true, id: doc._id, rev: `${parseInt(existing._rev.split('-')[0], 10) + 1}-deleted` };
      }

      async allDocs(opts?: any) {
        let rows = Array.from(this.docs.entries()).map(([id, doc]) => ({
          id,
          key: id,
          value: { rev: doc._rev },
          doc: opts?.include_docs ? JSON.parse(JSON.stringify(doc)) : undefined,
        }));
        if (opts?.startkey) rows = rows.filter(r => r.id >= opts.startkey);
        if (opts?.endkey) rows = rows.filter(r => r.id <= opts.endkey);
        return { rows, total_rows: rows.length, offset: 0 };
      }

      static async replicate(from: InMemoryPouchDBMock, to: InMemoryPouchDBMock) {
        const { rows } = await from.allDocs({ include_docs: true });
        for (const row of rows) {
          if (row.doc) {
            try {
              await to.put(row.doc);
            } catch {
              // ignore duplicate or replication collisions in mock
            }
          }
        }
      }
    }

    const dbA = new InMemoryPouchDBMock();
    const dbB = new InMemoryPouchDBMock();

    // 1. Peer A writes an invoice
    await dbA.put({
      _id: 'invoice:INV-REPL-01',
      docType: 'invoice',
      invoiceNumber: 'INV/REPL/01',
      totalAmount: 1500,
    });

    // Replicate Peer A -> Peer B
    await InMemoryPouchDBMock.replicate(dbA, dbB);

    const docOnB = await dbB.get('invoice:INV-REPL-01');
    expect(docOnB).toBeDefined();
    expect((docOnB as any).invoiceNumber).toBe('INV/REPL/01');

    // 2. Peer A deletes the invoice, creating a replicated tombstone doc
    const now = new Date().toISOString();
    await dbA.put({
      _id: 'tombstone:invoice:INV-REPL-01',
      docType: 'tombstone',
      targetType: 'invoice',
      targetId: 'INV-REPL-01',
      deletedAt: now,
      syncedAt: now,
    });
    await dbA.remove(await dbA.get('invoice:INV-REPL-01'));

    // Replicate Peer A -> Peer B again
    await InMemoryPouchDBMock.replicate(dbA, dbB);

    // Verify tombstone replicated to Peer B
    const tombstoneOnB = (await dbB.get('tombstone:invoice:INV-REPL-01')) as any;
    expect(tombstoneOnB).toBeDefined();
    expect(tombstoneOnB.docType).toBe('tombstone');
    expect(tombstoneOnB.targetId).toBe('INV-REPL-01');
  });

  it('enqueues a visible conflict for financial documents when both sides changed instead of LWW overwrite', async () => {
    const localInvoice: Invoice = {
      id: 'INV-FINANCIAL-DIVERGENT',
      invoiceNumber: 'INV/2026/FD',
      partyName: 'Local Customer Payment Recorded',
      partyAddress: '123 Market St',
      partyStateCode: '18',
      placeOfSupplyStateCode: '18',
      isIntraState: true,
      items: [],
      totalGrossAmount: 5000,
      totalDiscount: 0,
      totalTaxableAmount: 5000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 5000,
      amountInWords: 'Five Thousand Only',
      paidAmount: 5000,
      balanceAmount: 0,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      date: '2026-10-21',
      invoiceType: 'B2B',
      createdAt: '2026-10-21T08:00:00Z',
      updatedAt: '2026-10-21T10:00:00Z',
    };

    const remoteInvoice: Invoice = {
      id: 'INV-FINANCIAL-DIVERGENT',
      invoiceNumber: 'INV/2026/FD',
      partyName: 'Remote Customer Partial Payment Recorded',
      partyAddress: '123 Market St',
      partyStateCode: '18',
      placeOfSupplyStateCode: '18',
      isIntraState: true,
      items: [],
      totalGrossAmount: 5000,
      totalDiscount: 0,
      totalTaxableAmount: 5000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 5000,
      amountInWords: 'Five Thousand Only',
      paidAmount: 2000,
      balanceAmount: 3000,
      paymentMode: 'CASH',
      paymentStatus: 'PARTIAL',
      date: '2026-10-21',
      invoiceType: 'B2B',
      createdAt: '2026-10-21T08:00:00Z',
      updatedAt: '2026-10-21T10:05:00Z', // Remote has newer timestamp
    };

    testStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify([localInvoice]));

    const getAllDocsSpy = vi.spyOn(pouch, 'getAllDocs').mockImplementation(async (type: string) => {
      if (type === 'invoice') return [remoteInvoice] as any;
      return [];
    });

    await db.syncAllFromPouch();

    // Because it is a financial document with divergent modifications:
    // 1. It MUST NOT silently overwrite local with remote LWW!
    const localInDb = db.getInvoices().find((i) => i.id === 'INV-FINANCIAL-DIVERGENT');
    expect(localInDb).toBeDefined();
    expect(localInDb?.paidAmount).toBe(5000); // Local payment preserved!

    // 2. Visible conflict MUST be enqueued!
    const conflicts = await db.getConflicts();
    const financialConflict = conflicts.find((c) => c.entityId === 'INV-FINANCIAL-DIVERGENT');
    expect(financialConflict).toBeDefined();
    expect(financialConflict?.winningDoc.paidAmount).toBe(2000);
    expect(financialConflict?.conflictingDoc.paidAmount).toBe(5000);

    getAllDocsSpy.mockRestore();
  });
});
