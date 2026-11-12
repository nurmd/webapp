import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  comparePassbookEntries,
  usePartyPassbook,
  type PassbookEntry,
  type UsePartyPassbookParams,
} from '../components/Parties/usePartyPassbook.ts';
import type { Party } from '../models/party.ts';
import type { CompanyProfile } from '../models/company.ts';
import type { Voucher } from '../core/accounting/voucherTypes.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SortableEntry = Omit<PassbookEntry, 'runningBalance'>;

const makeEntry = (
  id: string,
  type: SortableEntry['type'],
  amount: number,
  date: string,
  createdAt?: string
): SortableEntry => ({
  id,
  rawId: id,
  date,
  createdAt,
  docNumber: id.toUpperCase(),
  type,
  description: id,
  debit: type === 'PAYMENT_OUT' ? amount : 0,
  credit: type === 'PAYMENT_IN' ? amount : 0,
  status: 'PAID',
});

const makeSupplier = (): Party => ({
  id: 'PARTY-SUP-1',
  name: 'Sanu',
  type: 'SUPPLIER',
  phone: '9999999999',
  stateCode: '27',
  billingAddress: 'Market Road',
  currentBalance: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const makeCompany = (): CompanyProfile => ({
  id: 'COMP-1',
  businessName: 'Acme Enterprises',
  gstin: '27AABCA1234A1Z5',
  pan: 'AABCA1234A',
  email: 'info@acme.com',
  phone: '9999999999',
  address: '123 Market St',
  pincode: '400001',
  stateCode: '27',
  isGstEnabled: true,
});

const makePaymentVoucher = (
  id: string,
  voucherNumber: string,
  amount: number,
  date: string,
  createdAt: string,
  party: Party
): Voucher => ({
  id,
  voucherNumber,
  voucherType: 'PAYMENT',
  date,
  createdAt,
  narration: `Payment to ${party.name}`,
  totalAmount: amount,
  partyId: party.id,
  partyName: party.name,
  entries: [
    {
      accountId: party.id,
      accountName: party.name,
      debit: amount,
      credit: 0,
      narration: `Payment to ${party.name}`,
    },
    {
      accountId: 'ACC_CASH',
      accountName: 'Cash-in-hand',
      debit: 0,
      credit: amount,
      narration: `Payment to ${party.name}`,
    },
  ],
});

describe('comparePassbookEntries tie-breaking', () => {
  it('orders same-day entries deterministically by createdAt and reverses on descending', () => {
    const early = makeEntry('a', 'PAYMENT_OUT', 1000, '2026-11-10', '2026-11-10T09:15:00.000Z');
    const late = makeEntry('b', 'PAYMENT_OUT', 1500, '2026-11-10', '2026-11-10T09:16:00.000Z');

    expect(comparePassbookEntries(early, late, false)).toBeLessThan(0);
    expect(comparePassbookEntries(early, late, true)).toBeGreaterThan(0);
    expect(comparePassbookEntries(early, late, true)).toBe(
      -comparePassbookEntries(early, late, false)
    );
    expect(comparePassbookEntries(late, early, true)).toBeLessThan(0);
  });

  it('falls back to id when date and createdAt are identical', () => {
    const first = makeEntry('vchr-1', 'PAYMENT_OUT', 500, '2026-11-10', '2026-11-10T09:15:00.000Z');
    const second = makeEntry('vchr-2', 'PAYMENT_OUT', 700, '2026-11-10', '2026-11-10T09:15:00.000Z');

    expect(comparePassbookEntries(first, second, false)).toBeLessThan(0);
    expect(comparePassbookEntries(first, second, true)).toBeGreaterThan(0);
  });

  it('keeps the OPENING baseline first ascending and last descending', () => {
    const opening = makeEntry('opening-1', 'OPENING', 0, '2026-01-01');
    const payment = makeEntry('vchr-1', 'PAYMENT_OUT', 500, '2026-11-10', '2026-11-10T09:15:00.000Z');

    expect(comparePassbookEntries(opening, payment, false)).toBeLessThan(0);
    expect(comparePassbookEntries(opening, payment, true)).toBeGreaterThan(0);
  });
});

describe('usePartyPassbook closing balance and total paid', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof usePartyPassbook> | null;

  const Harness = (props: UsePartyPassbookParams) => {
    latest = usePartyPassbook(props);
    return null;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    latest = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows the closing balance on the top NEWEST row for same-day vouchers and counts them in totalPaid', () => {
    const party = makeSupplier();
    const company = makeCompany();
    const vouchers: Voucher[] = [
      makePaymentVoucher('v1', 'PV/1', 150, '2026-11-05', '2026-11-05T19:15:00.000Z', party),
      makePaymentVoucher('v2', 'PV/2', 200, '2026-11-08', '2026-11-08T18:40:00.000Z', party),
      makePaymentVoucher('v3', 'PV/3', 1000, '2026-11-10', '2026-11-10T09:15:20.000Z', party),
      makePaymentVoucher('v4', 'PV/4', 1500, '2026-11-10', '2026-11-10T09:15:40.000Z', party),
    ];

    act(() => {
      root.render(<Harness party={party} company={company} vouchers={vouchers} />);
    });

    expect(latest).not.toBeNull();
    const result = latest!;

    expect(result.totalPaid).toBe(2850);
    expect(result.totalBilled).toBe(0);
    expect(result.passbook).toHaveLength(4);
    // Supplier sign convention: payments out make the running balance negative,
    // so the closing net position is the negated last running balance (advance paid).
    expect(result.passbook[result.passbook.length - 1].runningBalance).toBe(-2850);
    expect(result.liveNetBalance).toBe(2850);

    // NEWEST view must be the exact reverse of the chronological order, so the top row
    // carries the closing running balance rather than a stale one.
    const newest = result.filteredPassbook;
    expect(newest).toHaveLength(4);
    expect(newest[0].id).toBe('vchr-v4');
    expect(newest[0].runningBalance).toBe(-2850);
    expect(newest[newest.length - 1].id).toBe('vchr-v1');
    expect(newest[newest.length - 1].runningBalance).toBe(-150);

    const chronologicalIds = result.passbook.map((e) => e.id);
    expect(newest.map((e) => e.id)).toEqual([...chronologicalIds].reverse());
  });
});
