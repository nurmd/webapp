// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PartyPaymentPreviewModal } from '../components/Parties/PartyPaymentPreviewModal.tsx';
import { PartyDetailModal } from '../components/Parties/PartyDetailModal.tsx';
import { PassbookEntry } from '../components/Parties/usePartyPassbook.ts';
import { Party } from '../models/party.ts';
import { CompanyProfile } from '../models/company.ts';
import { db } from '../services/db.ts';

const mockCompany: CompanyProfile = {
  id: 'comp-1',
  businessName: 'Apex General Trading',
  tradeName: 'Apex Store',
  isGstEnabled: true,
  gstin: '27AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  stateCode: '27',
  address: 'MG Road, Pune',
  pincode: '411001',
  phone: '9876543210',
  email: 'info@apex.com',
};

const mockCustomerParty: Party = {
  id: 'cust-1',
  name: 'Rajesh Sharma',
  type: 'CUSTOMER',
  phone: '9822334455',
  gstin: '27BBBBB1111B1Z2',
  stateCode: '27',
  billingAddress: 'MG Road, Pune',
  openingBalance: 2000,
  openingBalanceType: 'TO_RECEIVE',
  currentBalance: 8000,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockPaymentInEntry: PassbookEntry = {
  id: 'vchr-pay-101',
  rawId: 'pay-101',
  date: '2026-10-28',
  docNumber: 'RCPT-2026-001',
  type: 'PAYMENT_IN',
  description: 'Part payment received for Diwali order',
  debit: 0,
  credit: 15000,
  runningBalance: 5000,
  paymentMode: 'BANK',
  status: 'PAID',
  rawVoucher: {
    id: 'pay-101',
    voucherNumber: 'RCPT-2026-001',
    voucherType: 'RECEIPT',
    date: '2026-10-28',
    totalAmount: 15000,
    narration: 'Part payment received for Diwali order',
    createdAt: '2026-10-28T10:00:00.000Z',
    partyId: 'cust-1',
    partyName: 'Rajesh Sharma',
    paymentAllocations: [
      {
        documentId: 'inv-101',
        documentNumber: '#INV-2026-099',
        documentType: 'INVOICE',
        amount: 15000,
      },
    ],
    entries: [
      {
        accountId: 'bank-1',
        accountName: 'HDFC Current A/C',
        debit: 15000,
        credit: 0,
      },
      {
        accountId: 'cust-1',
        accountName: 'Rajesh Sharma',
        debit: 0,
        credit: 15000,
      },
    ],
  },
};

const mockPaymentOutEntry: PassbookEntry = {
  id: 'vchr-pay-202',
  rawId: 'pay-202',
  date: '2026-10-29',
  docNumber: 'PAY-2026-005',
  type: 'PAYMENT_OUT',
  description: 'Supplier advance payment',
  debit: 8500,
  credit: 0,
  runningBalance: -3500,
  paymentMode: 'UPI',
  status: 'PAID',
};

const mockOpeningEntry: PassbookEntry = {
  id: 'open-cust-1',
  date: '2026-01-01',
  docNumber: 'OPENING',
  type: 'OPENING',
  description: 'Opening balance baseline',
  debit: 2000,
  credit: 0,
  runningBalance: 2000,
  status: 'OPENING',
  isOpening: true,
};

describe('PartyPaymentPreviewModal — Sleek Unified Inset Preview', () => {
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

  it('renders standard preview layout for PAYMENT_IN: delete top-left, edit top-right, body with amount & linked docs, actions bottom', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onClose = vi.fn();

    act(() => {
      root.render(
        <PartyPaymentPreviewModal
          entry={mockPaymentInEntry}
          party={mockCustomerParty}
          company={mockCompany}
          isOpen={true}
          onClose={onClose}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      );
    });

    // 1. Top-left: Delete button
    const deleteBtn = container.querySelector('[data-testid="delete-payment-btn"]') as HTMLButtonElement;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn.getAttribute('aria-label')).toBe('Delete transaction');

    // 2. Top-right: Edit button next to close
    const editBtn = container.querySelector('[data-testid="edit-payment-btn"]') as HTMLButtonElement;
    expect(editBtn).not.toBeNull();
    expect(editBtn.textContent).toContain('Edit');

    const closeBtn = container.querySelector('button[aria-label="Close transaction details"]');
    expect(closeBtn).not.toBeNull();

    // 3. Header title and status pill
    expect(container.textContent).toContain('Payment In #RCPT-2026-001');
    expect(container.textContent).toContain('PAID');

    // 4. Body: Party details
    expect(container.textContent).toContain('Rajesh Sharma');
    expect(container.textContent).toContain('9822334455');
    expect(container.textContent).toContain('27BBBBB1111B1Z2');

    // 5. Body: Amount card & payment mode
    expect(container.textContent).toContain('+ ₹ 15,000.00');
    expect(container.textContent).toContain('BANK');

    // 6. Body: Linked documents
    expect(container.textContent).toContain('Linked Documents (1)');
    expect(container.textContent).toContain('#INV-2026-099');

    // 7. Body: Notes and ledger balance impact
    expect(container.textContent).toContain('Part payment received for Diwali order');
    expect(container.textContent).toContain('Party Ledger Balance after Entry');
    expect(container.textContent).toContain('₹ 5,000.00');

    // 8. Bottom actions: WhatsApp and Print
    const printBtn = container.querySelector('[data-testid="print-payment-btn"]');
    const whatsappBtn = container.querySelector('[data-testid="whatsapp-payment-btn"]');
    expect(printBtn).not.toBeNull();
    expect(whatsappBtn).not.toBeNull();
  });

  it('clicking Edit invokes onEdit with the entry', () => {
    const onEdit = vi.fn();
    const onClose = vi.fn();

    act(() => {
      root.render(
        <PartyPaymentPreviewModal
          entry={mockPaymentInEntry}
          party={mockCustomerParty}
          company={mockCompany}
          isOpen={true}
          onClose={onClose}
          onEdit={onEdit}
        />
      );
    });

    const editBtn = container.querySelector('[data-testid="edit-payment-btn"]') as HTMLButtonElement;
    act(() => {
      editBtn.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(mockPaymentInEntry);
  });

  it('clicking Delete prompts confirmation dialog before calling onDelete', () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();

    act(() => {
      root.render(
        <PartyPaymentPreviewModal
          entry={mockPaymentInEntry}
          party={mockCustomerParty}
          company={mockCompany}
          isOpen={true}
          onClose={onClose}
          onDelete={onDelete}
        />
      );
    });

    const deleteBtn = container.querySelector('[data-testid="delete-payment-btn"]') as HTMLButtonElement;
    act(() => {
      deleteBtn.click();
    });

    // Confirmation dialog appears
    expect(container.textContent).toContain('Delete Transaction?');
    expect(onDelete).not.toHaveBeenCalled();

    // Confirm delete
    const confirmButtons = Array.from(container.querySelectorAll('button'));
    const confirmBtn = confirmButtons.find((b) => b.textContent?.includes('Delete Transaction'));
    expect(confirmBtn).toBeDefined();

    act(() => {
      confirmBtn!.click();
    });

    expect(onDelete).toHaveBeenCalledWith(mockPaymentInEntry);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders PAYMENT_OUT with negative outflow amount formatting', () => {
    act(() => {
      root.render(
        <PartyPaymentPreviewModal
          entry={mockPaymentOutEntry}
          party={mockCustomerParty}
          company={mockCompany}
          isOpen={true}
          onClose={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain('Payment Out #PAY-2026-005');
    expect(container.textContent).toContain('− ₹ 8,500.00');
    expect(container.textContent).toContain('UPI');
  });

  it('renders OPENING entry with clear baseline messaging', () => {
    const onDelete = vi.fn();
    act(() => {
      root.render(
        <PartyPaymentPreviewModal
          entry={mockOpeningEntry}
          party={mockCustomerParty}
          company={mockCompany}
          isOpen={true}
          onClose={vi.fn()}
          onDelete={onDelete}
        />
      );
    });

    expect(container.textContent).toContain('Opening Balance');
    expect(container.textContent).toContain('Opening Amount');
    expect(container.textContent).toContain('₹ 2,000.00');

    // Delete button prompts to clear opening balance
    const deleteBtn = container.querySelector('[data-testid="delete-payment-btn"]') as HTMLButtonElement;
    act(() => {
      deleteBtn.click();
    });

    expect(container.textContent).toContain('Clear Opening Balance?');
  });

  it('PartyDetailModal integration: clicking a payment row opens PartyPaymentPreviewModal', async () => {
    db.saveParty(mockCustomerParty);

    await act(async () => {
      root.render(
        <PartyDetailModal
          party={mockCustomerParty}
          company={mockCompany}
          invoices={[]}
          purchases={[]}
          vouchers={[mockPaymentInEntry.rawVoucher!]}
          isOpen={true}
          onEditParty={vi.fn()}
          onDeleteParty={vi.fn()}
          onRecordPayment={vi.fn()}
        />
      );
    });

    const paymentRow = container.querySelector(`[data-testid="passbook-entry-${mockPaymentInEntry.id}"]`) as HTMLElement;
    expect(paymentRow).not.toBeNull();

    await act(async () => {
      paymentRow.click();
    });

    // Wait for lazy import of PartyPaymentPreviewModal
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Modal controls toolbar is present
    expect(container.querySelector('[data-testid="delete-payment-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="edit-payment-btn"]')).not.toBeNull();
    expect(container.textContent).toContain('Payment In #RCPT-2026-001');
    expect(container.textContent).toContain('Linked Documents (1)');
  });
});
