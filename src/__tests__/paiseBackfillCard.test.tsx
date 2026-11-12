import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

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

// @ts-expect-error React 18 testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../services/db/preMigrationBackup.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/db/preMigrationBackup.ts')>();
  return {
    ...actual,
    createAndVerifyPreMigrationBackup: vi.fn((migrationId: string) =>
      actual.createAndVerifyPreMigrationBackup(migrationId)
    ),
  };
});

import { db } from '../services/db.ts';
import { STORAGE_KEYS } from '../services/db/storageEngine.ts';
import { createAndVerifyPreMigrationBackup } from '../services/db/preMigrationBackup.ts';
import { hasCurrentPaiseSchema } from '../core/accounting/paisePersistence.ts';
import PaiseBackfillCard from '../components/Settings/PaiseBackfillCard.tsx';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(ui: React.ReactElement): { container: HTMLDivElement } {
  if (root && container) {
    act(() => {
      root!.unmount();
    });
    container.remove();
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(ui);
  });
  return { container };
}

const screen = {
  getByTestId(id: string): HTMLElement {
    const el = container?.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    if (!el) {
      throw new Error(`Element with data-testid="${id}" not found`);
    }
    return el;
  },
  queryByTestId(id: string): HTMLElement | null {
    return (container?.querySelector(`[data-testid="${id}"]`) as HTMLElement | null) ?? null;
  },
};

const fireEvent = {
  click(element: Element): void {
    act(() => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  },
};

const sampleInvoice1 = {
  id: 'INV-TEST-001',
  invoiceNumber: 'INV-2026-001',
  date: '2026-11-12',
  dueDate: '2026-11-20',
  partyId: 'PTY-001',
  partyName: 'Alpha Traders',
  type: 'B2B',
  status: 'ISSUED',
  paymentStatus: 'UNPAID',
  paymentMode: 'CREDIT',
  totalGrossAmount: 1000,
  totalDiscount: 50,
  totalTaxableAmount: 950,
  totalCgst: 85.5,
  totalSgst: 85.5,
  totalUtgst: 0,
  totalIgst: 0,
  totalCess: 0,
  totalTax: 171,
  roundOff: 0,
  shippingAmount: 50,
  grandTotal: 1171,
  paidAmount: 0,
  balanceAmount: 1171,
  items: [
    {
      itemId: 'ITEM-1',
      name: 'Widget',
      quantity: 10,
      unit: 'PCS',
      unitPrice: 100,
      discountAmount: 50,
      taxableAmount: 950,
      gstRate: 18,
      cgstAmount: 85.5,
      sgstAmount: 85.5,
      utgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 1121,
    },
  ],
  paymentSplits: [],
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const sampleInvoice2 = {
  ...sampleInvoice1,
  id: 'INV-TEST-002',
  invoiceNumber: 'INV-2026-002',
};

const sampleParty = {
  id: 'PTY-001',
  name: 'Alpha Traders',
  type: 'CUSTOMER',
  phone: '9876543210',
  currentBalance: 1171,
  openingBalance: 0,
  openingBalanceType: 'TO_RECEIVE',
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

function seedData(): void {
  db.clearMemoryCache();
  testStorage.clear();
  db.set(STORAGE_KEYS.INVOICES, [{ ...sampleInvoice1 }, { ...sampleInvoice2 }]);
  db.set(STORAGE_KEYS.PARTIES, [{ ...sampleParty }]);
}

describe('PaiseBackfillCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(
      db as unknown as { shouldSeedDefaultBankAccounts: () => boolean },
      'shouldSeedDefaultBankAccounts'
    ).mockReturnValue(false);
    seedData();
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
  });

  it('1. Initial render shows both buttons and "Run backfill" is disabled', () => {
    render(<PaiseBackfillCard />);

    const checkBtn = screen.getByTestId('paise-backfill-check') as HTMLButtonElement;
    const runBtn = screen.getByTestId('paise-backfill-run') as HTMLButtonElement;

    expect(checkBtn).toBeTruthy();
    expect(checkBtn.disabled).toBe(false);
    expect(runBtn).toBeTruthy();
    expect(runBtn.disabled).toBe(true);

    expect(screen.queryByTestId('paise-backfill-plan')).toBeNull();
    expect(screen.queryByTestId('paise-backfill-status')).toBeNull();
  });

  it('2. Clicking "Check plan" shows the plan panel with the seeded pending count (seed 2 invoices + 1 party -> pending 3) and enables "Run backfill"', () => {
    render(<PaiseBackfillCard />);

    const checkBtn = screen.getByTestId('paise-backfill-check');
    fireEvent.click(checkBtn);

    const planPanel = screen.getByTestId('paise-backfill-plan');
    expect(planPanel).toBeTruthy();
    expect(planPanel.textContent).toContain('Pending: 3');

    const runBtn = screen.getByTestId('paise-backfill-run') as HTMLButtonElement;
    expect(runBtn.disabled).toBe(false);
  });

  it('3. Clicking "Run backfill" shows confirm + cancel and does NOT migrate; cancel restores the single button and leaves docs unmigrated', () => {
    render(<PaiseBackfillCard />);

    fireEvent.click(screen.getByTestId('paise-backfill-check'));
    fireEvent.click(screen.getByTestId('paise-backfill-run'));

    expect(screen.queryByTestId('paise-backfill-run')).toBeNull();
    expect(screen.getByTestId('paise-backfill-confirm')).toBeTruthy();
    expect(screen.getByTestId('paise-backfill-cancel')).toBeTruthy();

    // Documents must remain unmigrated before confirmation
    const invoicesBefore = db.getInvoices();
    expect(hasCurrentPaiseSchema(invoicesBefore[0])).toBe(false);
    expect(hasCurrentPaiseSchema(invoicesBefore[1])).toBe(false);
    const partiesBefore = db.getParties();
    expect(hasCurrentPaiseSchema(partiesBefore[0])).toBe(false);

    // Cancel restores the run button
    fireEvent.click(screen.getByTestId('paise-backfill-cancel'));
    expect(screen.queryByTestId('paise-backfill-confirm')).toBeNull();
    expect(screen.queryByTestId('paise-backfill-cancel')).toBeNull();
    expect(screen.getByTestId('paise-backfill-run')).toBeTruthy();

    // Verify docs remain unmigrated after cancel
    const invoicesAfter = db.getInvoices();
    expect(hasCurrentPaiseSchema(invoicesAfter[0])).toBe(false);
  });

  it('4. Confirm path migrates: report counts show "Migrated 3", the plan refreshes to pending 0, and "Run backfill" becomes disabled again', () => {
    render(<PaiseBackfillCard />);

    fireEvent.click(screen.getByTestId('paise-backfill-check'));
    fireEvent.click(screen.getByTestId('paise-backfill-run'));
    fireEvent.click(screen.getByTestId('paise-backfill-confirm'));

    const statusPanel = screen.getByTestId('paise-backfill-status');
    expect(statusPanel).toBeTruthy();

    const countsEl = screen.getByTestId('paise-backfill-report-counts');
    expect(countsEl.textContent).toContain('Migrated 3');

    const planPanel = screen.getByTestId('paise-backfill-plan');
    expect(planPanel.textContent).toContain('Pending: 0');
    expect(planPanel.textContent).toContain('Plan: nothing to do');

    const runBtn = screen.getByTestId('paise-backfill-run') as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);

    const invoices = db.getInvoices();
    expect(hasCurrentPaiseSchema(invoices[0])).toBe(true);
    expect(hasCurrentPaiseSchema(invoices[1])).toBe(true);
    const parties = db.getParties();
    expect(hasCurrentPaiseSchema(parties[0])).toBe(true);
  });

  it('5. Backup failure: mock createAndVerifyPreMigrationBackup to throw, confirm, assert the report shows a BACKUP_FAILED message and the seeded docs still have no paiseSchema', () => {
    vi.mocked(createAndVerifyPreMigrationBackup).mockImplementationOnce(() => {
      throw new Error('Simulated pre-migration backup failure');
    });

    render(<PaiseBackfillCard />);

    fireEvent.click(screen.getByTestId('paise-backfill-check'));
    fireEvent.click(screen.getByTestId('paise-backfill-run'));
    fireEvent.click(screen.getByTestId('paise-backfill-confirm'));

    const statusPanel = screen.getByTestId('paise-backfill-status');
    expect(statusPanel).toBeTruthy();
    expect(statusPanel.textContent).toContain('BACKUP_FAILED: Simulated pre-migration backup failure');

    const invoices = db.getInvoices();
    expect(hasCurrentPaiseSchema(invoices[0])).toBe(false);
    expect(hasCurrentPaiseSchema(invoices[1])).toBe(false);
    const parties = db.getParties();
    expect(hasCurrentPaiseSchema(parties[0])).toBe(false);
  });

  it('6. Render the card with no documents at all: "Check plan" shows "nothing to do" and the run button stays disabled', () => {
    db.clearMemoryCache();
    testStorage.clear();

    render(<PaiseBackfillCard />);

    const checkBtn = screen.getByTestId('paise-backfill-check');
    fireEvent.click(checkBtn);

    const planPanel = screen.getByTestId('paise-backfill-plan');
    expect(planPanel).toBeTruthy();
    expect(planPanel.textContent).toContain('nothing to do');

    const runBtn = screen.getByTestId('paise-backfill-run') as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);
  });
});
