import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PartyInfoCard } from '../components/Parties/PartyInfoCard.tsx';
import { PartyDetailModal } from '../components/Parties/PartyDetailModal.tsx';
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

    // The collapsible container starts closed (collapsed with max-w-0 pointer-events-none)
    const collapsibleContainer = toggleBtn.previousElementSibling as HTMLElement;
    expect(collapsibleContainer).not.toBeNull();
    expect(collapsibleContainer.className).toContain('max-w-0');
    expect(collapsibleContainer.className).toContain('pointer-events-none');
    expect(collapsibleContainer.className).toContain('transition-all');

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

    // When toggle button is clicked: container slides out (expands to max-w-[280px], opacity-100, aria-expanded=true)
    await act(async () => {
      toggleBtn.click();
    });

    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(collapsibleContainer.className).toContain('max-w-[280px]');
    expect(collapsibleContainer.className).toContain('opacity-100');
    expect(collapsibleContainer.className).not.toContain('pointer-events-none');

    // When clicked again: collapses back
    await act(async () => {
      toggleBtn.click();
    });

    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(collapsibleContainer.className).toContain('max-w-0');
    expect(collapsibleContainer.className).toContain('pointer-events-none');
  });
});
