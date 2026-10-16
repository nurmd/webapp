import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Mock storage
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

// Mock pouchdb
vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => {}),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

vi.mock('../services/auditTrail.ts', () => ({
  auditTrail: {
    logEvent: vi.fn(async () => {}),
    getRecentLogs: vi.fn(async () => []),
    getLogsByDocument: vi.fn(async () => []),
  },
}));

import { db } from '../services/db.ts';
import { CompanyProfile } from '../models/company.ts';
import { BillingInvoicesTab } from '../components/Settings/tabs/BillingInvoicesTab.tsx';

describe('Billing & Invoices Settings Tab', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  const mockProfile: CompanyProfile = {
    id: 'COMP-001',
    businessName: 'Super Traders',
    tradeName: 'Super Traders Wholesale',
    gstin: '27AABCU9603R1ZN',
    pan: 'AABCU9603R',
    stateCode: '27',
    address: '123 Market Street',
    pincode: '400001',
    phone: '9876543210',
    email: 'info@supertraders.com',
    bankName: 'State Bank of India',
    accountNumber: '123456789012',
    ifscCode: 'SBIN0001234',
    upiId: 'supertraders@sbi',
    termsAndConditions: '1. Goods once sold will not be taken back.',
    isCompositionScheme: false,
  };

  beforeEach(() => {
    testStorage.clear();
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
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

  it('renders all consolidated invoice settings sections', () => {
    act(() => {
      root!.render(
        <BillingInvoicesTab
          profile={mockProfile}
          defaultPrintOption="A4"
          handleDefaultPrintOptionChange={() => {}}
          setIsQrModalOpen={() => {}}
        />
      );
    });

    expect(container!.textContent).toContain('Invoice Numbering & Prefix Series');
    expect(container!.textContent).toContain('Invoice Type & Compliance Scheme');
    expect(container!.textContent).toContain('Invoice Terms & Conditions');
    expect(container!.textContent).toContain('Default Payment Terms & Due Date');
    expect(container!.textContent).toContain('Payment QR & Bank Details');
    expect(container!.textContent).toContain('Default Print Format');
  });

  it('allows toggling between Regular Tax Invoice and Composition Scheme (Bill of Supply)', () => {
    let updatedProfile: CompanyProfile = { ...mockProfile };
    const setProfile = (fnOrVal: any) => {
      updatedProfile = typeof fnOrVal === 'function' ? fnOrVal(updatedProfile) : fnOrVal;
    };
    const onSave = vi.fn((p) => {
      updatedProfile = p;
    });

    act(() => {
      root!.render(
        <BillingInvoicesTab
          profile={updatedProfile}
          setProfile={setProfile as any}
          onSave={onSave}
          defaultPrintOption="A4"
          handleDefaultPrintOptionChange={() => {}}
          setIsQrModalOpen={() => {}}
        />
      );
    });

    // Find the toggle switch for composition scheme
    const toggleBtn = container!.querySelector('button[role="switch"]') as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();

    act(() => {
      toggleBtn.click();
    });

    expect(onSave).toHaveBeenCalled();
    expect(updatedProfile.isCompositionScheme).toBe(true);
  });

  it('allows editing and saving Invoice Terms & Conditions with quick preset insertion', () => {
    let updatedProfile: CompanyProfile = { ...mockProfile };
    const setProfile = (fnOrVal: any) => {
      updatedProfile = typeof fnOrVal === 'function' ? fnOrVal(updatedProfile) : fnOrVal;
    };
    const onSave = vi.fn((p) => {
      updatedProfile = p;
    });

    act(() => {
      root!.render(
        <BillingInvoicesTab
          profile={updatedProfile}
          setProfile={setProfile as any}
          onSave={onSave}
          defaultPrintOption="A4"
          handleDefaultPrintOptionChange={() => {}}
          setIsQrModalOpen={() => {}}
        />
      );
    });

    // Find preset clause button
    const buttons = Array.from(container!.querySelectorAll('button'));
    const presetBtn = buttons.find((b) => b.textContent?.includes('Interest'));
    expect(presetBtn).toBeTruthy();

    act(() => {
      presetBtn!.click();
    });

    // Save terms
    const saveBtn = buttons.find((b) => b.textContent?.includes('Save Terms'));
    expect(saveBtn).toBeTruthy();

    act(() => {
      saveBtn!.click();
    });

    expect(onSave).toHaveBeenCalled();
    expect(updatedProfile.termsAndConditions).toContain('Interest');
  });

  it('allows setting Default Payment Terms (due days offset)', () => {
    act(() => {
      root!.render(
        <BillingInvoicesTab
          profile={mockProfile}
          defaultPrintOption="A4"
          handleDefaultPrintOptionChange={() => {}}
          setIsQrModalOpen={() => {}}
        />
      );
    });

    const buttons = Array.from(container!.querySelectorAll('button'));
    const net30Btn = buttons.find((b) => b.textContent?.includes('Net 30 Days'));
    expect(net30Btn).toBeTruthy();

    act(() => {
      net30Btn!.click();
    });

    expect(db.getDefaultDueDays()).toBe(30);
  });

  it('allows editing bank and UPI details inline', () => {
    let updatedProfile: CompanyProfile = { ...mockProfile };
    const setProfile = (fnOrVal: any) => {
      updatedProfile = typeof fnOrVal === 'function' ? fnOrVal(updatedProfile) : fnOrVal;
    };
    const onSave = vi.fn((p) => {
      updatedProfile = p;
    });

    act(() => {
      root!.render(
        <BillingInvoicesTab
          profile={updatedProfile}
          setProfile={setProfile as any}
          onSave={onSave}
          defaultPrintOption="A4"
          handleDefaultPrintOptionChange={() => {}}
          setIsQrModalOpen={() => {}}
        />
      );
    });

    // Click Edit Bank Details
    const buttons = Array.from(container!.querySelectorAll('button'));
    const editBtn = buttons.find((b) => b.textContent?.includes('Edit Bank Details'));
    expect(editBtn).toBeTruthy();

    act(() => {
      editBtn!.click();
    });

    // Form inputs should now be visible
    const bankInput = container!.querySelector('input[placeholder*="HDFC Bank"]') as HTMLInputElement;
    expect(bankInput).toBeTruthy();

    act(() => {
      bankInput.value = 'ICICI Bank';
      bankInput.dispatchEvent(new Event('input', { bubbles: true }));
      bankInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Submit form
    const saveBankBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Details')
    );
    expect(saveBankBtn).toBeTruthy();

    act(() => {
      saveBankBtn!.click();
    });

    expect(onSave).toHaveBeenCalled();
  });

  it('allows toggling invoice columns, party balance, and auto round-off', () => {
    act(() => {
      root!.render(
        <BillingInvoicesTab
          profile={mockProfile}
          defaultPrintOption="A4"
          handleDefaultPrintOptionChange={() => {}}
          setIsQrModalOpen={() => {}}
        />
      );
    });

    expect(container!.textContent).toContain('Invoice Columns & Display Fields');
    expect(container!.textContent).toContain('Show Customer Balance');
    expect(container!.textContent).toContain('Auto Round-Off Grand Total');

    // Find Auto Round-Off switch
    const switches = Array.from(container!.querySelectorAll('button[role="switch"]'));
    expect(switches.length).toBeGreaterThanOrEqual(2);

    // Toggle auto round-off
    const initialRoundOff = db.getAutoRoundOff();
    act(() => {
      const btn = container!.querySelector('button[aria-label="Toggle Auto Round-Off"]') as HTMLButtonElement;
      if (btn) btn.click();
    });

    expect(db.getAutoRoundOff()).toBe(!initialRoundOff);
  });
});
