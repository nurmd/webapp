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

  it('Requirement 1 & 4: PartyInfoCard has light high-contrast background and sticky non-wrapping Total Bill/Paid metrics', () => {
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
    // 1. Light surface background and on-surface text
    expect(card?.className).toContain('bg-white');
    expect(card?.className).toContain('text-on-surface');

    // Balance amount has high-contrast slate-900 text
    const balanceAmount = container.querySelector('.font-currency-display-mobile');
    expect(balanceAmount).not.toBeNull();
    expect(balanceAmount?.className).toContain('text-slate-900');

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

  it('Requirement: PartyPassbookTable outer section is light slate-50, while individual transaction cards are white surfaces', () => {
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

    // 1. Outer transaction list section is light surface
    const tableSection = container.querySelector('section');
    expect(tableSection).not.toBeNull();
    expect(tableSection?.className).toContain('bg-slate-50');
    expect(tableSection?.className).toContain('border-outline-variant/20');

    // 2. Filter pills & search input are light theme
    const filterContainer = container.querySelector('.inline-flex.rounded-lg');
    expect(filterContainer?.className).toContain('bg-surface-container');
    const allPill = Array.from(filterContainer?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.trim() === 'All'
    );
    expect(allPill?.className).toContain('bg-surface-container-lowest');
    expect(allPill?.className).toContain('text-on-surface');

    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();
    expect(searchInput.className).toContain('bg-surface-container-low');
    expect(searchInput.className).toContain('text-on-surface');

    // 3. Individual transaction row card is white surface and stands out against the light section
    const rowCard = container.querySelector('[data-testid="passbook-entry-sale-inv-1"]');
    expect(rowCard).not.toBeNull();
    expect(rowCard?.className).toContain('bg-white');

    // 4. Primary text is slate-900 and secondary text is slate-600/slate-500
    const primaryLabel = rowCard?.querySelector('.font-bold.text-slate-900');
    expect(primaryLabel).not.toBeNull();
    expect(primaryLabel?.textContent).toContain('Invoice');

    const voucherDocNo = rowCard?.querySelector('.text-slate-600.font-mono');
    expect(voucherDocNo).not.toBeNull();
    expect(voucherDocNo?.textContent).toContain('#INV-1001');

    // Amount colored readability
    const amountEl = rowCard?.querySelector('.font-currency-display-mobile');
    expect(amountEl).not.toBeNull();
    expect(amountEl?.className).toContain('text-blue-700');
  });

  it('PartyInfoCard renders Record Payment and New Invoice right-aligned in sub-metrics bar, and omits opening balance chip and drawer row', () => {
    const onRecordPayment = vi.fn();
    const onCreateInvoice = vi.fn();
    const partyWithOpeningBalance: Party = {
      ...mockParty,
      openingBalance: 4500,
      openingBalanceType: 'TO_RECEIVE',
      openingBalanceDate: '2026-01-01',
    };

    act(() => {
      root.render(
        <PartyInfoCard
          party={partyWithOpeningBalance}
          company={mockCompany}
          liveNetBalance={4500}
          isReceivable={true}
          isPayable={false}
          totalBilled={10000}
          totalPaid={5500}
          showPartyDetails={true}
          setShowPartyDetails={vi.fn()}
          onEditParty={vi.fn()}
          isCustomer={true}
          isPaymentOpen={false}
          onRecordPayment={onRecordPayment}
          onCreateInvoice={onCreateInvoice}
        />
      );
    });

    // 1. Total Bill and Total Paid on the left
    expect(container.textContent).toContain('Total Bill:');
    expect(container.textContent).toContain('Total Paid:');

    // 2. Action buttons on the right inside sub-metrics bar
    const recordPaymentBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Record Payment')
    );
    expect(recordPaymentBtn).toBeDefined();

    const newInvoiceBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('New Invoice')
    );
    expect(newInvoiceBtn).toBeDefined();

    act(() => {
      recordPaymentBtn?.click();
    });
    expect(onRecordPayment).toHaveBeenCalledTimes(1);

    act(() => {
      newInvoiceBtn?.click();
    });
    expect(onCreateInvoice).toHaveBeenCalledWith(partyWithOpeningBalance);

    // 3. Opening balance info chip is removed
    expect(container.textContent).not.toContain('Opening Balance:');
    expect(container.textContent).not.toContain('(To Receive)');
  });

  it('PartyDetailModal wires action buttons to PartyInfoCard and toggles RecordPaymentModal', async () => {
    db.saveParty(mockParty);
    const onCreateInvoice = vi.fn();

    await act(async () => {
      root.render(
        <PartyDetailModal
          party={mockParty}
          company={mockCompany}
          invoices={[]}
          purchases={[]}
          vouchers={[]}
          isOpen={true}
          onEditParty={vi.fn()}
          onDeleteParty={vi.fn()}
          onRecordPayment={vi.fn()}
          onCreateInvoice={onCreateInvoice}
        />
      );
    });

    // Separate "Quick Actions Bar" section is removed, action buttons reside in PartyInfoCard
    const recordPaymentButtons = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.includes('Record Payment')
    );
    // Both mobile and desktop PartyInfoCard have the button
    expect(recordPaymentButtons.length).toBeGreaterThanOrEqual(1);

    // Clicking Record Payment opens the collapsible RecordPaymentModal drawer
    await act(async () => {
      recordPaymentButtons[0].click();
    });

    expect(container.textContent).toContain('Save Payment In');
    expect(container.textContent).toContain('Payment Mode');
  });

  it('Phase 5: Party action buttons are responsive (in-card on mobile < md, standalone section on desktop md:+)', async () => {
    db.saveParty(mockParty);
    const onCreateInvoice = vi.fn();

    await act(async () => {
      root.render(
        <PartyDetailModal
          party={mockParty}
          company={mockCompany}
          invoices={[]}
          purchases={[]}
          vouchers={[]}
          isOpen={true}
          onEditParty={vi.fn()}
          onDeleteParty={vi.fn()}
          onRecordPayment={vi.fn()}
          onCreateInvoice={onCreateInvoice}
        />
      );
    });

    // In PartyInfoCard, the sub-metrics action buttons container has md:hidden
    const cardActionContainers = Array.from(container.querySelectorAll('.justify-end')).filter(
      (el) => el.className.includes('md:hidden')
    );
    expect(cardActionContainers.length).toBeGreaterThanOrEqual(1);

    // In PartyDetailModal, the desktop action bar below PartyInfoCard has hidden md:flex
    const desktopActionBar = container.querySelector('section.hidden.md\\:flex');
    expect(desktopActionBar).not.toBeNull();
    expect(desktopActionBar?.textContent).toContain('Record Payment');
    expect(desktopActionBar?.textContent).toContain('New Invoice');
  });

  it('renders Line 1 as a strict single-line flex-nowrap row keeping status badge inline with long voucher types', () => {
    const mockEntries: any[] = [
      {
        id: 'vchr-pay-in-1',
        rawId: 'pay-in-1',
        date: '2026-10-28',
        type: 'PAYMENT_IN',
        description: 'Payment In received via bank transfer',
        debit: 0,
        credit: 15000,
        runningBalance: -10000,
        docNumber: 'RCPT-2026-0045',
        status: 'PAID',
        rawVoucher: {
          id: 'pay-in-1',
          voucherNumber: 'RCPT-2026-0045',
          voucherType: 'RECEIPT',
          totalAmount: 15000,
          date: '2026-10-28',
        },
      },
      {
        id: 'sale-inv-long-1',
        rawId: 'inv-long-1',
        date: '2026-10-28',
        type: 'SALE',
        description: 'Tax Invoice with partial settlement',
        debit: 25000,
        credit: 0,
        runningBalance: 15000,
        docNumber: 'INV-2026-0999',
        status: 'PARTIAL',
        rawInvoice: {
          id: 'inv-long-1',
          invoiceNumber: 'INV-2026-0999',
          grandTotal: 25000,
          balanceAmount: 10000,
          paidAmount: 15000,
          invoiceType: 'TAX_INVOICE',
        },
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

    const paymentRow = container.querySelector('[data-testid="passbook-entry-vchr-pay-in-1"]');
    expect(paymentRow).not.toBeNull();

    // Status badge moved above the transaction amount (right column)
    const badgeEl = Array.from(paymentRow?.querySelectorAll('span') || []).find(
      (el) => el.textContent?.trim() === 'PAID'
    );
    expect(badgeEl).toBeDefined();
    expect(badgeEl?.className).toContain('rounded-full');
    expect(badgeEl?.className).not.toContain('absolute');

    // Line 1 (first line): voucher type with invoice number (freed of date & badge)
    const voucherTypeEl = Array.from(paymentRow?.querySelectorAll('span') || []).find(
      (el) => el.textContent?.trim() === 'Payment In'
    );
    expect(voucherTypeEl).toBeDefined();
    expect(voucherTypeEl?.className).toContain('whitespace-nowrap');
    expect(voucherTypeEl?.className).toContain('shrink-0');

    // Invoice number moved to top line
    const invNoEl = Array.from(paymentRow?.querySelectorAll('span') || []).find(
      (el) => el.textContent?.includes('RCPT-2026-0045')
    );
    expect(invNoEl).not.toBeNull();

    // Middle line: date
    const dateEl = Array.from(paymentRow?.querySelectorAll('span') || []).find(
      (el) => el.textContent?.trim() === '2026-10-28'
    );
    expect(dateEl).not.toBeNull();
    expect(dateEl?.textContent).toContain('2026-10-28');

    // Partial badge on invoice row also in top-left corner
    const invoiceRow = container.querySelector('[data-testid="passbook-entry-sale-inv-long-1"]');
    expect(invoiceRow).not.toBeNull();
    const partialBadge = Array.from(invoiceRow?.querySelectorAll('span') || []).find(
      (el) => el.textContent?.trim() === 'PARTIAL'
    );
    expect(partialBadge).toBeDefined();
    expect(partialBadge?.className).toContain('rounded-full');
    expect(partialBadge?.className).not.toContain('absolute');
  });
});
