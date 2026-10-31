import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PaymentModalProvider,
  usePaymentModal,
  openPaymentModal as globalOpenPaymentModal,
  closePaymentModal as globalClosePaymentModal,
  type PaymentModalContextType,
} from '../components/Payments/PaymentModalContext.tsx';
import { DashboardView } from '../components/Dashboard/DashboardView.tsx';
import { NavigationMenuHubView } from '../components/Navigation/NavigationMenuHubView.tsx';
import { PartyDetailModal } from '../components/Parties/PartyDetailModal.tsx';
import { resetBackNavigationForTesting } from '../core/utils/backNavigation.ts';
import type { Party } from '../models/party.ts';
import type { Invoice } from '../models/invoice.ts';
import type { PurchaseBill } from '../models/purchase.ts';
import type { BankAccount } from '../models/bankAccount.ts';
import type { CompanyProfile } from '../models/company.ts';

import { db } from '../services/db.ts';

// Mock pouchdb
vi.mock('../services/pouchdb.ts', () => ({
  DEFAULT_COUCHDB_REMOTE_URL: '',
  DEFAULT_LOCAL_DB_NAME: 'vyapar_fintech_store',
  DEMO_LOCAL_DB_NAME: 'vyapar_demo',
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
    probeRemoteConnection: vi.fn(async () => ({
      ok: true,
      details: { dbName: 'test_db', docCount: 0, canRead: true, canWrite: true },
    })),
  },
  PouchService: {
    switchToRemoteDb: vi.fn(),
    switchToOfflineDb: vi.fn(),
    reconnectCloudDb: vi.fn(),
    enterDemoMode: vi.fn(),
    exitDemoMode: vi.fn(),
  },
}));

describe('Payment Modal Global Architecture & Integration Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    resetBackNavigationForTesting();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    resetBackNavigationForTesting();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mockCompany: CompanyProfile = {
    id: 'comp_test',
    businessName: 'Global Modal Corp',
    tradeName: 'Global Modal Corp',
    gstin: '27AABCU9603R1ZM',
    pan: 'AABCU9603R',
    stateCode: '27',
    phone: '9876543210',
    email: 'admin@modal.test',
    address: 'Mumbai, Maharashtra',
    pincode: '400001',
    isGstEnabled: true,
  };

  const cashAccount: BankAccount = {
    id: 'ACC_CASH',
    accountName: 'Cash Register',
    accountType: 'CASH',
    openingBalance: 10000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const customerParty: Party = {
    id: 'party_c1',
    name: 'Customer Beta',
    type: 'CUSTOMER',
    phone: '9811111111',
    stateCode: '27',
    billingAddress: 'Mumbai',
    currentBalance: 4000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const supplierParty: Party = {
    id: 'party_s1',
    name: 'Supplier Gamma',
    type: 'SUPPLIER',
    phone: '9822222222',
    stateCode: '27',
    billingAddress: 'Pune',
    currentBalance: -6000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockInvoice: Invoice = {
    id: 'inv_b1',
    invoiceNumber: 'INV-B1',
    invoiceType: 'B2B',
    date: '2026-05-10',
    dueDate: '2026-05-25',
    partyId: 'party_c1',
    partyName: 'Customer Beta',
    partyAddress: 'Mumbai',
    partyStateCode: '27',
    placeOfSupplyStateCode: '27',
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
    paidAmount: 0,
    balanceAmount: 4000,
    paymentStatus: 'UNPAID',
    paymentMode: 'CASH',
    amountInWords: 'Four Thousand Rupees Only',
    createdAt: '2026-05-10T10:00:00.000Z',
    updatedAt: '2026-05-10T10:00:00.000Z',
  };

  function changeInput(input: HTMLInputElement, value: string) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  describe('1. PaymentModalContext & Provider Hook', () => {
    it('returns isAvailable false and dispatches custom event when outside provider', () => {
      let capturedContext: any = null;
      const Consumer = () => {
        capturedContext = usePaymentModal();
        return <div>Consumer</div>;
      };

      act(() => {
        root.render(<Consumer />);
      });

      expect(capturedContext).not.toBeNull();
      expect(capturedContext?.isAvailable).toBe(false);
      expect(capturedContext?.isOpen).toBe(false);

      const eventSpy = vi.fn();
      window.addEventListener('open_payment_modal', eventSpy);
      act(() => {
        capturedContext?.openPaymentModal({ flow: 'IN' });
      });
      expect(eventSpy).toHaveBeenCalledTimes(1);
      window.removeEventListener('open_payment_modal', eventSpy);
    });

    it('opens and closes modal via usePaymentModal hook inside provider', async () => {
      let modalControls: any = null;
      const Consumer = () => {
        modalControls = usePaymentModal();
        return <div>Inside Provider</div>;
      };

      await act(async () => {
        root.render(
          <PaymentModalProvider
            parties={[customerParty, supplierParty]}
            bankAccounts={[cashAccount]}
            invoices={[mockInvoice]}
          >
            <Consumer />
          </PaymentModalProvider>
        );
      });

      expect(modalControls).not.toBeNull();
      expect(modalControls?.isAvailable).toBe(true);
      expect(container.textContent).not.toContain('Record Payment In (Receipt)');

      // Open Payment In
      await act(async () => {
        modalControls?.openPaymentModal({ flow: 'IN', party: customerParty });
      });

      expect(container.textContent).toContain('Record Payment In (Receipt)');
      expect(container.textContent).toContain('Customer Beta');

      // Close Payment In
      await act(async () => {
        modalControls?.closePaymentModal();
      });

      expect(container.textContent).not.toContain('Record Payment In (Receipt)');
    });

    it('resolves flow from supplier party type when flow is omitted', async () => {
      let modalControls: any = null;
      const Consumer = () => {
        modalControls = usePaymentModal();
        return <div>Inside Provider</div>;
      };

      await act(async () => {
        root.render(
          <PaymentModalProvider
            parties={[customerParty, supplierParty]}
            bankAccounts={[cashAccount]}
          >
            <Consumer />
          </PaymentModalProvider>
        );
      });

      await act(async () => {
        modalControls?.openPaymentModal({ party: supplierParty });
      });

      expect(container.textContent).toContain('Record Payment Out');
      expect(container.textContent).toContain('Supplier Gamma');
    });

    it('executes onRecordPartyPayment, invokes onSuccess and onRefresh, then closes modal', async () => {
      const onRecordPartyPayment = vi.fn().mockReturnValue(true);
      const onRefresh = vi.fn();
      const onSuccess = vi.fn();

      let modalControls: any = null;
      const Consumer = () => {
        modalControls = usePaymentModal();
        return <div>Inside Provider</div>;
      };

      await act(async () => {
        root.render(
          <PaymentModalProvider
            onRecordPartyPayment={onRecordPartyPayment}
            onRefresh={onRefresh}
            parties={[customerParty]}
            bankAccounts={[cashAccount]}
            invoices={[mockInvoice]}
          >
            <Consumer />
          </PaymentModalProvider>
        );
      });

      await act(async () => {
        modalControls?.openPaymentModal({
          flow: 'IN',
          party: customerParty,
          onSuccess,
        });
      });

      expect(container.textContent).toContain('Record Payment In (Receipt)');

      const amtInput = container.querySelector('input[type="number"]') as HTMLInputElement;
      expect(amtInput).not.toBeNull();
      await act(async () => {
        changeInput(amtInput, '3000');
      });

      const form = container.querySelector('form') as HTMLFormElement;
      expect(form).not.toBeNull();
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(onRecordPartyPayment).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'party_c1' }),
        3000,
        expect.any(String),
        expect.any(String),
        'IN',
        undefined,
        0,
        undefined,
        expect.any(Array),
        expect.any(String),
        expect.any(String)
      );
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(container.textContent).not.toContain('Record Payment In (Receipt)');
    });

    it('keeps modal open if onRecordPartyPayment returns false', async () => {
      const onRecordPartyPayment = vi.fn().mockReturnValue(false);
      let modalControls: any = null;
      const Consumer = () => {
        modalControls = usePaymentModal();
        return <div>Inside Provider</div>;
      };

      await act(async () => {
        root.render(
          <PaymentModalProvider
            onRecordPartyPayment={onRecordPartyPayment}
            parties={[customerParty]}
            bankAccounts={[cashAccount]}
            invoices={[mockInvoice]}
          >
            <Consumer />
          </PaymentModalProvider>
        );
      });

      await act(async () => {
        modalControls?.openPaymentModal({ flow: 'IN', party: customerParty });
      });

      const amtInput = container.querySelector('input[type="number"]') as HTMLInputElement;
      await act(async () => {
        changeInput(amtInput, '1500');
      });

      const form = container.querySelector('form') as HTMLFormElement;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(onRecordPartyPayment).toHaveBeenCalledTimes(1);
      // Stays open
      expect(container.textContent).toContain('Record Payment In (Receipt)');
    });
  });

  describe('2. Dashboard Quick Actions Integration', () => {
    it('dispatches onOpenPaymentModal prop for PAYMENT_IN and PAYMENT_OUT', async () => {
      db.setDashboardQuickActions(['PAYMENT_IN', 'PAYMENT_OUT']);
      const onOpenPaymentModal = vi.fn();

      await act(async () => {
        root.render(
          <DashboardView
            company={mockCompany}
            invoices={[]}
            items={[]}
            parties={[]}
            purchases={[]}
            vouchers={[]}
            expenses={[]}
            onNewInvoice={vi.fn()}
            onQuickPos={vi.fn()}
            onViewInvoice={vi.fn()}
            onNavigateTab={vi.fn()}
            onOpenPaymentModal={onOpenPaymentModal}
          />
        );
      });

      const paymentInBtn = container.querySelector('[data-quick-action="PAYMENT_IN"]') as HTMLButtonElement | null;
      const paymentOutBtn = container.querySelector('[data-quick-action="PAYMENT_OUT"]') as HTMLButtonElement | null;

      expect(paymentInBtn).not.toBeNull();
      expect(paymentOutBtn).not.toBeNull();

      await act(async () => {
        paymentInBtn?.click();
      });
      expect(onOpenPaymentModal).toHaveBeenCalledWith('IN');

      await act(async () => {
        paymentOutBtn?.click();
      });
      expect(onOpenPaymentModal).toHaveBeenCalledWith('OUT');
    });

    it('opens global payment modal from Dashboard when wrapped in PaymentModalProvider', async () => {
      db.setDashboardQuickActions(['PAYMENT_IN', 'PAYMENT_OUT']);

      await act(async () => {
        root.render(
          <PaymentModalProvider
            parties={[customerParty, supplierParty]}
            bankAccounts={[cashAccount]}
          >
            <DashboardView
              company={mockCompany}
              invoices={[]}
              items={[]}
              parties={[customerParty, supplierParty]}
              purchases={[]}
              vouchers={[]}
              expenses={[]}
              onNewInvoice={vi.fn()}
              onQuickPos={vi.fn()}
              onViewInvoice={vi.fn()}
              onNavigateTab={vi.fn()}
            />
          </PaymentModalProvider>
        );
      });

      const paymentInBtn = container.querySelector('[data-quick-action="PAYMENT_IN"]') as HTMLButtonElement | null;
      expect(paymentInBtn).not.toBeNull();

      await act(async () => {
        paymentInBtn?.click();
      });

      expect(container.textContent).toContain('Record Payment In (Receipt)');
    });
  });

  describe('3. NavigationMenuHubView Integration', () => {
    it('NavigationMenuHubView routes Payment In and Payment Out directly to their respective transaction registers', async () => {
      const onNavigate = vi.fn();

      await act(async () => {
        root.render(
          <NavigationMenuHubView
            company={mockCompany}
            invoices={[]}
            purchases={[]}
            parties={[]}
            items={[]}
            expenses={[]}
            vouchers={[]}
            onNavigate={onNavigate}
          />
        );
      });

      // Find Payment In transaction register button
      const paymentInBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Payment In') && b.textContent?.includes('Customer receipts')
      );
      expect(paymentInBtn).toBeDefined();

      await act(async () => {
        paymentInBtn?.click();
      });
      expect(onNavigate).toHaveBeenCalledWith('payment_in');

      // Find Payment Out transaction register button
      const paymentOutBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Payment Out') && b.textContent?.includes('Supplier disbursements')
      );
      expect(paymentOutBtn).toBeDefined();

      await act(async () => {
        paymentOutBtn?.click();
      });
      expect(onNavigate).toHaveBeenCalledWith('payment_out');

      // Redundant Record Payment shortcuts are removed from navigation
      expect(container.textContent).not.toContain('Record Payment In');
      expect(container.textContent).not.toContain('Record Payment Out');
    });
  });

  describe('4. PartyDetailModal Record Payment Wiring', () => {
    it('invokes onOpenPaymentModal prop with correct flow and party when clicked', async () => {
      const onOpenPaymentModal = vi.fn();

      await act(async () => {
        root.render(
          <PartyDetailModal
            isOpen={true}
            party={customerParty}
            company={mockCompany}
            invoices={[mockInvoice]}
            purchases={[]}
            vouchers={[]}
            bankAccounts={[cashAccount]}
            onEditParty={vi.fn()}
            onRecordPayment={vi.fn()}
            onOpenPaymentModal={onOpenPaymentModal}
          />
        );
      });

      const recordPaymentBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Record Payment')
      );
      expect(recordPaymentBtn).toBeDefined();

      await act(async () => {
        recordPaymentBtn?.click();
      });

      expect(onOpenPaymentModal).toHaveBeenCalledWith('IN', customerParty);
    });

    it('opens global payment modal in OUT flow when viewing a supplier inside provider', async () => {
      await act(async () => {
        root.render(
          <PaymentModalProvider
            parties={[customerParty, supplierParty]}
            bankAccounts={[cashAccount]}
          >
            <PartyDetailModal
              isOpen={true}
              party={supplierParty}
              company={mockCompany}
              invoices={[]}
              purchases={[]}
              vouchers={[]}
              bankAccounts={[cashAccount]}
              onEditParty={vi.fn()}
              onRecordPayment={vi.fn()}
            />
          </PaymentModalProvider>
        );
      });

      const recordPaymentBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Record Payment')
      );
      expect(recordPaymentBtn).toBeDefined();

      await act(async () => {
        recordPaymentBtn?.click();
      });

      expect(container.textContent).toContain('Record Payment Out');
      expect(container.textContent).toContain('Supplier Gamma');
    });

    it('falls back to toggling inline collapsible drawer when outside provider without onOpenPaymentModal', async () => {
      await act(async () => {
        root.render(
          <PartyDetailModal
            isOpen={true}
            party={customerParty}
            company={mockCompany}
            invoices={[mockInvoice]}
            purchases={[]}
            vouchers={[]}
            bankAccounts={[cashAccount]}
            onEditParty={vi.fn()}
            onRecordPayment={vi.fn()}
          />
        );
      });

      const recordPaymentBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Record Payment')
      );
      expect(recordPaymentBtn).toBeDefined();

      // Before click: inline drawer is closed
      expect(container.textContent).not.toContain('Save Payment In');

      // Click to toggle inline drawer
      await act(async () => {
        recordPaymentBtn?.click();
      });

      // After click: inline drawer is open
      expect(container.textContent).toContain('Save Payment In');
      expect(container.textContent).toContain('Close Payment');
    });
  });
});
