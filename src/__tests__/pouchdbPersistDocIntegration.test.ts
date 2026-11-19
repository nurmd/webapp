import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import PouchDB from 'pouchdb-browser';
import { PouchService, SyncConflict } from '../services/pouchdb.ts';
import {
  isDocDivergent,
  hasOnlyDerivedDivergence,
  getDerivedDivergenceFields,
} from '../core/sync/derivedFields.ts';

async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 20000,
  intervalMs = 50,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await predicate()) return;
    } catch {
      // Continue polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitFor condition timed out after ${timeoutMs}ms`);
}

describe('persistDoc integration with real PouchDB and live replication (fake-indexeddb)', () => {
  let localDbName: string;
  let remoteDbName: string;
  let localDB: PouchDB.Database;
  let remoteDB: PouchDB.Database;
  let syncHandler: PouchDB.Replication.Sync<Record<string, unknown>> | null = null;
  let pouchService: PouchService;

  beforeEach(() => {
    localDbName = 'int_pdoc_loc_' + Math.random().toString(36).slice(2);
    remoteDbName = 'int_pdoc_rem_' + Math.random().toString(36).slice(2);

    localDB = new PouchDB(localDbName);
    remoteDB = new PouchDB(remoteDbName);
    syncHandler = PouchDB.sync(localDB, remoteDB, { live: true, retry: true });

    pouchService = new PouchService();
    // Disarm any scheduled background timers from default constructor
    if ((pouchService as unknown as { writeQueueTimer: ReturnType<typeof setTimeout> | null }).writeQueueTimer) {
      clearTimeout(
        (pouchService as unknown as { writeQueueTimer: ReturnType<typeof setTimeout> | null }).writeQueueTimer!,
      );
      (pouchService as unknown as { writeQueueTimer: ReturnType<typeof setTimeout> | null }).writeQueueTimer = null;
    }
    (pouchService as unknown as { isDrainingWriteQueue: boolean }).isDrainingWriteQueue = false;
    (pouchService as unknown as { localDB: PouchDB.Database }).localDB = localDB;
    (pouchService as unknown as { explicitConflicts: Map<string, SyncConflict> }).explicitConflicts.clear();
  });

  afterEach(async () => {
    if ((pouchService as unknown as { writeQueueTimer: ReturnType<typeof setTimeout> | null }).writeQueueTimer) {
      clearTimeout(
        (pouchService as unknown as { writeQueueTimer: ReturnType<typeof setTimeout> | null }).writeQueueTimer!,
      );
      (pouchService as unknown as { writeQueueTimer: ReturnType<typeof setTimeout> | null }).writeQueueTimer = null;
    }
    if (syncHandler) {
      syncHandler.cancel();
      syncHandler = null;
    }
    try {
      await localDB.destroy();
    } catch {
      // Ignore cleanup error
    }
    try {
      await remoteDB.destroy();
    } catch {
      // Ignore cleanup error
    }
  });

  it('clean write: persistDoc succeeds and the doc lands on both local and remote with matching _rev', async () => {
    const partyDoc = {
      id: 'party-clean-1',
      name: 'Assam Tea Traders',
      phone: '9854012345',
      type: 'CUSTOMER',
      billingAddress: 'G.S. Road, Guwahati',
    };

    // Exercise real persistDoc directly
    await (pouchService as unknown as { persistDoc: (type: string, doc: unknown) => Promise<void> }).persistDoc(
      'party',
      partyDoc,
    );

    const docId = 'party:party-clean-1';

    // Verify local DB has the written document
    const storedLocal = await localDB.get<{ _id: string; _rev: string; name: string }>(docId);
    expect(storedLocal.name).toBe('Assam Tea Traders');
    expect(storedLocal._rev).toBeDefined();

    // Verify replication propagated the document to remote DB with matching _rev
    await waitFor(async () => {
      try {
        const found = await remoteDB.get<{ _id: string; _rev: string; name: string }>(docId);
        return found != null && found.name === 'Assam Tea Traders';
      } catch {
        return false;
      }
    });

    const storedRemote = await remoteDB.get<{ _id: string; _rev: string; name: string }>(docId);
    expect(storedRemote.name).toBe('Assam Tea Traders');
    expect(storedRemote._rev).toBe(storedLocal._rev);

    // No explicit conflicts generated
    const conflicts = await pouchService.getConflicts();
    expect(conflicts).toHaveLength(0);
  }, 25000);

  it('concurrent remote edit: while a local persistDoc is in flight, the remote receives an update; persistDoc reconciles local intent without fabricated local-409 conflict', async () => {
    const partyDoc = {
      id: 'party-race-1',
      name: 'Brahmaputra Logistics',
      phone: '9864011223',
      type: 'SUPPLIER',
      billingAddress: 'Paltan Bazar, Guwahati',
    };

    const docId = 'party:party-race-1';

    // 1. Initial write lands on both local and remote
    await (pouchService as unknown as { persistDoc: (type: string, doc: unknown) => Promise<void> }).persistDoc(
      'party',
      partyDoc,
    );

    await waitFor(async () => {
      try {
        const found = await remoteDB.get<{ _id: string; _rev: string }>(docId);
        return found != null;
      } catch {
        return false;
      }
    });

    const initialRemote = await remoteDB.get<{ _id: string; _rev: string }>(docId);

    // 2. Remote receives a concurrent update for the same record (advancing its _rev)
    await remoteDB.put({
      ...partyDoc,
      _id: docId,
      _rev: initialRemote._rev,
      docType: 'party',
      syncedAt: new Date().toISOString(),
    });

    // Wait for the remote update to arrive at localDB
    await waitFor(async () => {
      try {
        const loc = await localDB.get<{ _id: string; _rev: string }>(docId);
        return loc._rev.startsWith('2-');
      } catch {
        return false;
      }
    });

    // 3. Local persistDoc writes the party doc (matching user intent)
    await (pouchService as unknown as { persistDoc: (type: string, doc: unknown) => Promise<void> }).persistDoc(
      'party',
      partyDoc,
    );

    // 4. Verification:
    // Stored doc reflects the local intent
    const finalStored = await localDB.get<{ _id: string; _rev: string; name: string; phone: string }>(docId);
    expect(finalStored.name).toBe('Brahmaputra Logistics');
    expect(finalStored.phone).toBe('9864011223');

    // explicitConflicts is NEVER populated with conflictingRev: 'local-409'
    const conflicts = await pouchService.getConflicts();
    expect(conflicts).toHaveLength(0);

    const explicitMap = (pouchService as unknown as { explicitConflicts: Map<string, SyncConflict> })
      .explicitConflicts;
    expect(explicitMap.size).toBe(0);
    for (const c of explicitMap.values()) {
      expect(c.conflictingRev).not.toBe('local-409');
    }
  }, 25000);

  it('derived-only divergence: a remote doc that differs only in derived/volatile fields is reconciled without a conflict entry', async () => {
    const baseParty = {
      id: 'party-derived-1',
      name: 'Kamakhya Trading Syndicate',
      phone: '9435012345',
      type: 'CUSTOMER',
      currentBalance: 25000,
      balancePaise: 2500000,
      updatedAt: '2026-11-17T08:00:00.000Z',
      syncedAt: '2026-11-17T08:00:01.000Z',
      paiseSchema: 1,
    };

    const docId = 'party:party-derived-1';

    // 1. Initial write
    await (pouchService as unknown as { persistDoc: (type: string, doc: unknown) => Promise<void> }).persistDoc(
      'party',
      baseParty,
    );

    await waitFor(async () => {
      try {
        const d = await remoteDB.get<{ _id: string; _rev: string }>(docId);
        return d != null;
      } catch {
        return false;
      }
    });

    const remoteRev1 = await remoteDB.get<{ _id: string; _rev: string }>(docId);
    const localRev1 = await localDB.get<{ _id: string; _rev: string }>(docId);
    const staleRev = localRev1._rev;

    // 2. Remote recalculates running balance & timestamps (pure derived/volatile fields)
    const remoteDerivedUpdate = {
      ...baseParty,
      _id: docId,
      _rev: remoteRev1._rev,
      docType: 'party',
      currentBalance: 32000,
      balancePaise: 3200000,
      updatedAt: '2026-11-17T08:05:00.000Z',
      syncedAt: '2026-11-17T08:05:01.000Z',
      paiseSchema: 2,
    };
    await remoteDB.put(remoteDerivedUpdate);

    // Wait for remote revision to reach localDB
    await waitFor(async () => {
      try {
        const loc = await localDB.get<{ _id: string; _rev: string; currentBalance: number }>(docId);
        return loc._rev.startsWith('2-') && loc.currentBalance === 32000;
      } catch {
        return false;
      }
    });

    // 3. Local calls persistDoc with earlier balance snapshot
    // Verify pure derivedFields invariants on these document payloads
    expect(isDocDivergent(baseParty, remoteDerivedUpdate)).toBe(true);
    expect(hasOnlyDerivedDivergence(baseParty, remoteDerivedUpdate)).toBe(true);
    const diffFields = getDerivedDivergenceFields(baseParty, remoteDerivedUpdate);
    expect(diffFields).toContain('currentBalance');
    expect(diffFields).toContain('balancePaise');
    expect(diffFields).toContain('updatedAt');
    expect(diffFields).not.toContain('name');

    // Simulate read-modify-write race: spy on localDB.get so the first internal read
    // for docId inside persistDoc returns a stale _rev, forcing a real 409 conflict
    // while the 409 handler fetches the newer authoritative revision from localDB.
    const serviceLocalDB = (pouchService as unknown as { localDB: PouchDB.Database }).localDB;
    let docIdGetCalls = 0;
    const originalGet = serviceLocalDB.get.bind(serviceLocalDB);
    const getSpy = vi.spyOn(serviceLocalDB, 'get').mockImplementation(((id: any, options?: any) => {
      if (id === docId) {
        docIdGetCalls++;
        if (docIdGetCalls === 1) {
          return Promise.resolve({
            _id: docId,
            _rev: staleRev,
            ...baseParty,
          } as any);
        }
      }
      return originalGet(id, options);
    }) as any);

    const pendingPartyWithStaleRev = {
      ...baseParty,
      _rev: staleRev,
    };

    try {
      // Run persistDoc where the pending write carries the stale rev context
      await (pouchService as unknown as { persistDoc: (type: string, doc: unknown) => Promise<void> }).persistDoc(
        'party',
        pendingPartyWithStaleRev,
      );
    } finally {
      getSpy.mockRestore();
    }

    expect(docIdGetCalls).toBeGreaterThanOrEqual(2);

    // 4. Verification:
    // Stored remote authoritative revision remains intact
    const finalDoc = await localDB.get<{ _id: string; _rev: string; currentBalance: number; name: string }>(docId);
    expect(finalDoc.name).toBe('Kamakhya Trading Syndicate');
    expect(finalDoc.currentBalance).toBe(32000);

    // Reconciled without any conflict entry
    const conflicts = await pouchService.getConflicts();
    expect(conflicts).toHaveLength(0);

    const explicitMap = (pouchService as unknown as { explicitConflicts: Map<string, SyncConflict> })
      .explicitConflicts;
    expect(explicitMap.size).toBe(0);
  }, 25000);

  it('asserts no "local-409" string ever appears in conflict arrays or stored docs', async () => {
    // Write multiple items through persistDoc and remote updates
    const partyA = {
      id: 'party-check-a',
      name: 'North East Hardware',
      phone: '9900011222',
      type: 'SUPPLIER',
      currentBalance: 12000,
    };
    const partyB = {
      id: 'party-check-b',
      name: 'Barak Valley Agro',
      phone: '9900033444',
      type: 'CUSTOMER',
      currentBalance: 18000,
    };

    await (pouchService as unknown as { persistDoc: (type: string, doc: unknown) => Promise<void> }).persistDoc(
      'party',
      partyA,
    );
    await (pouchService as unknown as { persistDoc: (type: string, doc: unknown) => Promise<void> }).persistDoc(
      'party',
      partyB,
    );

    await waitFor(async () => {
      try {
        const remA = await remoteDB.get('party:party-check-a');
        const remB = await remoteDB.get('party:party-check-b');
        return remA != null && remB != null;
      } catch {
        return false;
      }
    });

    // Remote derived updates
    const remDocA = await remoteDB.get<{ _id: string; _rev: string }>('party:party-check-a');
    await remoteDB.put({
      ...partyA,
      _id: 'party:party-check-a',
      _rev: remDocA._rev,
      docType: 'party',
      currentBalance: 14000,
      balancePaise: 1400000,
      updatedAt: new Date().toISOString(),
    });

    // Re-persist local to trigger phantom-409 resolution
    await (pouchService as unknown as { persistDoc: (type: string, doc: unknown) => Promise<void> }).persistDoc(
      'party',
      partyA,
    );

    // 1. Conflict arrays must not contain 'local-409'
    const conflicts = await pouchService.getConflicts();
    for (const c of conflicts) {
      expect(c.conflictingRev).not.toBe('local-409');
      expect(JSON.stringify(c)).not.toContain('local-409');
    }

    // 2. Stored docs across local and remote must not contain 'local-409'
    const [allLocal, allRemote] = await Promise.all([
      localDB.allDocs({ include_docs: true, conflicts: true }),
      remoteDB.allDocs({ include_docs: true, conflicts: true }),
    ]);

    for (const row of allLocal.rows) {
      const docStr = JSON.stringify(row.doc || {});
      expect(docStr).not.toContain('local-409');
      const conflictsArray = (row.doc as { _conflicts?: string[] })?._conflicts;
      if (conflictsArray) {
        expect(conflictsArray).not.toContain('local-409');
      }
    }

    for (const row of allRemote.rows) {
      const docStr = JSON.stringify(row.doc || {});
      expect(docStr).not.toContain('local-409');
      const conflictsArray = (row.doc as { _conflicts?: string[] })?._conflicts;
      if (conflictsArray) {
        expect(conflictsArray).not.toContain('local-409');
      }
    }
  }, 25000);
});
