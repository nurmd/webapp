import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Test in-memory storage
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
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: testStorage, writable: true, configurable: true });
}

const { inMemoryDocs } = vi.hoisted(() => {
  return { inMemoryDocs: new Map<string, any>() };
});

vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(async (type: string, doc: any) => {
      inMemoryDocs.set(`${type}:${doc.id}`, { ...doc, docType: type });
      return { ok: true };
    }),
    deleteDoc: vi.fn(async (type: string, id: string) => {
      inMemoryDocs.delete(`${type}:${id}`);
      return { ok: true };
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
}));

import {
  auditTrail,
  AuditRecord,
  GENESIS_PREVIOUS_HASH,
  CURRENT_AUDIT_EPOCH,
  LEGACY_AUDIT_EPOCH,
  computeRecordHash,
} from '../services/auditTrail.ts';
import { AuditLogView } from '../components/Audit/AuditLogView.tsx';

describe('Audit Epoch / Legacy Archive Specification', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(async () => {
    testStorage.clear();
    inMemoryDocs.clear();
    await auditTrail._resetForTesting();
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      container.remove();
      container = null;
      root = null;
    }
  });

  // Helper to create a valid legacy record with genuine SHA-256 hash
  async function createMockLegacyRecord(
    seq: number,
    prevHash: string,
    id = `audit_legacy_${seq}`
  ): Promise<AuditRecord> {
    const raw = {
      previousHash: prevHash,
      sequence: seq,
      timestamp: '2026-01-01T10:00:00.000Z',
      userId: 'usr_legacy',
      userName: 'Legacy Admin',
      userRole: 'OWNER' as const,
      actionType: 'INVOICE_CREATE' as const,
      documentId: `INV-LEGACY-${seq}`,
      documentType: 'INVOICE' as const,
      summary: `Legacy transaction ${seq}`,
    };
    const recordHash = await computeRecordHash(raw);
    return {
      id,
      ...raw,
      recordHash,
      // intentionally NO epoch field to simulate existing legacy records
    };
  }

  it('1. Legacy records are not mutated by loading or verification', async () => {
    const rec1 = await createMockLegacyRecord(1, GENESIS_PREVIOUS_HASH);
    const rec2 = await createMockLegacyRecord(2, rec1.recordHash);
    const originalJson1 = JSON.stringify(rec1);
    const originalJson2 = JSON.stringify(rec2);

    auditTrail._setRecordsForTesting([rec1, rec2]);

    // Loading & reading trail
    const retrieved = await auditTrail.getAuditTrail();
    expect(retrieved.length).toBe(2);
    expect(retrieved[0].epoch).toBeUndefined();
    expect(retrieved[1].epoch).toBeUndefined();

    // Verifications
    await auditTrail.verifyCurrentEpoch();
    await auditTrail.verifyLegacyChain();
    await auditTrail.verifyChainIntegrity();

    // Re-check stored copies in memory
    const recordsAfterVerify = auditTrail.getRecordsSync();
    expect(JSON.stringify(recordsAfterVerify[0])).toBe(originalJson1);
    expect(JSON.stringify(recordsAfterVerify[1])).toBe(originalJson2);
    expect(recordsAfterVerify[0].epoch).toBeUndefined();
    expect(recordsAfterVerify[1].epoch).toBeUndefined();
  });

  it('2. A new audit record gets epoch = 2, sequence = 1, genesis previousHash', async () => {
    // Seed 5 legacy records
    const rec1 = await createMockLegacyRecord(1, GENESIS_PREVIOUS_HASH);
    const rec2 = await createMockLegacyRecord(2, rec1.recordHash);
    auditTrail._setRecordsForTesting([rec1, rec2]);

    // First new record after boundary
    const newRecord = await auditTrail.logEvent({
      userId: 'usr_new',
      userName: 'Modern Auditor',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-NEW-01',
      documentType: 'INVOICE',
      summary: 'First new sale in epoch 2',
    });

    expect(newRecord.epoch).toBe(CURRENT_AUDIT_EPOCH);
    expect(newRecord.epoch).toBe(2);
    expect(newRecord.sequence).toBe(1);
    expect(newRecord.previousHash).toBe(GENESIS_PREVIOUS_HASH);
  });

  it('3. A second new audit record gets sequence = 2 and the first record’s hash', async () => {
    // Seed legacy records
    const rec1 = await createMockLegacyRecord(1, GENESIS_PREVIOUS_HASH);
    auditTrail._setRecordsForTesting([rec1]);

    const newRecord1 = await auditTrail.logEvent({
      userId: 'usr_new',
      userName: 'Modern Auditor',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-NEW-01',
      documentType: 'INVOICE',
      summary: 'First record in epoch 2',
    });

    const newRecord2 = await auditTrail.logEvent({
      userId: 'usr_new',
      userName: 'Modern Auditor',
      userRole: 'OWNER',
      actionType: 'PAYMENT_RECORD',
      documentId: 'PMT-NEW-01',
      documentType: 'PAYMENT',
      summary: 'Second record in epoch 2',
    });

    expect(newRecord2.epoch).toBe(2);
    expect(newRecord2.sequence).toBe(2);
    expect(newRecord2.previousHash).toBe(newRecord1.recordHash);
  });

  it('4. verifyCurrentEpoch() passes with a broken legacy chain present', async () => {
    // Construct a broken legacy chain (missing sequence 2, sequence gap)
    const legacy1 = await createMockLegacyRecord(1, GENESIS_PREVIOUS_HASH);
    const legacy3 = await createMockLegacyRecord(3, 'broken_deadbeef'.repeat(4)); // sequence break & invalid previousHash
    auditTrail._setRecordsForTesting([legacy1, legacy3]);

    // Create 2 valid current epoch records
    await auditTrail.logEvent({
      userId: 'usr_new',
      userName: 'Modern Auditor',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-EPOCH2-1',
      documentType: 'INVOICE',
      summary: 'Valid epoch 2 record 1',
    });
    await auditTrail.logEvent({
      userId: 'usr_new',
      userName: 'Modern Auditor',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-EPOCH2-2',
      documentType: 'INVOICE',
      summary: 'Valid epoch 2 record 2',
    });

    // verifyCurrentEpoch must verify ONLY epoch 2 and pass
    const currentEpochResult = await auditTrail.verifyCurrentEpoch();
    expect(currentEpochResult.valid).toBe(true);
    expect(currentEpochResult.totalRecords).toBe(2);
    expect(currentEpochResult.corruptedRecordId).toBeUndefined();
  });

  it('5. Legacy verification still reports the known structural failure without changing records', async () => {
    // Construct a broken legacy chain (sequence gap from 1 to 3)
    const legacy1 = await createMockLegacyRecord(1, GENESIS_PREVIOUS_HASH);
    const legacy3 = await createMockLegacyRecord(3, legacy1.recordHash);
    const snapshot1 = JSON.stringify(legacy1);
    const snapshot3 = JSON.stringify(legacy3);

    auditTrail._setRecordsForTesting([legacy1, legacy3]);

    // Diagnostic verification of legacy chain reports the break
    const legacyResult = await auditTrail.verifyLegacyChain();
    expect(legacyResult.valid).toBe(false);
    expect(legacyResult.brokenSequence).toBe(3);
    expect(legacyResult.reason).toContain('Sequence break');

    // Records are completely untouched
    const syncRecords = auditTrail.getRecordsSync();
    expect(JSON.stringify(syncRecords[0])).toBe(snapshot1);
    expect(JSON.stringify(syncRecords[1])).toBe(snapshot3);
  });

  it('6. UI defaults to Current epoch; Legacy filter shows the old records with Legacy badges', async () => {
    // Seed 1 legacy record and 1 current epoch record
    const legacy1 = await createMockLegacyRecord(1, GENESIS_PREVIOUS_HASH);
    auditTrail._setRecordsForTesting([legacy1]);

    await auditTrail.logEvent({
      userId: 'usr_new',
      userName: 'Current User',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-CUR-01',
      documentType: 'INVOICE',
      summary: 'Current epoch bill',
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<AuditLogView />);
    });

    // Default view is Current Epoch
    expect(container.textContent).toContain('Current Epoch');
    expect(container.textContent).toContain('INV-CUR-01');
    expect(container.textContent).not.toContain('INV-LEGACY-1');

    const currentBadges = container.querySelectorAll('[data-testid="badge-current"]');
    expect(currentBadges.length).toBe(1);

    // Switch scope to Legacy
    const legacyScopeBtn = container.querySelector('[data-testid="scope-legacy"]') as HTMLButtonElement;
    expect(legacyScopeBtn).not.toBeNull();

    await act(async () => {
      legacyScopeBtn.click();
    });

    // Legacy table displays the legacy record with Legacy badge
    expect(container.textContent).toContain('INV-LEGACY-1');
    expect(container.textContent).not.toContain('INV-CUR-01');

    const legacyBadges = container.querySelectorAll('[data-testid="badge-legacy"]');
    expect(legacyBadges.length).toBe(1);
    expect(legacyBadges[0].textContent?.trim()).toBe('Legacy');
  });

  it('7. Current epoch empty state is clear before the first new audit write', async () => {
    // Seed only legacy records, 0 current epoch records
    const legacy1 = await createMockLegacyRecord(1, GENESIS_PREVIOUS_HASH);
    const legacy2 = await createMockLegacyRecord(2, legacy1.recordHash);
    auditTrail._setRecordsForTesting([legacy1, legacy2]);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<AuditLogView />);
    });

    // Top card shows Current epoch: Healthy and Legacy archive note
    const healthBadge = container.querySelector('[data-testid="current-epoch-badge"]');
    expect(healthBadge?.textContent).toContain('Current epoch: Healthy');

    const legacyNotice = container.querySelector('[data-testid="legacy-archive-badge"]');
    expect(legacyNotice?.textContent).toContain('Legacy archive: 2 records preserved');

    // No red tampering banner shown
    expect(container.textContent).not.toContain('Cryptographic Integrity Violation');

    // Clear empty state message for current epoch
    expect(container.textContent).toContain('No current epoch audit records yet');
    expect(container.textContent).toContain('sequence #0001');
  });

  it('8. Export includes epoch/legacy information', async () => {
    const legacy = await createMockLegacyRecord(1, GENESIS_PREVIOUS_HASH);
    auditTrail._setRecordsForTesting([legacy]);

    await auditTrail.logEvent({
      userId: 'usr_new',
      userName: 'Current User',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-NEW-EXPORT',
      documentType: 'INVOICE',
      summary: 'Epoch 2 export item',
    });

    // CSV export includes Epoch and Status columns
    const csv = await auditTrail.exportAuditTrailAsCsv();
    expect(csv).toContain('Epoch,Status,Sequence,Timestamp');
    expect(csv).toContain('1,Legacy,1,');
    expect(csv).toContain('2,Current,1,');

    // JSON export includes epoch and epochStatus
    const jsonStr = await auditTrail.exportAuditTrailAsJson();
    const parsed = JSON.parse(jsonStr);
    expect(parsed.length).toBe(2);

    const legacyExport = parsed.find((p: any) => p.documentId === 'INV-LEGACY-1');
    expect(legacyExport.epoch).toBe(1);
    expect(legacyExport.epochStatus).toBe('Legacy');

    const currentExport = parsed.find((p: any) => p.documentId === 'INV-NEW-EXPORT');
    expect(currentExport.epoch).toBe(2);
    expect(currentExport.epochStatus).toBe('Current');
  });

  it('9. New epoch-2 record persists through reloadFromStorage and still verifies from genesis', async () => {
    // 1. Seed legacy records directly into PouchDB storage
    const legacy1 = await createMockLegacyRecord(1, GENESIS_PREVIOUS_HASH);
    const legacy2 = await createMockLegacyRecord(2, legacy1.recordHash);
    inMemoryDocs.set(`audit_log:${legacy1.id}`, { ...legacy1, docType: 'audit_log' });
    inMemoryDocs.set(`audit_log:${legacy2.id}`, { ...legacy2, docType: 'audit_log' });

    // Load initial storage into auditTrail service
    await auditTrail.reloadFromStorage();
    const initialRecords = await auditTrail.getAuditTrail();
    expect(initialRecords.length).toBe(2);
    expect(initialRecords[0].epoch).toBeUndefined();
    expect(initialRecords[1].epoch).toBeUndefined();

    // 2. Write a new epoch-2 audit event (persisted automatically to PouchDB)
    const newRecord = await auditTrail.logEvent({
      userId: 'usr_owner',
      userName: 'Alice Store Manager',
      userRole: 'OWNER',
      actionType: 'INVOICE_CREATE',
      documentId: 'INV-PERSIST-101',
      documentType: 'INVOICE',
      summary: 'New sale recorded after epoch boundary',
    });

    expect(newRecord.epoch).toBe(2);
    expect(newRecord.sequence).toBe(1);
    expect(newRecord.previousHash).toBe(GENESIS_PREVIOUS_HASH);

    // 3. Simulate process/session reload by reloading from storage
    await auditTrail.reloadFromStorage();

    // 4. Assert records loaded from storage preserve epoch, sequence, and genesis anchor
    const reloadedRecords = await auditTrail.getAuditTrail();
    expect(reloadedRecords.length).toBe(3);

    // Legacy records remain legacy
    const reloadedLegacy = reloadedRecords.filter((r) => (r.epoch ?? LEGACY_AUDIT_EPOCH) === LEGACY_AUDIT_EPOCH);
    expect(reloadedLegacy.length).toBe(2);
    expect(reloadedLegacy[0].epoch).toBeUndefined();
    expect(reloadedLegacy[1].epoch).toBeUndefined();

    // Current epoch record was persisted and restored with epoch: 2 and sequence: 1
    const reloadedEpoch2 = reloadedRecords.find((r) => r.id === newRecord.id);
    expect(reloadedEpoch2).toBeDefined();
    expect(reloadedEpoch2?.epoch).toBe(2);
    expect(reloadedEpoch2?.sequence).toBe(1);
    expect(reloadedEpoch2?.previousHash).toBe(GENESIS_PREVIOUS_HASH);
    expect(reloadedEpoch2?.recordHash).toBe(newRecord.recordHash);

    // 5. Cryptographically verify current epoch from genesis after reload
    const verifyResult = await auditTrail.verifyCurrentEpoch();
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.totalRecords).toBe(1);
    expect(verifyResult.corruptedRecordId).toBeUndefined();
  });
});
