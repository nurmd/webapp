import { Party } from '../../models/party.ts';
import { absPaise, addPaise, fromPaise } from '../money.ts';
import { readPaiseOr } from './paisePersistence.ts';

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
  let totalReceivablesPaise = 0;
  let totalPayablesPaise = 0;
  const debtorParties: Party[] = [];
  const creditorParties: Party[] = [];
  const creditCustomers: Party[] = [];
  const advanceSuppliers: Party[] = [];

  for (const party of parties) {
    if (!party) continue;

    const balPaise = readPaiseOr(party, 'currentBalance');

    if (party.type === 'CUSTOMER') {
      if (balPaise > 0) {
        totalReceivablesPaise = addPaise(totalReceivablesPaise, balPaise);
        debtorParties.push(party);
      } else if (balPaise < 0) {
        creditCustomers.push(party);
      }
    } else if (party.type === 'SUPPLIER') {
      if (balPaise < 0) {
        totalPayablesPaise = addPaise(totalPayablesPaise, absPaise(balPaise));
        creditorParties.push(party);
      } else if (balPaise > 0) {
        advanceSuppliers.push(party);
      }
    }
  }

  return {
    totalReceivables: fromPaise(totalReceivablesPaise),
    totalPayables: fromPaise(totalPayablesPaise),
    debtorParties,
    creditorParties,
    creditCustomers,
    advanceSuppliers,
  };
}
