import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Setup Mock Storage
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

vi.mock('../services/pouchdb.ts', () => {
  return {
    pouch: {
      putDoc: vi.fn().mockResolvedValue({}),
      deleteDoc: vi.fn().mockResolvedValue({}),
      getAllDocs: vi.fn().mockResolvedValue([]),
      syncNow: vi.fn().mockResolvedValue({}),
      subscribe: vi.fn(() => () => {}),
      isConfigured: vi.fn().mockReturnValue(false),
      migrateFromLocalStorage: vi.fn().mockResolvedValue({}),
    },
  };
});

import { PartiesView } from '../components/Parties/PartiesView.tsx';
import { SelectPartyModal } from '../components/Parties/SelectPartyModal.tsx';
import { Party } from '../models/party.ts';
import { Invoice } from '../models/invoice.ts';
import { db } from '../services/db.ts';

const mockParties: Party[] = [
  {
    id: 'P-1',
    name: 'Zeta Traders',
    type: 'CUSTOMER',
    phone: '9876543210',
    currentBalance: 1500, // Amount 1500
    billingAddress: 'Mumbai',
    stateCode: '27',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'P-2',
    name: 'Alpha Enterprises',
    type: 'CUSTOMER',
    phone: '9876543211',
    currentBalance: 50000, // Highest Amount
    billingAddress: 'Delhi',
    stateCode: '07',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'P-3',
    name: 'Beta Solutions',
    type: 'CUSTOMER',
    phone: '9876543212',
    currentBalance: 200,
    billingAddress: 'Bangalore',
    stateCode: '29',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

// Zeta has the newest invoice
const mockInvoices: Invoice[] = [
  {
    id: 'INV-1',
    invoiceNumber: 'INV-001',
    invoiceType: 'B2B',
    partyId: 'P-1', // Zeta Traders has the most recent transaction
    partyName: 'Zeta Traders',
    partyAddress: 'Mumbai',
    partyStateCode: '27',
    placeOfSupplyStateCode: '27',
    date: '2026-10-15',
    createdAt: '2026-10-15T10:00:00Z',
    updatedAt: '2026-10-15T10:00:00Z',
    items: [],
    totalGrossAmount: 1500,
    totalDiscount: 0,
    totalTaxableAmount: 1500,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal: 1500,
    amountInWords: 'One Thousand Five Hundred Rupees Only',
    paidAmount: 0,
    balanceAmount: 1500,
    paymentStatus: 'UNPAID',
    paymentMode: 'CREDIT',
    isIntraState: true,
  },
  {
    id: 'INV-2',
    invoiceNumber: 'INV-002',
    invoiceType: 'B2B',
    partyId: 'P-3', // Beta Solutions had a transaction on 2026-05-01
    partyName: 'Beta Solutions',
    partyAddress: 'Bangalore',
    partyStateCode: '29',
    placeOfSupplyStateCode: '29',
    date: '2026-05-01',
    createdAt: '2026-05-01T10:00:00Z',
    updatedAt: '2026-05-01T10:00:00Z',
    items: [],
    totalGrossAmount: 200,
    totalDiscount: 0,
    totalTaxableAmount: 200,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal: 200,
    amountInWords: 'Two Hundred Rupees Only',
    paidAmount: 0,
    balanceAmount: 200,
    paymentStatus: 'UNPAID',
    paymentMode: 'CREDIT',
    isIntraState: true,
  },
];

describe('Party Selector Loop Sorting (Name -> Amount -> Recent Transaction)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    testStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('PartiesView defaults to recent transaction sort and cycles Name -> Amount -> Recent on repeated clicks when active', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <PartiesView
          parties={mockParties}
          invoices={mockInvoices}
          purchases={[]}
          vouchers={[]}
          onSaveParty={() => {}}
          onDeleteParty={() => {}}
        />
      );
    });

    // 1. Initial State: Customers is active, default sort is RECENT
    // Zeta has newest invoice (2026-10-15), followed by Beta (2026-05-01), followed by Alpha (no invoices)
    let partyCards = container.querySelectorAll('[data-testid="party-card-name"]');
    let names = Array.from(partyCards).map((el) => el.textContent?.trim());
    expect(names[0]).toBe('Zeta Traders');
    expect(names[1]).toBe('Beta Solutions');
    expect(names[2]).toBe('Alpha Enterprises');

    // Find the Customers button
    const customersBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Customers')
    );
    expect(customersBtn).toBeDefined();

    // 2. Press Customers button while already active -> Sort by NAME (A-Z)
    await act(async () => {
      customersBtn?.click();
    });

    partyCards = container.querySelectorAll('[data-testid="party-card-name"]');
    names = Array.from(partyCards).map((el) => el.textContent?.trim());
    expect(names[0]).toBe('Alpha Enterprises');
    expect(names[1]).toBe('Beta Solutions');
    expect(names[2]).toBe('Zeta Traders');

    // 3. Press Customers button again -> Sort by AMOUNT (Highest first)
    await act(async () => {
      customersBtn?.click();
    });

    partyCards = container.querySelectorAll('[data-testid="party-card-name"]');
    names = Array.from(partyCards).map((el) => el.textContent?.trim());
    // Alpha (50000) > Zeta (1500) > Beta (200)
    expect(names[0]).toBe('Alpha Enterprises');
    expect(names[1]).toBe('Zeta Traders');
    expect(names[2]).toBe('Beta Solutions');

    // 4. Press Customers button again -> Loops back to RECENT (Latest transaction)
    await act(async () => {
      customersBtn?.click();
    });

    partyCards = container.querySelectorAll('[data-testid="party-card-name"]');
    names = Array.from(partyCards).map((el) => el.textContent?.trim());
    expect(names[0]).toBe('Zeta Traders');
    expect(names[1]).toBe('Beta Solutions');
    expect(names[2]).toBe('Alpha Enterprises');
  });

  it('SelectPartyModal defaults to recent transaction and cycles sort in loop when Customers is clicked while active', async () => {
    // Populate DB for modal lookup
    db.saveInvoice(mockInvoices[0]);
    db.saveInvoice(mockInvoices[1]);

    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SelectPartyModal
          parties={mockParties}
          onSelectParty={() => {}}
          onClose={() => {}}
          onAddNewParty={() => {}}
        />
      );
    });

    const customersBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Customers')
    );
    expect(customersBtn).toBeDefined();

    // 1. Click Customers (from ALL -> CUSTOMER): behaves normally, defaults to RECENT
    await act(async () => {
      customersBtn?.click();
    });

    let partyItems = container.querySelectorAll('.font-headline-sm');
    let names = Array.from(partyItems).map((el) => el.textContent?.trim());
    // Filter header has h3 with font-headline-sm: "Select Customer / Party", then parties
    const partyNames = names.filter((n) => n !== 'Select Customer / Party');
    expect(partyNames[0]).toBe('Zeta Traders');
    expect(partyNames[1]).toBe('Beta Solutions');
    expect(partyNames[2]).toBe('Alpha Enterprises');

    // 2. Click Customers while already active -> cycles to NAME (A-Z)
    await act(async () => {
      customersBtn?.click();
    });

    partyItems = container.querySelectorAll('.font-headline-sm');
    names = Array.from(partyItems).map((el) => el.textContent?.trim());
    const namesAfterNameSort = names.filter((n) => n !== 'Select Customer / Party');
    expect(namesAfterNameSort[0]).toBe('Alpha Enterprises');
    expect(namesAfterNameSort[1]).toBe('Beta Solutions');
    expect(namesAfterNameSort[2]).toBe('Zeta Traders');

    // 3. Click Customers again -> cycles to AMOUNT (Highest balance first)
    await act(async () => {
      customersBtn?.click();
    });

    partyItems = container.querySelectorAll('.font-headline-sm');
    names = Array.from(partyItems).map((el) => el.textContent?.trim());
    const namesAfterAmountSort = names.filter((n) => n !== 'Select Customer / Party');
    expect(namesAfterAmountSort[0]).toBe('Alpha Enterprises');
    expect(namesAfterAmountSort[1]).toBe('Zeta Traders');
    expect(namesAfterAmountSort[2]).toBe('Beta Solutions');

    // 4. Click Customers again -> loops back to RECENT
    await act(async () => {
      customersBtn?.click();
    });

    partyItems = container.querySelectorAll('.font-headline-sm');
    names = Array.from(partyItems).map((el) => el.textContent?.trim());
    const namesAfterLoop = names.filter((n) => n !== 'Select Customer / Party');
    expect(namesAfterLoop[0]).toBe('Zeta Traders');
    expect(namesAfterLoop[1]).toBe('Beta Solutions');
    expect(namesAfterLoop[2]).toBe('Alpha Enterprises');
  });
});
