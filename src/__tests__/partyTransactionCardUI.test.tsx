import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PartyInfoCard } from '../components/Parties/PartyInfoCard.tsx';
import { PartyDetailModal } from '../components/Parties/PartyDetailModal.tsx';
import { PartyPassbookTable } from '../components/Parties/PartyPassbookTable.tsx';
import { Party } from '../models/party.ts';
import { CompanyProfile } from '../models/company.ts';
import { db } from '../services/db.ts';

const mockCompany: CompanyProfile = {
  id: 'comp-test',
  businessName: 'Test Enterprise',
  isGstEnabled: true,
  gstin: '27AABCT1234H1Z0',
  pan: 'AABCT1234H',
  stateCode: '27',
  address: 'Pune, Maharashtra',
  pincode: '411001',
  phone: '9876543210',
  email: 'test@example.com',
};

const mockParty: Party = {
  id: 'party-test-1',
  name: 'Rajesh Trading Co',
  type: 'CUSTOMER',
  phone: '9822001122',
  billingAddress: 'Market Yard, Pune',
  stateCode: '27',
  openingBalance: 1000,
  openingBalanceType: 'TO_RECEIVE',
  currentBalance: 5000,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Party Details Transaction Card UI Enhancements', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('Requirement 1 & 4: PartyInfoCard has darker background, white transaction text, and sticky non-wrapping Total Bill/Paid metrics', () => {
    act(() => {
      root.render(
        <PartyInfoCard
          party={mockParty}
          company={mockCompany}
          liveNetBalance={5000}
          isReceivable={true}
          isPayable={false}
          totalBilled={12500}
          totalPaid={7500}
          showPartyDetails={false}
          setShowPartyDetails={vi.fn()}
          onEditParty={vi.fn()}
        />
      );
    });

    const card = container.querySelector('section');
    expect(card).not.toBeNull();
    // 1. Darker background and white text
    expect(card?.className).toContain('bg-slate-900');
    expect(card?.className).toContain('text-white');

    // Balance amount has white contrast
    const balanceAmount = container.querySelector('.font-currency-display-mobile');
    expect(balanceAmount).not.toBeNull();
    expect(balanceAmount?.className).toContain('text-white');

    // 4. Total Bill and Total Paid sticky next to their labels without wrapping
    const totalBillLabel = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent?.trim() === 'Total Bill:'
    );
    expect(totalBillLabel).toBeDefined();
    expect(totalBillLabel?.className).toContain('whitespace-nowrap');

    const totalBillContainer = totalBillLabel?.parentElement;
    expect(totalBillContainer?.className).toContain('flex');
    expect(totalBillContainer?.className).toContain('items-center');
    expect(totalBillContainer?.className).toContain('gap-1.5');
    expect(totalBillContainer?.className).toContain('whitespace-nowrap');
    expect(totalBillContainer?.textContent).toContain('₹');
    expect(totalBillContainer?.textContent).toContain('12,500');

    const totalPaidLabel = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent?.trim() === 'Total Paid:'
    );
    expect(totalPaidLabel).toBeDefined();
    expect(totalPaidLabel?.className).toContain('whitespace-nowrap');

    const totalPaidContainer = totalPaidLabel?.parentElement;
    expect(totalPaidContainer?.className).toContain('flex');
    expect(totalPaidContainer?.className).toContain('items-center');
    expect(totalPaidContainer?.className).toContain('gap-1.5');
    expect(totalPaidContainer?.className).toContain('whitespace-nowrap');
    expect(totalPaidContainer?.textContent).toContain('₹');
    expect(totalPaidContainer?.textContent).toContain('7,500');
  });

  it('Requirement 2 & 3: Print icon is next to Call icon, and action icons are hidden in collapsible container that slides out on toggle', async () => {
    db.saveParty(mockParty);
    const onEditParty = vi.fn();
    const onDeleteParty = vi.fn();

    await act(async () => {
      root.render(
        <PartyDetailModal
          party={mockParty}
          company={mockCompany}
          invoices={[]}
          purchases={[]}
          vouchers={[]}
          isOpen={true}
          onEditParty={onEditParty}
          onDeleteParty={onDeleteParty}
          onRecordPayment={vi.fn()}
        />
      );
    });

    const toggleBtn = container.querySelector('[data-testid="party-actions-toggle"]') as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

    // The collapsible container starts closed (collapsed with max-w-0, invisible, pointer-events-none - no icon peeking)
    const collapsibleContainer = toggleBtn.previousElementSibling as HTMLElement;
    expect(collapsibleContainer).not.toBeNull();
    expect(collapsibleContainer.className).toContain('max-w-0');
    expect(collapsibleContainer.className).toContain('pointer-events-none');
    expect(collapsibleContainer.className).toContain('invisible');
    expect(collapsibleContainer.className).toContain('transition-all');

    // Trigger button remains visible at all times
    expect(toggleBtn.className).not.toContain('invisible');
    expect(toggleBtn.className).not.toContain('max-w-0');

    // Inside the collapsible container: Call icon is followed immediately by Print icon
    const callLink = collapsibleContainer.querySelector('a[title="Call"]');
    expect(callLink).not.toBeNull();

    const printBtn = collapsibleContainer.querySelector('button[title="Print Ledger Statement"]');
    expect(printBtn).not.toBeNull();

    // Verify Print icon is next to Call icon: printBtn is the next element sibling of callLink
    expect(callLink?.nextElementSibling).toBe(printBtn);

    // Also verify WhatsApp, Edit, and Delete are inside this same container
    const whatsAppBtn = collapsibleContainer.querySelector('button[title="WhatsApp Reminder & Statement"]');
    expect(whatsAppBtn).not.toBeNull();

    const editBtn = collapsibleContainer.querySelector('button[title="Edit Profile"]');
    expect(editBtn).not.toBeNull();

    const deleteBtn = collapsibleContainer.querySelector('button[title="Delete Party"]');
    expect(deleteBtn).not.toBeNull();

    // When toggle button is clicked: container slides out (expands to max-w-[280px], opacity-100, aria-expanded=true, visible)
    await act(async () => {
      toggleBtn.click();
    });

    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(collapsibleContainer.className).toContain('max-w-[280px]');
    expect(collapsibleContainer.className).toContain('opacity-100');
    expect(collapsibleContainer.className).toContain('visible');
    expect(collapsibleContainer.className).not.toContain('pointer-events-none');

    // When clicked again: collapses back completely (invisible)
    await act(async () => {
      toggleBtn.click();
    });

    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(collapsibleContainer.className).toContain('max-w-0');
    expect(collapsibleContainer.className).toContain('invisible');
    expect(collapsibleContainer.className).toContain('pointer-events-none');
  });

  it('Requirement 1-5: PartyPassbookTable has dark card, white primary text, slate-300/400 secondary text, darkened filter pills, sort button, and search input', () => {
    const mockEntries: any[] = [
      {
        id: 'sale-inv-1',
        date: '2026-10-30',
        type: 'SALE',
        billAmount: 5000,
        debit: 5000,
        credit: 0,
        runningBalance: 5000,
        docNumber: 'INV-1001',
        rawInvoice: {
          id: 'inv-1',
          invoiceNumber: 'INV-1001',
          grandTotal: 5000,
          balanceAmount: 2000,
          paidAmount: 3000,
          invoiceType: 'TAX_INVOICE',
        },
        status: 'PARTIAL',
      },
    ];

    act(() => {
      root.render(
        <PartyPassbookTable
          filteredPassbook={mockEntries}
          txnFilter="ALL"
          setTxnFilter={vi.fn()}
          txnSortOrder="NEWEST"
          setTxnSortOrder={vi.fn()}
          searchTxn=""
          setSearchTxn={vi.fn()}
          onTransactionClick={vi.fn()}
        />
      );
    });

    // 1. Transaction list card is dark
    const tableSection = container.querySelector('section');
    expect(tableSection).not.toBeNull();
    expect(tableSection?.className).toContain('bg-slate-900');
    expect(tableSection?.className).toContain('text-white');
    expect(tableSection?.className).toContain('border-slate-800');

    // 2. Filter pills container & buttons darkened
    const filterContainer = container.querySelector('.inline-flex.rounded-lg');
    expect(filterContainer?.className).toContain('bg-slate-800');
    const allPill = Array.from(filterContainer?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.trim() === 'All'
    );
    expect(allPill?.className).toContain('bg-slate-700');
    expect(allPill?.className).toContain('text-white');

    // 3. Search input is darkened
    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();
    expect(searchInput.className).toContain('bg-slate-800');
    expect(searchInput.className).toContain('text-white');

    // 4. Transaction row card is dark
    const rowCard = container.querySelector('[data-testid="passbook-entry-sale-inv-1"]');
    expect(rowCard).not.toBeNull();
    expect(rowCard?.className).toContain('bg-slate-800');

    // 5. Primary text is white and secondary text is slate-400
    const primaryLabel = rowCard?.querySelector('.font-bold.text-white');
    expect(primaryLabel).not.toBeNull();
    expect(primaryLabel?.textContent).toContain('Invoice');

    const voucherDocNo = rowCard?.querySelector('.text-slate-400.font-mono');
    expect(voucherDocNo).not.toBeNull();
    expect(voucherDocNo?.textContent).toContain('#INV-1001');

    // Amount colored readability
    const amountEl = rowCard?.querySelector('.font-currency-display-mobile');
    expect(amountEl).not.toBeNull();
    expect(amountEl?.className).toContain('text-blue-400');
  });
});
