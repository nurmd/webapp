import { Party } from '../../models/party.ts';

export interface PartyDuesSummary {
  totalReceivables: number;
  totalPayables: number;
  debtorParties: Party[];
  creditorParties: Party[];
  creditCustomers: Party[];
  advanceSuppliers: Party[];
}

/**
 * Single source of truth for party due totals.
 *
 * Receivables are positive customer balances. Payables are negative supplier
 * balances. A negative customer balance is a customer credit, and a positive
 * supplier balance is an advance paid; neither belongs in the supplier/customer
 * due totals, but both are surfaced separately so the party filter counts remain
 * complete.
 */
export function computePartyDues(parties: Party[] = []): PartyDuesSummary {
  let totalReceivables = 0;
  let totalPayables = 0;
  const debtorParties: Party[] = [];
  const creditorParties: Party[] = [];
  const creditCustomers: Party[] = [];
  const advanceSuppliers: Party[] = [];

  for (const party of parties) {
    if (!party) continue;

    if (party.type === 'CUSTOMER') {
      if (party.currentBalance > 0) {
        totalReceivables += party.currentBalance;
        debtorParties.push(party);
      } else if (party.currentBalance < 0) {
        creditCustomers.push(party);
      }
    } else if (party.type === 'SUPPLIER') {
      if (party.currentBalance < 0) {
        totalPayables += Math.abs(party.currentBalance);
        creditorParties.push(party);
      } else if (party.currentBalance > 0) {
        advanceSuppliers.push(party);
      }
    }
  }

  return {
    totalReceivables,
    totalPayables,
    debtorParties,
    creditorParties,
    creditCustomers,
    advanceSuppliers,
  };
}
