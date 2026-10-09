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
  auditTrail,
  AuditTrailService,
  GENESIS_PREVIOUS_HASH,
  canonicalJson,
  computeSha256Hex,
  computeRecordHash,
  buildPreimage,
  AuditRecord,
} from '../services/auditTrail.ts';
import { db } from '../services/db.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { StockAdjustment } from '../models/item.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { CompanyProfile } from '../models/company.ts';

describe('MCA-Compliant Immutable Audit Trail (Rule 3(1))', () => {
  beforeEach(async () => {
    testStorage.clear();
    inMemoryDocs.clear();
    await auditTrail._resetForTesting();
  });

  // =========================================================================
  // GROUP 1: Cryptographic Chaining & Genesis Block
  // =========================================================================

  it('TC-01: initializes genesis block with sequence 1 and 64-zero previousHash', async () => {
    const record = await auditTrail.logEvent({
      userId: 'usr_owner_1',
      userName: 'John Doe',
      userRole: 'OWNER',
      actionType: 'SETTINGS_UPDATE',
      documentId: 'COMP-001',
      documentType: 'SETTINGS',
      summary: 'Initial company profile setup',
    });

    expect(record.sequence).toBe(1);
    expect(record.previousHash).toBe(GENESIS_PREVIOUS_HASH);
    expect(record.previousHash).toBe('0'.repeat(64));
    expect(record.id).toMatch(/^audit_\d+_/);
    expect(record.recordHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('TC-02: increments sequence monotonically by exactly 1 across successive events', async () => {
    const rec1 = await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User 1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-001',
      documentType: 'INVOICE',
      summary: 'Created invoice INV-001',
    });
    const rec2 = await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User 1',
      userRole: 'OWNER',
      actionType: 'INVOICE_UPDATE',
      documentId: 'INV-001',
      documentType: 'INVOICE',
      summary: 'Updated invoice INV-001',
    });
    const rec3 = await auditTrail.logEvent({
      userId: 'usr_2',
      userName: 'User 2',
      userRole: 'ACCOUNTANT',
      actionType: 'PAYMENT_RECORD',
      documentId: 'VCH-001',
      documentType: 'PAYMENT',
      summary: 'Payment receipt for INV-001',
    });

    expect(rec1.sequence).toBe(1);
    expect(rec2.sequence).toBe(2);
    expect(rec3.sequence).toBe(3);
  });

  it('TC-03: cryptographically links record N+1 previousHash to record N recordHash', async () => {
    const rec1 = await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User 1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-001',
      documentType: 'INVOICE',
      summary: 'Event 1',
    });
    const rec2 = await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User 1',
      userRole: 'OWNER',
      actionType: 'INVOICE_UPDATE',
      documentId: 'INV-001',
      documentType: 'INVOICE',
      summary: 'Event 2',
    });
    const rec3 = await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User 1',
      userRole: 'OWNER',
      actionType: 'INVOICE_DELETE',
      documentId: 'INV-001',
      documentType: 'INVOICE',
      summary: 'Event 3',
    });

    expect(rec2.previousHash).toBe(rec1.recordHash);
    expect(rec3.previousHash).toBe(rec2.recordHash);
  });

  // =========================================================================
  // GROUP 2: Canonical JSON Serialization & Hashing Invariants
  // =========================================================================

  it('TC-04: produces identical canonical JSON regardless of object key insertion order', () => {
    const objA = { z: 100, b: 200, a: { y: 'bar', x: 'foo' } };
    const objB = { a: { x: 'foo', y: 'bar' }, z: 100, b: 200 };

    const canonA = canonicalJson(objA);
    const canonB = canonicalJson(objB);

    expect(canonA).toBe(canonB);
    expect(canonA).toBe('{"a":{"x":"foo","y":"bar"},"b":200,"z":100}');
  });

  it('TC-05: normalizes null, undefined, and primitives consistently in canonicalJson', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson('hello')).toBe('"hello"');
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalJson({ a: undefined, b: 'valid' })).toBe('{"b":"valid"}');
  });

  it('TC-06: computes identical recordHash for identical data with differently ordered snapshot keys', async () => {
    const snapshot1 = { grandTotal: 5000, partyName: 'Sharma Traders', items: [{ qty: 2, rate: 2500 }] };
    const snapshot2 = { items: [{ rate: 2500, qty: 2 }], partyName: 'Sharma Traders', grandTotal: 5000 };

    const recordPayload1 = {
      previousHash: GENESIS_PREVIOUS_HASH,
      sequence: 1,
      timestamp: '2026-10-09T10:00:00.000Z',
      userId: 'usr_1',
      userName: 'Alice',
      userRole: 'OWNER' as const,
      actionType: 'INVOICE_CREATE' as const,
      documentId: 'INV-101',
      documentType: 'INVOICE' as const,
      previousSnapshot: undefined,
      newSnapshot: snapshot1,
      summary: 'Invoice creation test',
    };

    const recordPayload2 = {
      ...recordPayload1,
      newSnapshot: snapshot2,
    };

    const hash1 = await computeRecordHash(recordPayload1);
    const hash2 = await computeRecordHash(recordPayload2);

    expect(hash1).toBe(hash2);
  });

  it('TC-07: correctly encodes multi-byte Unicode strings and Indian Rupee symbol ₹', async () => {
    const summary = 'GST Invoice with ₹5,000 for गुप्ता ट्रेडर्स (Gupta Traders)';
    const hash = await computeSha256Hex(summary);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // Deterministic verify
    const hashRepeat = await computeSha256Hex(summary);
    expect(hash).toBe(hashRepeat);
  });

  // =========================================================================
  // GROUP 3: Chain Verification & Tamper Detection
  // =========================================================================

  it('TC-08: verifies an empty audit trail as valid with 0 records', async () => {
    const result = await auditTrail.verifyChainIntegrity();
    expect(result.valid).toBe(true);
    expect(result.totalRecords).toBe(0);
  });

  it('TC-09: verifies an untampered multi-block audit ledger', async () => {
    for (let i = 1; i <= 5; i++) {
      await auditTrail.logEvent({
        userId: 'usr_owner',
        userName: 'Admin',
        userRole: 'OWNER',
        actionType: 'INVOICE_CREATE',
        documentId: `INV-${i}`,
        documentType: 'INVOICE',
        summary: `Created invoice #${i}`,
      });
    }

    const result = await auditTrail.verifyChainIntegrity();
    expect(result.valid).toBe(true);
    expect(result.totalRecords).toBe(5);
    expect(result.corruptedRecordId).toBeUndefined();
  });

  it('TC-10: detects tampered snapshot data in a record payload', async () => {
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User 1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-100',
      documentType: 'INVOICE',
      newSnapshot: { amount: 1000 },
      summary: 'Created invoice for ₹1,000',
    });
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User 1',
      userRole: 'OWNER',
      actionType: 'INVOICE_UPDATE',
      documentId: 'INV-100',
      documentType: 'INVOICE',
      newSnapshot: { amount: 2000 },
      summary: 'Updated invoice to ₹2,000',
    });

    const records = await auditTrail.getAuditTrail();
    // Tamper with record 1 snapshot
    const tampered = records.map((r) => {
      if (r.sequence === 1) {
        return {
          ...r,
          newSnapshot: { amount: 999999 }, // Tampered financial data!
        };
      }
      return r;
    });
    auditTrail._setRecordsForTesting(tampered);

    const result = await auditTrail.verifyChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.corruptedRecordId).toBe(records[0].id);
    expect(result.brokenSequence).toBe(1);
    expect(result.reason).toContain('Corrupted payload');
  });

  it('TC-11: detects tampered timestamp in a record', async () => {
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User 1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-1',
      documentType: 'INVOICE',
      summary: 'Invoice 1',
    });
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User 1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-2',
      documentType: 'INVOICE',
      summary: 'Invoice 2',
    });

    const records = await auditTrail.getAuditTrail();
    const tampered = records.map((r) => {
      if (r.sequence === 2) {
        return { ...r, timestamp: '1970-01-01T00:00:00.000Z' };
      }
      return r;
    });
    auditTrail._setRecordsForTesting(tampered);

    const result = await auditTrail.verifyChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.brokenSequence).toBe(2);
    expect(result.reason).toContain('Corrupted payload');
  });

  it('TC-12: detects tampered user identity or role', async () => {
    await auditTrail.logEvent({
      userId: 'usr_cashier',
      userName: 'Cashier Bob',
      userRole: 'CASHIER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-1',
      documentType: 'INVOICE',
      summary: 'Created invoice',
    });

    const records = await auditTrail.getAuditTrail();
    const tampered = [{ ...records[0], userRole: 'OWNER' as const }];
    auditTrail._setRecordsForTesting(tampered);

    const result = await auditTrail.verifyChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Corrupted payload');
  });

  it('TC-13: detects altered previousHash in a chained block', async () => {
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-1',
      documentType: 'INVOICE',
      summary: 'Invoice 1',
    });
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-2',
      documentType: 'INVOICE',
      summary: 'Invoice 2',
    });

    const records = await auditTrail.getAuditTrail();
    // Tamper with record 2 previousHash
    const tampered = [
      records[0],
      { ...records[1], previousHash: 'f'.repeat(64) },
    ];
    auditTrail._setRecordsForTesting(tampered);

    const result = await auditTrail.verifyChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.brokenSequence).toBe(2);
    expect(result.reason).toContain('Broken cryptographic hash chain');
  });

  it('TC-14: detects deleted record from the middle of the chain (sequence gap)', async () => {
    for (let i = 1; i <= 4; i++) {
      await auditTrail.logEvent({
        userId: 'usr_1',
        userName: 'User',
        userRole: 'OWNER',
        actionType: 'INVOICE_CREATE',
        documentId: `INV-${i}`,
        documentType: 'INVOICE',
        summary: `Invoice ${i}`,
      });
    }

    const records = await auditTrail.getAuditTrail();
    // Remove sequence 2
    const tampered = [records[0], records[2], records[3]];
    auditTrail._setRecordsForTesting(tampered);

    const result = await auditTrail.verifyChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.brokenSequence).toBe(3);
    expect(result.reason).toContain('Sequence break');
  });

  it('TC-15: detects deleted genesis block (chain starting at sequence 2)', async () => {
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-1',
      documentType: 'INVOICE',
      summary: 'Genesis block',
    });
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-2',
      documentType: 'INVOICE',
      summary: 'Block 2',
    });

    const records = await auditTrail.getAuditTrail();
    // Drop genesis block
    const tampered = [records[1]];
    auditTrail._setRecordsForTesting(tampered);

    const result = await auditTrail.verifyChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.brokenSequence).toBe(2);
    expect(result.reason).toContain('Sequence break');
  });

  it('TC-16: detects inserted counterfeit record between valid records', async () => {
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-1',
      documentType: 'INVOICE',
      summary: 'Block 1',
    });
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'User',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-2',
      documentType: 'INVOICE',
      summary: 'Block 2',
    });

    const records = await auditTrail.getAuditTrail();
    // Insert bogus record
    const counterfeit: AuditRecord = {
      id: 'audit_fake_123',
      sequence: 2,
      timestamp: new Date().toISOString(),
      userId: 'usr_hacker',
      userName: 'Hacker',
      userRole: 'OWNER',
      actionType: 'SETTINGS_UPDATE',
      documentId: 'HACK',
      documentType: 'SETTINGS',
      summary: 'Fake injected transaction',
      previousHash: records[0].recordHash,
      recordHash: 'a'.repeat(64),
    };

    // Replace or shift
    const tampered = [records[0], counterfeit, { ...records[1], sequence: 3 }];
    auditTrail._setRecordsForTesting(tampered);

    const result = await auditTrail.verifyChainIntegrity();
    expect(result.valid).toBe(false);
  });

  // =========================================================================
  // GROUP 4: Concurrency & Mutex Promise Queue
  // =========================================================================

  it('TC-17: serializes 10 concurrent logEvent calls into unbroken monotonic chain', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      auditTrail.logEvent({
        userId: `usr_${i}`,
        userName: `User ${i}`,
        userRole: 'OWNER',
        actionType: 'INVOICE_CREATE',
        documentId: `INV-CONCURRENT-${i + 1}`,
        documentType: 'INVOICE',
        summary: `Concurrent transaction #${i + 1}`,
      })
    );

    const results = await Promise.all(promises);

    expect(results.length).toBe(10);
    // Sequences must be strictly 1..10
    const sequences = results.map((r) => r.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // Verify entire chain is cryptographically intact
    const verification = await auditTrail.verifyChainIntegrity();
    expect(verification.valid).toBe(true);
    expect(verification.totalRecords).toBe(10);
  });

  // =========================================================================
  // GROUP 5: Multi-Criteria Filtering & Search
  // =========================================================================

  it('TC-18: filters audit trail by date range inclusively', async () => {
    await auditTrail.logEvent({
      timestamp: '2026-10-01T10:00:00.000Z',
      userId: 'usr_1',
      userName: 'U1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-1',
      documentType: 'INVOICE',
      summary: 'Oct 1 event',
    });
    await auditTrail.logEvent({
      timestamp: '2026-10-05T12:00:00.000Z',
      userId: 'usr_1',
      userName: 'U1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-2',
      documentType: 'INVOICE',
      summary: 'Oct 5 event',
    });
    await auditTrail.logEvent({
      timestamp: '2026-10-10T14:00:00.000Z',
      userId: 'usr_1',
      userName: 'U1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-3',
      documentType: 'INVOICE',
      summary: 'Oct 10 event',
    });

    const filtered = await auditTrail.getAuditTrail({
      startDate: '2026-10-02',
      endDate: '2026-10-06',
    });

    expect(filtered.length).toBe(1);
    expect(filtered[0].documentId).toBe('INV-2');
  });

  it('TC-19: returns empty array when startDate is after endDate', async () => {
    await auditTrail.logEvent({
      timestamp: '2026-10-05T10:00:00.000Z',
      userId: 'usr_1',
      userName: 'U1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-1',
      documentType: 'INVOICE',
      summary: 'Test',
    });

    const filtered = await auditTrail.getAuditTrail({
      startDate: '2026-10-10',
      endDate: '2026-10-01',
    });

    expect(filtered).toEqual([]);
  });

  it('TC-20: filters audit trail by userId', async () => {
    await auditTrail.logEvent({
      userId: 'usr_alice',
      userName: 'Alice',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-1',
      documentType: 'INVOICE',
      summary: 'Alice invoice',
    });
    await auditTrail.logEvent({
      userId: 'usr_bob',
      userName: 'Bob',
      userRole: 'CASHIER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-2',
      documentType: 'INVOICE',
      summary: 'Bob invoice',
    });

    const aliceRecords = await auditTrail.getAuditTrail({ userId: 'usr_alice' });
    expect(aliceRecords.length).toBe(1);
    expect(aliceRecords[0].userName).toBe('Alice');
  });

  it('TC-21: filters audit trail by actionType', async () => {
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'U1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-1',
      documentType: 'INVOICE',
      summary: 'Create',
    });
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'U1',
      userRole: 'OWNER',
      actionType: 'INVOICE_DELETE',
      documentId: 'INV-1',
      documentType: 'INVOICE',
      summary: 'Delete',
    });

    const deleted = await auditTrail.getAuditTrail({ actionType: 'INVOICE_DELETE' });
    expect(deleted.length).toBe(1);
    expect(deleted[0].actionType).toBe('INVOICE_DELETE');
  });

  it('TC-22: filters audit trail by documentId substring and case-insensitivity', async () => {
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'U1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-2026-0042',
      documentType: 'INVOICE',
      summary: 'Specific invoice',
    });

    const found = await auditTrail.getAuditTrail({ documentId: '0042' });
    expect(found.length).toBe(1);
    expect(found[0].documentId).toBe('INV-2026-0042');
  });

  it('TC-23: performs case-insensitive free-text searchTerm search', async () => {
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'Suresh Kumar',
      userRole: 'ACCOUNTANT',
      actionType: 'STOCK_ADJUSTMENT',
      documentId: 'ADJ-55',
      documentType: 'ITEM',
      summary: 'Damaged packaging during monsoon transit',
    });

    const matchSummary = await auditTrail.getAuditTrail({ searchTerm: 'monsoon' });
    expect(matchSummary.length).toBe(1);

    const matchUser = await auditTrail.getAuditTrail({ searchTerm: 'suresh' });
    expect(matchUser.length).toBe(1);
  });

  it('TC-24: retrieves single record by ID or returns null if non-existent', async () => {
    const rec = await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'U1',
      userRole: 'OWNER',
      actionType: 'SETTINGS_UPDATE',
      documentId: 'COMP',
      documentType: 'SETTINGS',
      summary: 'Profile',
    });

    const found = await auditTrail.getAuditRecordById(rec.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(rec.id);

    const notFound = await auditTrail.getAuditRecordById('audit_non_existent');
    expect(notFound).toBeNull();
  });

  it('TC-25: retrieves lifecycle records for a specific document', async () => {
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'U1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-999',
      documentType: 'INVOICE',
      summary: 'Created INV-999',
    });
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'U1',
      userRole: 'OWNER',
      actionType: 'INVOICE_UPDATE',
      documentId: 'INV-999',
      documentType: 'INVOICE',
      summary: 'Updated INV-999',
    });
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'U1',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-888',
      documentType: 'INVOICE',
      summary: 'Created INV-888',
    });

    const docTrail = await auditTrail.getAuditTrailForDocument('INV-999');
    expect(docTrail.length).toBe(2);
    expect(docTrail.every((r) => r.documentId === 'INV-999')).toBe(true);
  });

  // =========================================================================
  // GROUP 6: Statutory Export Formats (RFC 4180 CSV & Formatted JSON)
  // =========================================================================

  it('TC-26: exports complete audit trail formatted as RFC 4180 CSV', async () => {
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'John "Admin" Doe',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-01',
      documentType: 'INVOICE',
      summary: 'Invoice, with comma and quotes',
    });

    const csv = await auditTrail.exportAuditTrailAsCsv();
    expect(csv).toContain('Sequence,Timestamp,User ID,User Name,User Role,Action Type,Document Type,Document ID,Summary,Previous Hash,Record Hash');
    expect(csv).toContain('"John ""Admin"" Doe"');
    expect(csv).toContain('"Invoice, with comma and quotes"');
  });

  it('TC-27: exports complete audit trail formatted as valid JSON', async () => {
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'John Doe',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-01',
      documentType: 'INVOICE',
      summary: 'Test JSON export',
    });

    const jsonStr = await auditTrail.exportAuditTrailAsJson();
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].documentId).toBe('INV-01');
    expect(parsed[0].previousHash).toBe(GENESIS_PREVIOUS_HASH);
  });

  // =========================================================================
  // GROUP 7: Statutory Immutability Protections
  // =========================================================================

  it('TC-28: throws statutory violation error when updateRecord is invoked', () => {
    expect(() => auditTrail.updateRecord('audit_1', { summary: 'Hacked' })).toThrowError(
      /Audit records are immutable/
    );
  });

  it('TC-29: throws statutory violation error when deleteRecord is invoked', () => {
    expect(() => auditTrail.deleteRecord('audit_1')).toThrowError(
      /Audit trail cannot be purged or deleted/
    );
  });

  it('TC-30: throws statutory violation error when purge or clear is invoked', () => {
    expect(() => auditTrail.purge()).toThrowError(/Audit trail cannot be purged or deleted/);
    expect(() => auditTrail.clear()).toThrowError(/Audit trail cannot be purged or deleted/);
  });

  it('TC-31: returns detached copies from getAuditTrail preventing caller mutations', async () => {
    await auditTrail.logEvent({
      userId: 'usr_1',
      userName: 'John',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-1',
      documentType: 'INVOICE',
      summary: 'Original Summary',
    });

    const records = await auditTrail.getAuditTrail();
    // Mutate returned object
    records[0].summary = 'Mutated by caller';

    const freshRecords = await auditTrail.getAuditTrail();
    expect(freshRecords[0].summary).toBe('Original Summary');
  });

  // =========================================================================
  // GROUP 8: DB Mutation Hooks Integration
  // =========================================================================

  it('TC-32: hooks db.saveInvoice for brand-new invoice emitting INVOICE_CREATE', async () => {
    const invoice: Invoice = {
      id: `INV_TEST_${Date.now()}`,
      invoiceNumber: `INV-2026-${Date.now()}`,
      invoiceType: 'B2B',
      date: '2026-10-09',
      partyId: 'pty_1',
      partyName: 'Alpha Tech Corp',
      partyAddress: 'Connaught Place, New Delhi',
      partyStateCode: '07',
      placeOfSupplyStateCode: '07',
      isIntraState: true,
      items: [],
      totalGrossAmount: 10000,
      totalDiscount: 0,
      totalTaxableAmount: 10000,
      totalCgst: 900,
      totalSgst: 900,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 1800,
      roundOff: 0,
      grandTotal: 11800,
      amountInWords: 'Eleven Thousand Eight Hundred Only',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 11800,
      balanceAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveInvoice(invoice);
    await auditTrail.waitForIdle();

    const trail = await auditTrail.getAuditTrailForDocument(invoice.id);
    expect(trail.length).toBe(1);
    expect(trail[0].actionType).toBe('INVOICE_CREATE');
    expect(trail[0].documentType).toBe('INVOICE');
    expect(trail[0].newSnapshot?.invoiceNumber).toBe(invoice.invoiceNumber);
    expect(trail[0].previousSnapshot).toBeUndefined();
  });

  it('TC-33: hooks db.saveInvoice for invoice update emitting INVOICE_UPDATE with pre/post snapshots', async () => {
    const invoiceId = `INV_UPDATE_${Date.now()}`;
    const invoice: Invoice = {
      id: invoiceId,
      invoiceNumber: `INV-UPD-${Date.now()}`,
      invoiceType: 'B2B',
      date: '2026-10-09',
      partyName: 'Beta Logistics',
      partyAddress: 'Delhi',
      partyStateCode: '07',
      placeOfSupplyStateCode: '07',
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
      amountInWords: 'Five Thousand',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 5000,
      balanceAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // First save: CREATE
    db.saveInvoice(invoice);
    await auditTrail.waitForIdle();

    // Second save: UPDATE
    const updatedInvoice: Invoice = {
      ...invoice,
      grandTotal: 6500,
      totalGrossAmount: 6500,
    };
    db.saveInvoice(updatedInvoice);
    await auditTrail.waitForIdle();

    const trail = await auditTrail.getAuditTrailForDocument(invoiceId);
    expect(trail.length).toBe(2);
    expect(trail[0].actionType).toBe('INVOICE_CREATE');
    expect(trail[1].actionType).toBe('INVOICE_UPDATE');
    expect(trail[1].previousSnapshot?.grandTotal).toBe(5000);
    expect(trail[1].newSnapshot?.grandTotal).toBe(6500);
  });

  it('TC-34: hooks db.saveInvoice for cancellation emitting INVOICE_CANCEL', async () => {
    const invoiceId = `INV_CANCEL_${Date.now()}`;
    const invoice: Invoice = {
      id: invoiceId,
      invoiceNumber: `INV-CAN-${Date.now()}`,
      invoiceType: 'B2B',
      date: '2026-10-09',
      partyName: 'Gamma Industries',
      partyAddress: 'Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
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
      amountInWords: 'Two Thousand',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 2000,
      balanceAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveInvoice(invoice);
    await auditTrail.waitForIdle();

    const cancelledInvoice: Invoice = {
      ...invoice,
      isCancelled: true,
    };
    db.saveInvoice(cancelledInvoice);
    await auditTrail.waitForIdle();

    const trail = await auditTrail.getAuditTrailForDocument(invoiceId);
    expect(trail.length).toBe(2);
    expect(trail[1].actionType).toBe('INVOICE_CANCEL');
    expect(trail[1].summary).toContain('Cancelled invoice');
  });

  it('TC-35: hooks db.deleteInvoice emitting INVOICE_DELETE with deleted invoice snapshot', async () => {
    const invoiceId = `INV_DEL_${Date.now()}`;
    const invoice: Invoice = {
      id: invoiceId,
      invoiceNumber: `INV-DEL-${Date.now()}`,
      invoiceType: 'B2B',
      date: '2026-10-09',
      partyName: 'Delta Systems',
      partyAddress: 'Bangalore',
      partyStateCode: '29',
      placeOfSupplyStateCode: '29',
      isIntraState: true,
      items: [],
      totalGrossAmount: 1200,
      totalDiscount: 0,
      totalTaxableAmount: 1200,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 1200,
      amountInWords: 'Twelve Hundred',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 1200,
      balanceAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveInvoice(invoice);
    await auditTrail.waitForIdle();

    db.deleteInvoice(invoiceId);
    await auditTrail.waitForIdle();

    const trail = await auditTrail.getAuditTrailForDocument(invoiceId);
    expect(trail.length).toBe(2);
    expect(trail[1].actionType).toBe('INVOICE_DELETE');
    expect(trail[1].previousSnapshot?.invoiceNumber).toBe(invoice.invoiceNumber);
    expect(trail[1].newSnapshot).toBeUndefined();
  });

function createTestPurchaseBill(id: string, billNumber: string, supplierName: string): PurchaseBill {
  return {
    id,
    billNumber,
    date: '2026-10-09',
    dueDate: '2026-10-30',
    supplierId: 'sup_1',
    supplierName,
    supplierGstin: '07AAAAA0000A1Z5',
    supplierAddress: '123 Market Road, Delhi',
    supplierStateCode: '07',
    placeOfSupplyStateCode: '07',
    isIntraState: true,
    items: [],
    itcEligibility: 'ALL_OTHER_ITC',
    isRcm: false,
    totalGrossAmount: 50000,
    totalDiscount: 0,
    totalTaxableAmount: 50000,
    totalCgst: 4500,
    totalSgst: 4500,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 9000,
    roundOff: 0,
    grandTotal: 59000,
    paymentMode: 'NET_BANKING',
    paymentStatus: 'PAID',
    paidAmount: 59000,
    balanceAmount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

  it('TC-36: hooks db.savePurchase and db.deletePurchase emitting PURCHASE_CREATE and PURCHASE_DELETE', async () => {
    const billId = `PURCH_${Date.now()}`;
    const bill = createTestPurchaseBill(billId, `BILL-${Date.now()}`, 'National Suppliers');

    db.savePurchase(bill);
    await auditTrail.waitForIdle();

    let trail = await auditTrail.getAuditTrailForDocument(billId);
    expect(trail.length).toBe(1);
    expect(trail[0].actionType).toBe('PURCHASE_CREATE');
    expect(trail[0].documentType).toBe('PURCHASE');

    db.deletePurchase(billId);
    await auditTrail.waitForIdle();

    trail = await auditTrail.getAuditTrailForDocument(billId);
    expect(trail.length).toBe(2);
    expect(trail[1].actionType).toBe('PURCHASE_DELETE');
    expect(trail[1].previousSnapshot?.billNumber).toBe(bill.billNumber);
  });

  it('TC-37: hooks db.saveStockAdjustment emitting STOCK_ADJUSTMENT with previous and delta stock', async () => {
    const adjId = `ADJ_${Date.now()}`;
    const adj: StockAdjustment = {
      id: adjId,
      itemId: 'ITM-99',
      itemName: 'Thermal Receipt Rolls',
      type: 'STOCK_IN',
      quantity: 50,
      date: '2026-10-09',
      reason: 'Purchased extra stock from local distributor',
      createdAt: new Date().toISOString(),
    };

    db.saveStockAdjustment(adj);
    await auditTrail.waitForIdle();

    const trail = await auditTrail.getAuditTrailForDocument(adjId);
    expect(trail.length).toBe(1);
    expect(trail[0].actionType).toBe('STOCK_ADJUSTMENT');
    expect(trail[0].documentType).toBe('ITEM');
    expect(trail[0].summary).toContain('Thermal Receipt Rolls');
    expect(trail[0].newSnapshot?.resultingStock).toBeDefined();
  });

  it('TC-38: hooks db.saveVoucher and db.deleteVoucher emitting PAYMENT_RECORD and VOUCHER_DELETE', async () => {
    const vchId = `VCH_${Date.now()}`;
    const voucher: Voucher = {
      id: vchId,
      voucherNumber: `VCH-${Date.now()}`,
      voucherType: 'RECEIPT',
      date: '2026-10-09',
      narration: 'Receipt from customer against sales invoice',
      entries: [],
      totalAmount: 15000,
      createdAt: new Date().toISOString(),
    };

    db.saveVoucher(voucher);
    await auditTrail.waitForIdle();

    let trail = await auditTrail.getAuditTrailForDocument(vchId);
    expect(trail.length).toBe(1);
    expect(trail[0].actionType).toBe('PAYMENT_RECORD');
    expect(trail[0].documentType).toBe('PAYMENT');

    db.deleteVoucher(vchId);
    await auditTrail.waitForIdle();

    trail = await auditTrail.getAuditTrailForDocument(vchId);
    expect(trail.length).toBe(2);
    expect(trail[1].actionType).toBe('VOUCHER_DELETE');
    expect(trail[1].documentType).toBe('PAYMENT');
  });

  it('TC-39: hooks db.saveCompany emitting SETTINGS_UPDATE capturing previous and new company profiles', async () => {
    const company: CompanyProfile = {
      id: 'COMP-TEST',
      businessName: 'Modern Traders India Ltd',
      gstin: '07AAAAA1234A1Z5',
      pan: 'AAAAA1234A',
      stateCode: '07',
      address: 'Barakhamba Road, New Delhi',
      pincode: '110001',
      phone: '9876543210',
      email: 'info@moderntraders.in',
    };

    db.saveCompany(company);
    await auditTrail.waitForIdle();

    const trail = await auditTrail.getAuditTrailForDocument('COMP-TEST');
    expect(trail.length).toBe(1);
    expect(trail[0].actionType).toBe('SETTINGS_UPDATE');
    expect(trail[0].documentType).toBe('SETTINGS');
    expect(trail[0].newSnapshot?.businessName).toBe('Modern Traders India Ltd');
    expect(trail[0].summary).toContain('Modern Traders India Ltd');
  });

  it('TC-40: maintains unbroken chain integrity throughout full lifecycle of mixed DB mutations', async () => {
    // 1. Company profile update
    db.saveCompany({
      id: 'COMP-LIFECYCLE',
      businessName: 'Omni Retail Ltd',
      gstin: '07BBBBB1234B1Z5',
      pan: 'BBBBB1234B',
      stateCode: '07',
      address: 'Nehru Place, Delhi',
      pincode: '110019',
      phone: '9123456789',
      email: 'contact@omniretail.com',
    });

    // 2. Invoice created
    const invId = `INV_LC_${Date.now()}`;
    db.saveInvoice({
      id: invId,
      invoiceNumber: `INV-LC-${Date.now()}`,
      invoiceType: 'B2B',
      date: '2026-10-09',
      partyName: 'Customer X',
      partyAddress: 'Delhi',
      partyStateCode: '07',
      placeOfSupplyStateCode: '07',
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
      amountInWords: 'One Thousand',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 1000,
      balanceAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 3. Purchase created
    const purchId = `PURCH_LC_${Date.now()}`;
    db.savePurchase(createTestPurchaseBill(purchId, `BILL-LC-${Date.now()}`, 'Supplier Y'));

    // 4. Stock adjustment
    db.saveStockAdjustment({
      id: `ADJ_LC_${Date.now()}`,
      itemId: 'ITM-1',
      itemName: 'Item 1',
      type: 'STOCK_IN',
      quantity: 10,
      date: '2026-10-09',
      reason: 'Restock',
      createdAt: new Date().toISOString(),
    });

    // 5. Invoice deleted
    db.deleteInvoice(invId);

    await auditTrail.waitForIdle();

    const verification = await auditTrail.verifyChainIntegrity();
    expect(verification.valid).toBe(true);
    expect(verification.totalRecords).toBe(5);
  });
});
