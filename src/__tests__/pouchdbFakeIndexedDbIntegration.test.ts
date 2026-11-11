import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import PouchDB from 'pouchdb-browser';

describe('PouchDB + fake-indexeddb integration', () => {
  let dbName: string;
  let db: PouchDB.Database;

  beforeEach(() => {
    dbName = 'int_' + Math.random().toString(36).slice(2);
    db = new PouchDB(dbName);
  });

  afterEach(async () => {
    try {
      await db.destroy();
    } catch {
      // ignore
    }
  });

  it('creates and reads a document', async () => {
    const res = await db.put({ _id: 'doc1', title: 'Hello', count: 5 });
    expect((res as { ok?: boolean }).ok).toBe(true);
    const doc = await db.get<{ _id: string; title: string; count: number }>('doc1');
    expect(doc.title).toBe('Hello');
    expect(doc.count).toBe(5);
  });

  it('updates a document with _rev', async () => {
    await db.put({ _id: 'doc2', value: 1 });
    const doc = await db.get<{ _id: string; _rev: string; value: number }>('doc2');
    const r2 = await db.put({ _id: doc._id, _rev: doc._rev, value: 2 });
    expect(r2.ok).toBe(true);
    const updated = await db.get<{ value: number }>('doc2');
    expect(updated.value).toBe(2);
  });

  it('deletes a document', async () => {
    await db.put({ _id: 'doc3', value: 1 });
    const doc = await db.get<{ _id: string; _rev: string }>('doc3');
    await db.remove(doc);
    await expect(db.get('doc3')).rejects.toThrow();
  });

  it('allDocs returns inserted documents', async () => {
    await db.put({ _id: 'a', v: 1 });
    await db.put({ _id: 'b', v: 2 });
    const res = await db.allDocs({ include_docs: true });
    expect(res.total_rows).toBe(2);
    const ids = res.rows.map((r) => r.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('bulkDocs inserts multiple', async () => {
    const res = await db.bulkDocs([
      { _id: 'x', n: 1 },
      { _id: 'y', n: 2 },
      { _id: 'z', n: 3 },
    ]);
    expect(res.length).toBe(3);
    expect(res.every((r) => (r as { ok?: boolean }).ok === true)).toBe(true);
  });

  it('handles conflict on stale _rev', async () => {
    await db.put({ _id: 'c', value: 1 });
    const doc = await db.get<{ _id: string; _rev: string; value: number }>('c');
    await db.put({ _id: doc._id, _rev: doc._rev, value: 2 });
    await expect(db.put({ _id: doc._id, _rev: doc._rev, value: 3 })).rejects.toMatchObject({ status: 409 });
  });

  it('info returns doc_count', async () => {
    await db.put({ _id: 'd', v: 1 });
    const info = await db.info();
    expect(info.doc_count).toBe(1);
  });
});

describe('Storage quota estimate (mocked)', () => {
  it('reads quota from navigator.storage.estimate when available', async () => {
    const original = navigator.storage;
    const mockEstimate = vi.fn(async () => ({ usage: 1024, quota: 1024 * 1024 }));
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: mockEstimate },
      configurable: true,
      writable: true,
    });
    const est = await navigator.storage.estimate();
    expect(est.usage).toBe(1024);
    expect(est.quota).toBe(1024 * 1024);
    Object.defineProperty(navigator, 'storage', { value: original, configurable: true, writable: true });
  });
});
