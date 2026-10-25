import type { Party } from '../../models/party.ts';
import type { Invoice } from '../../models/invoice.ts';

export const SYSTEM_WALK_IN_PARTY_ID = 'CUSTOM_PARTY';
export const SYSTEM_WALK_IN_PARTY_NAME = 'Walk-in Customer';

/**
 * Normalized variants of walk-in counter customer names used historically in the app.
 */
export const WALK_IN_VARIANTS = new Set([
  'walk-in customer',
  'walk in customer',
  'walk-in retail customer',
  'walk in retail customer',
  'walk-in cash guest',
  'walk in cash guest',
  'cash / retail customer',
  'cash/retail customer',
  'cash counter customer',
  'walk-in',
  'walk in',
]);

/**
 * Checks whether an invoice belongs to the system walk-in customer either by ID
 * or by known historical walk-in name variants.
 */
export function isWalkInInvoice(inv: { partyId?: string; partyName?: string }): boolean {
  if (inv.partyId === SYSTEM_WALK_IN_PARTY_ID) return true;
  if (!inv.partyName) return false;
  const normalized = inv.partyName.trim().toLowerCase();
  return WALK_IN_VARIANTS.has(normalized);
}

/**
 * Checks if a party object or party ID corresponds to a built-in system party.
 */
export function isSystemParty(partyOrId: Party | string | null | undefined): boolean {
  if (!partyOrId) return false;
  if (typeof partyOrId === 'string') {
    return partyOrId === SYSTEM_WALK_IN_PARTY_ID;
  }
  return partyOrId.id === SYSTEM_WALK_IN_PARTY_ID || partyOrId.isSystem === true;
}

/**
 * Creates the built-in system Walk-in Customer party.
 */
export function createWalkInCustomer(
  companyStateCode: string = '27',
  currentBalance: number = 0
): Party {
  return {
    id: SYSTEM_WALK_IN_PARTY_ID,
    name: SYSTEM_WALK_IN_PARTY_NAME,
    type: 'CUSTOMER',
    phone: '',
    email: '',
    gstin: undefined,
    stateCode: companyStateCode || '27',
    billingAddress: 'Local Counter',
    openingBalance: 0,
    currentBalance,
    isSystem: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

/**
 * Computes the virtual running balance for the walk-in customer from
 * active, unpaid, non-cancelled invoices.
 */
export function computeWalkInVirtualBalance(invoices: Invoice[] = []): number {
  let balance = 0;
  for (const inv of invoices) {
    if (inv && !inv.isCancelled && (inv.balanceAmount || 0) > 0) {
      if (isWalkInInvoice(inv)) {
        balance += inv.balanceAmount || 0;
      }
    }
  }
  return Math.round(balance * 100) / 100;
}

/**
 * Pure resolver that merges the built-in Walk-in Customer into the party catalog.
 *
 * Requirements:
 * - If a party with id === 'CUSTOM_PARTY' already exists, mark it as system and preserve its stored balance; do not duplicate.
 * - If it does not exist, synthesize the virtual party with currentBalance computed from historical walk-in invoices.
 * - Pinned at index 0 for the Customers list.
 * - Produces referentially stable output for identical inputs.
 */
export function withWalkInCustomer(
  parties: Party[],
  companyStateCode: string = '27',
  invoices: Invoice[] = []
): Party[] {
  const existingIndex = parties.findIndex((p) => p.id === SYSTEM_WALK_IN_PARTY_ID);

  if (existingIndex >= 0) {
    const existing = parties[existingIndex];
    if (existing.isSystem) {
      return parties;
    }
    // Return shallow copy with isSystem set to true on the existing record
    const updated = [...parties];
    updated[existingIndex] = { ...existing, isSystem: true };
    return updated;
  }

  const virtualBalance = computeWalkInVirtualBalance(invoices);
  const walkInParty = createWalkInCustomer(companyStateCode, virtualBalance);

  // Return walk-in customer merged with existing catalog
  return [walkInParty, ...parties];
}
