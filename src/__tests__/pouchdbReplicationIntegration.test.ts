import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import PouchDB from 'pouchdb-browser';

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
      // Continue polling until predicate succeeds or timeout
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitFor condition timed out after ${timeoutMs}ms`);
}

describe('PouchDB live replication integration (fake-indexeddb)', () => {
  let dbNameA: string;
  let dbNameB: string;
  let dbA: PouchDB.Database;
  let dbB: PouchDB.Database;
  let syncHandler: PouchDB.Replication.Sync<Record<string, unknown>> | null = null;

  beforeEach(() => {
    dbNameA = 'int_rep_a_' + Math.random().toString(36).slice(2);
    dbNameB = 'int_rep_b_' + Math.random().toString(36).slice(2);
    dbA = new PouchDB(dbNameA);
    dbB = new PouchDB(dbNameB);
    syncHandler = null;
  });

  afterEach(async () => {
    if (syncHandler) {
      syncHandler.cancel();
      syncHandler = null;
    }
    try {
      await dbA.destroy();
    } catch {
      // Ignore cleanup error
    }
    try {
      await dbB.destroy();
    } catch {
      // Ignore cleanup error
    }
  });

  it('round trip: put on A -> replicate -> get on B returns identical doc', async () => {
    syncHandler = PouchDB.sync(dbA, dbB, { live: true, retry: true });

    const docToPut = {
      _id: 'doc-roundtrip-1',
      name: 'Fortune Mustard Oil 1L',
      sku: 'SKU-OIL-1L',
      price: 165,
      docType: 'item',
    };

    const putRes = await dbA.put(docToPut);
    expect((putRes as { ok?: boolean }).ok).toBe(true);

    await waitFor(async () => {
      try {
        const found = await dbB.get<typeof docToPut>('doc-roundtrip-1');
        return found != null && found.name === 'Fortune Mustard Oil 1L';
      } catch {
        return false;
      }
    });

    const docB = await dbB.get<typeof docToPut>('doc-roundtrip-1');
    expect(docB._id).toBe('doc-roundtrip-1');
    expect(docB.name).toBe('Fortune Mustard Oil 1L');
    expect(docB.sku).toBe('SKU-OIL-1L');
    expect(docB.price).toBe(165);
    expect(docB._rev).toBe((putRes as { rev: string }).rev);
  }, 25000);

  it('update propagation: update on A -> replicate -> B sees new value and new _rev', async () => {
    syncHandler = PouchDB.sync(dbA, dbB, { live: true, retry: true });

    await dbA.put({
      _id: 'doc-update-1',
      title: 'Initial Title',
      revisionCount: 1,
    });

    await waitFor(async () => {
      try {
        const d = await dbB.get<{ revisionCount: number }>('doc-update-1');
        return d != null && d.revisionCount === 1;
      } catch {
        return false;
      }
    });

    const docAInitial = await dbA.get<{ _id: string; _rev: string; title: string; revisionCount: number }>(
      'doc-update-1',
    );
    const updateRes = await dbA.put({
      _id: docAInitial._id,
      _rev: docAInitial._rev,
      title: 'Updated Title',
      revisionCount: 2,
    });
    expect((updateRes as { ok?: boolean }).ok).toBe(true);

    await waitFor(async () => {
      try {
        const d = await dbB.get<{ revisionCount: number }>('doc-update-1');
        return d != null && d.revisionCount === 2;
      } catch {
        return false;
      }
    });

    const docBUpdated = await dbB.get<{ _id: string; _rev: string; title: string; revisionCount: number }>(
      'doc-update-1',
    );
    expect(docBUpdated.title).toBe('Updated Title');
    expect(docBUpdated.revisionCount).toBe(2);
    expect(docBUpdated._rev).toBe((updateRes as { rev: string }).rev);
  }, 25000);

  it('bi-directional: A writes doc X, B writes doc Y, replicate both ways -> both databases end with X and Y', async () => {
    syncHandler = PouchDB.sync(dbA, dbB, { live: true, retry: true });

    await dbA.put({
      _id: 'doc-x',
      origin: 'Node-A',
      payload: 'Alpha',
    });

    await dbB.put({
      _id: 'doc-y',
      origin: 'Node-B',
      payload: 'Beta',
    });

    await waitFor(async () => {
      try {
        const aHasY = await dbA.get('doc-y');
        const bHasX = await dbB.get('doc-x');
        return aHasY != null && bHasX != null;
      } catch {
        return false;
      }
    });

    const [aDocX, aDocY, bDocX, bDocY] = await Promise.all([
      dbA.get<{ payload: string }>('doc-x'),
      dbA.get<{ payload: string }>('doc-y'),
      dbB.get<{ payload: string }>('doc-x'),
      dbB.get<{ payload: string }>('doc-y'),
    ]);

    expect(aDocX.payload).toBe('Alpha');
    expect(aDocY.payload).toBe('Beta');
    expect(bDocX.payload).toBe('Alpha');
    expect(bDocY.payload).toBe('Beta');
  }, 25000);

  it('conflict: concurrent edits to the same _id from A and B, replicate -> one side records a _conflicts entry; assert no document is lost', async () => {
    // Keep sync disarmed while writing divergent versions to the same _id
    await dbA.put({
      _id: 'doc-conflict-target',
      branch: 'Branch A',
      author: 'User A',
      counter: 100,
    });

    await dbB.put({
      _id: 'doc-conflict-target',
      branch: 'Branch B',
      author: 'User B',
      counter: 200,
    });

    // One-way replicate from A into B to trigger CouchDB/PouchDB MVCC conflict detection
    await PouchDB.replicate(dbA, dbB);

    const docOnB = await dbB.get<{
      _id: string;
      _rev: string;
      _conflicts?: string[];
      branch: string;
      author: string;
      counter: number;
    }>('doc-conflict-target', { conflicts: true });

    expect(docOnB._conflicts).toBeDefined();
    expect(Array.isArray(docOnB._conflicts)).toBe(true);
    expect(docOnB._conflicts!.length).toBeGreaterThan(0);

    const conflictingRev = docOnB._conflicts![0];
    const conflictingDoc = await dbB.get<{
      _id: string;
      _rev: string;
      branch: string;
      author: string;
      counter: number;
    }>('doc-conflict-target', { rev: conflictingRev });

    // Assert that no document content was lost: both values are reachable
    const branches = [docOnB.branch, conflictingDoc.branch].sort();
    const authors = [docOnB.author, conflictingDoc.author].sort();
    const counters = [docOnB.counter, conflictingDoc.counter].sort((a, b) => a - b);

    expect(branches).toEqual(['Branch A', 'Branch B']);
    expect(authors).toEqual(['User A', 'User B']);
    expect(counters).toEqual([100, 200]);
  }, 25000);

  it('delete: delete on A -> replicate -> B no longer has the doc', async () => {
    syncHandler = PouchDB.sync(dbA, dbB, { live: true, retry: true });

    await dbA.put({
      _id: 'doc-to-delete',
      status: 'active',
    });

    await waitFor(async () => {
      try {
        const found = await dbB.get('doc-to-delete');
        return found != null;
      } catch {
        return false;
      }
    });

    const docA = await dbA.get<{ _id: string; _rev: string }>('doc-to-delete');
    await dbA.remove(docA);

    await waitFor(async () => {
      try {
        await dbB.get('doc-to-delete');
        return false;
      } catch (err: unknown) {
        return (err as { status?: number })?.status === 404;
      }
    });

    await expect(dbB.get('doc-to-delete')).rejects.toMatchObject({ status: 404 });
  }, 25000);

  it('bulk: 200 docs put via bulkDocs on A -> replicate -> B has all 200 with matching _revs', async () => {
    syncHandler = PouchDB.sync(dbA, dbB, { live: true, retry: true });

    const totalDocs = 200;
    const bulkPayload = Array.from({ length: totalDocs }, (_, idx) => ({
      _id: `bulk-doc-${String(idx).padStart(4, '0')}`,
      index: idx,
      data: `Payload value for item ${idx}`,
    }));

    const bulkRes = await dbA.bulkDocs(bulkPayload);
    expect(bulkRes).toHaveLength(totalDocs);
    expect(bulkRes.every((r) => (r as { ok?: boolean }).ok === true)).toBe(true);

    const revMapA = new Map<string, string>();
    for (const r of bulkRes) {
      const okRow = r as { id: string; rev: string };
      revMapA.set(okRow.id, okRow.rev);
    }

    await waitFor(async () => {
      try {
        const info = await dbB.info();
        return info.doc_count >= totalDocs;
      } catch {
        return false;
      }
    }, 30000);

    const allB = await dbB.allDocs({ include_docs: true });
    expect(allB.total_rows).toBe(totalDocs);

    for (const row of allB.rows) {
      const expectedRev = revMapA.get(row.id);
      expect(expectedRev).toBeDefined();
      expect(row.value.rev).toBe(expectedRev);
    }
  }, 35000);
});
