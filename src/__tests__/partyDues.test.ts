import { describe, expect, it } from 'vitest';
import { computePartyDues } from '../core/accounting/partyDues.ts';
import type { Party } from '../models/party.ts';

const makeParty = (overrides: Partial<Party>): Party => ({
  id: 'PTY-TEST',
  name: 'Test Party',
  type: 'CUSTOMER',
  phone: '',
  stateCode: '18',
  billingAddress: '',
  currentBalance: 0,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  ...overrides,
});

describe('computePartyDues', () => {
  it('keeps customer credits and supplier advances out of due totals', () => {
    const summary = computePartyDues([
      makeParty({ id: 'C-1', name: 'Customer Due', currentBalance: 5000 }),
      makeParty({ id: 'C-2', name: 'Customer Credit', currentBalance: -500 }),
      makeParty({ id: 'S-1', name: 'Supplier Due', type: 'SUPPLIER', currentBalance: -3000 }),
      makeParty({ id: 'S-2', name: 'Supplier Advance', type: 'SUPPLIER', currentBalance: 200 }),
      makeParty({ id: 'C-3', name: 'Settled Customer', currentBalance: 0 }),
    ]);

    expect(summary.totalReceivables).toBe(5000);
    expect(summary.totalPayables).toBe(3000);
    expect(summary.debtorParties.map((p) => p.id)).toEqual(['C-1']);
    expect(summary.creditorParties.map((p) => p.id)).toEqual(['S-1']);
    expect(summary.creditCustomers.map((p) => p.id)).toEqual(['C-2']);
    expect(summary.advanceSuppliers.map((p) => p.id)).toEqual(['S-2']);
  });
});
