import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
} from '../services/auditTrail.ts';
import { AuditLogView } from '../components/Audit/AuditLogView.tsx';

function generateMockAuditRecords(count: number): AuditRecord[] {
  const records: AuditRecord[] = [];
  for (let i = 1; i <= count; i++) {
    const isEven = i % 2 === 0;
    const action = i % 3 === 0 ? 'INVOICE_CREATE' : (i % 3 === 1 ? 'PAYMENT_RECORD' : 'ITEM_CREATE');
    const docType = i % 3 === 0 ? 'INVOICE' : (i % 3 === 1 ? 'PAYMENT' : 'ITEM');
    const dayStr = String((i % 28) + 1).padStart(2, '0');

    records.push({
      id: `audit_rec_${String(i).padStart(4, '0')}`,
      sequence: i,
      epoch: CURRENT_AUDIT_EPOCH,
      timestamp: `2026-03-${dayStr}T10:00:00.000Z`,
      userId: isEven ? 'usr_alice' : 'usr_bob',
      userName: isEven ? 'Alice Manager' : 'Bob Staff',
      userRole: isEven ? 'OWNER' : 'CASHIER',
      actionType: action,
      documentId: `DOC-${String(i).padStart(4, '0')}`,
      documentType: docType,
      summary: `Automated audit record #${i} for document DOC-${i}`,
      previousHash: GENESIS_PREVIOUS_HASH,
      recordHash: `hash_${i}`.padEnd(64, '0'),
    });
  }
  return records;
}

describe('Audit Trail Pagination Specification', () => {
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

  it('1. returns full filtered count via getAuditTrailCount and full array when limit/offset omitted', async () => {
    const records = generateMockAuditRecords(125);
    auditTrail._setRecordsForTesting(records);

    const count = await auditTrail.getAuditTrailCount();
    expect(count).toBe(125);

    const allRecords = await auditTrail.getAuditTrail();
    expect(allRecords).toHaveLength(125);
    expect(allRecords[0].sequence).toBe(1);
    expect(allRecords[124].sequence).toBe(125);
  });

  it('2. page 1 and page 2 return non-overlapping slices', async () => {
    const records = generateMockAuditRecords(125);
    auditTrail._setRecordsForTesting(records);

    const page1 = await auditTrail.getAuditTrail({ limit: 50, offset: 0 });
    const page2 = await auditTrail.getAuditTrail({ limit: 50, offset: 50 });

    expect(page1).toHaveLength(50);
    expect(page2).toHaveLength(50);

    const page1Ids = new Set(page1.map((r) => r.id));
    const page2Ids = new Set(page2.map((r) => r.id));

    // Intersection must be completely empty
    for (const id of page1Ids) {
      expect(page2Ids.has(id)).toBe(false);
    }

    expect(page1[0].sequence).toBe(1);
    expect(page1[49].sequence).toBe(50);
    expect(page2[0].sequence).toBe(51);
    expect(page2[49].sequence).toBe(100);
  });

  it('3. last page has the remainder and page beyond end is empty', async () => {
    const records = generateMockAuditRecords(125);
    auditTrail._setRecordsForTesting(records);

    // Page 3 has remainder 25 (125 - 100)
    const page3 = await auditTrail.getAuditTrail({ limit: 50, offset: 100 });
    expect(page3).toHaveLength(25);
    expect(page3[0].sequence).toBe(101);
    expect(page3[24].sequence).toBe(125);

    // Page 4 is beyond end
    const page4 = await auditTrail.getAuditTrail({ limit: 50, offset: 150 });
    expect(page4).toHaveLength(0);
  });

  it('4. filters plus pagination compose correctly with count and slicing', async () => {
    const records = generateMockAuditRecords(125);
    auditTrail._setRecordsForTesting(records);

    // Filter by Alice (usr_alice: 62 even sequences)
    const aliceTotal = await auditTrail.getAuditTrailCount({ userId: 'usr_alice' });
    expect(aliceTotal).toBe(62);

    const alicePage1 = await auditTrail.getAuditTrail({
      userId: 'usr_alice',
      limit: 50,
      offset: 0,
    });
    const alicePage2 = await auditTrail.getAuditTrail({
      userId: 'usr_alice',
      limit: 50,
      offset: 50,
    });

    expect(alicePage1).toHaveLength(50);
    expect(alicePage2).toHaveLength(12); // Remainder: 62 - 50 = 12
    alicePage1.forEach((r) => expect(r.userId).toBe('usr_alice'));
    alicePage2.forEach((r) => expect(r.userId).toBe('usr_alice'));

    const page1Ids = new Set(alicePage1.map((r) => r.id));
    alicePage2.forEach((r) => expect(page1Ids.has(r.id)).toBe(false));

    // Descending sort with pagination
    const descPage1 = await auditTrail.getAuditTrail({
      sortDirection: 'desc',
      limit: 50,
      offset: 0,
    });
    expect(descPage1).toHaveLength(50);
    expect(descPage1[0].sequence).toBe(125);
    expect(descPage1[49].sequence).toBe(76);

    const descPage2 = await auditTrail.getAuditTrail({
      sortDirection: 'desc',
      limit: 50,
      offset: 50,
    });
    expect(descPage2).toHaveLength(50);
    expect(descPage2[0].sequence).toBe(75);
    expect(descPage2[49].sequence).toBe(26);

    const descPage3 = await auditTrail.getAuditTrail({
      sortDirection: 'desc',
      limit: 50,
      offset: 100,
    });
    expect(descPage3).toHaveLength(25);
    expect(descPage3[0].sequence).toBe(25);
    expect(descPage3[24].sequence).toBe(1);
  });

  it('5. AuditLogView UI renders pagination controls with Prev/Next, page X of Y, total record count, and resets page on filter change', async () => {
    const records = generateMockAuditRecords(125);
    auditTrail._setRecordsForTesting(records);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(React.createElement(AuditLogView));
    });

    // Page 1 of 3, Total: 125 records
    expect(container.textContent).toContain('Page 1 of 3');
    expect(container.textContent).toContain('Total: 125 records');

    const getPrevBtn = () => container!.querySelector('[data-testid="pagination-prev"]') as HTMLButtonElement;
    const getNextBtn = () => container!.querySelector('[data-testid="pagination-next"]') as HTMLButtonElement;

    expect(getPrevBtn()).not.toBeNull();
    expect(getNextBtn()).not.toBeNull();

    // Prev disabled on page 0, Next enabled
    expect(getPrevBtn().disabled).toBe(true);
    expect(getNextBtn().disabled).toBe(false);

    // Click Next -> Page 2 of 3
    await act(async () => {
      getNextBtn().click();
    });

    expect(container.textContent).toContain('Page 2 of 3');
    expect(getPrevBtn().disabled).toBe(false);
    expect(getNextBtn().disabled).toBe(false);

    // Click Next -> Page 3 of 3 (last page)
    await act(async () => {
      getNextBtn().click();
    });

    expect(container.textContent).toContain('Page 3 of 3');
    expect(getPrevBtn().disabled).toBe(false);
    expect(getNextBtn().disabled).toBe(true); // Next disabled on last page

    // Prev click -> Back to Page 2 of 3
    await act(async () => {
      getPrevBtn().click();
    });

    expect(container.textContent).toContain('Page 2 of 3');

    // Filter change resets page to 0 (Page 1)
    const searchInput = container.querySelector('input[placeholder*="Search by doc ID"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(searchInput, 'DOC-001');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Page 1 of');
    expect(getPrevBtn().disabled).toBe(true);
  });
});
