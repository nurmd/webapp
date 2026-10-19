import { Party } from '../../models/party.ts';
import { pouch } from '../pouchdb.ts';
import { STORAGE_KEYS } from './storageEngine.ts';
import { SettingsStorage } from './settingsStorage.ts';

/**
 * Party and Customer/Supplier Accounts domain storage.
 * Handles party mutations, opening balance management, linear O(P+I+V+U) full sync,
 * and individual party balance recalculations.
 */
export class PartyStorage extends SettingsStorage {
  saveParty(party: Party): void {
    const list = [...this.getParties()];
    const idx = list.findIndex((p) => p.id === party.id);
    let partyToSave = party;
    if (idx >= 0) {
      const existing = list[idx];
      const isExplicitZero = party.openingBalance !== undefined && party.openingBalance === 0;
      partyToSave = {
        ...party,
        openingBalance: isExplicitZero
          ? undefined
          : party.openingBalance !== undefined
          ? party.openingBalance
          : existing.openingBalance,
        openingBalanceType: isExplicitZero
          ? undefined
          : party.openingBalanceType !== undefined
          ? party.openingBalanceType
          : existing.openingBalanceType,
        openingBalanceDate: isExplicitZero
          ? undefined
          : party.openingBalanceDate !== undefined
          ? party.openingBalanceDate
          : existing.openingBalanceDate,
      };
      list[idx] = partyToSave;
    } else {
      if (partyToSave.openingBalance === 0) {
        partyToSave = {
          ...partyToSave,
          openingBalance: undefined,
          openingBalanceType: undefined,
          openingBalanceDate: undefined,
        };
      }
      list.push(partyToSave);
    }
    this.set(STORAGE_KEYS.PARTIES, list);
    pouch.putDoc('party', partyToSave);
    this.broadcastChange('party', 'save', partyToSave.id, partyToSave);
    this.recalculatePartyBalance(partyToSave.id);
    this.notifyListeners();
  }

  clearPartyOpeningBalance(id: string): void {
    const list = this.getParties();
    const idx = list.findIndex((p) => p.id === id);
    if (idx >= 0) {
      const party: Party = {
        ...list[idx],
        openingBalance: undefined,
        openingBalanceType: undefined,
        openingBalanceDate: undefined,
        updatedAt: new Date().toISOString(),
      };
      list[idx] = party;
      this.set(STORAGE_KEYS.PARTIES, list);
      pouch.putDoc('party', party);
      this.broadcastChange('party', 'save', party.id, party);
      this.recalculatePartyBalance(id);
      this.notifyListeners();
    }
  }

  deleteParty(id: string): void {
    const list = this.getParties().filter((p) => p.id !== id);
    this.set(STORAGE_KEYS.PARTIES, list);
    pouch.deleteDoc('party', id);
    this.broadcastChange('party', 'delete', id);
    this.notifyListeners();
  }

  // Recalculate and persist a party's balance based on explicit opening balance and unpaid bills/invoices
  recalculatePartyBalance(partyId: string): number {
    const parties = this.getParties();
    const partyIndex = parties.findIndex((p) => p.id === partyId);
    if (partyIndex < 0) return 0;

    const party = parties[partyIndex];
    const isCustomer = party.type === 'CUSTOMER';
    const partyNameNorm = (party.name || '').trim().toLowerCase();

    // 1. Explicit Opening Balance
    let balance = 0;
    if (typeof party.openingBalance === 'number' && party.openingBalance !== 0) {
      const absAmt = Math.abs(party.openingBalance);
      let opType = party.openingBalanceType;
      if (!opType) {
        if (party.openingBalance > 0) {
          opType = isCustomer ? 'TO_RECEIVE' : 'TO_PAY';
        } else {
          opType = isCustomer ? 'TO_PAY' : 'TO_RECEIVE';
        }
      }
      if (opType === 'TO_RECEIVE') {
        balance += absAmt;
      } else {
        balance -= absAmt;
      }
    }

    if (isCustomer) {
      // Invoices: customer owes remaining unpaid balance (positive = receivable)
      const invoices = this.getInvoices();
      const partyInvoices = invoices.filter(
        (inv) => !inv.isCancelled && (inv.partyId === party.id || (inv.partyName && inv.partyName.trim().toLowerCase() === partyNameNorm))
      );
      partyInvoices.forEach((inv) => {
        // Estimates, Sales Orders, and Delivery Challans do not post to accounting balances
        if (inv.invoiceType === 'ESTIMATE' || inv.invoiceType === 'SALES_ORDER' || inv.invoiceType === 'DELIVERY_CHALLAN') {
          return;
        }
        const unpaid = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : Math.max(0, inv.grandTotal - (inv.paidAmount || 0));
        if (inv.invoiceType === 'CREDIT_NOTE') {
          balance -= unpaid; // Credit Note reduces customer receivable
        } else {
          balance += unpaid;
        }
      });

      // Check for unallocated/advance receipt vouchers
      const vouchers = this.getVouchers();
      const partyReceipts = vouchers.filter(
        (v) =>
          v.voucherType === 'RECEIPT' &&
          v.entries.some((e) => e.accountId === party.id || (e.accountName && e.accountName.toLowerCase() === partyNameNorm))
      );

      const totalReceipts = partyReceipts.reduce((sum, v) => sum + v.totalAmount, 0);
      const totalInvoicePaid = partyInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
      if (totalReceipts > totalInvoicePaid) {
        // Customer paid more than total settled on invoices (advance from customer)
        balance -= (totalReceipts - totalInvoicePaid);
      }
    } else {
      // Purchases: we owe vendor remaining unpaid balance (negative = payable)
      const purchases = this.getPurchases();
      const partyPurchases = purchases.filter(
        (pur) => pur.supplierId === party.id || (pur.supplierName && pur.supplierName.trim().toLowerCase() === partyNameNorm)
      );
      partyPurchases.forEach((pur) => {
        // Purchase Orders do not affect vendor payable balances
        if (pur.purchaseType === 'PO') {
          return;
        }
        const unpaid = typeof pur.balanceAmount === 'number' ? pur.balanceAmount : Math.max(0, pur.grandTotal - (pur.paidAmount || 0));
        if (pur.purchaseType === 'RETURN') {
          balance += unpaid; // Purchase Return Debit Note reduces supplier payable
        } else {
          balance -= unpaid; // Normal purchase bill increases supplier payable
        }
      });

      // Check for unallocated/advance payment out vouchers
      const vouchers = this.getVouchers();
      const partyPayments = vouchers.filter(
        (v) =>
          v.voucherType === 'PAYMENT' &&
          v.entries.some((e) => e.accountId === party.id || (e.accountName && e.accountName.toLowerCase() === partyNameNorm))
      );
      const totalPayments = partyPayments.reduce((sum, v) => sum + v.totalAmount, 0);
      const totalPurchasePaid = partyPurchases.reduce((sum, pur) => sum + (pur.paidAmount || 0), 0);
      if (totalPayments > totalPurchasePaid) {
        // We paid vendor more than total billed on purchases (advance to vendor)
        balance += (totalPayments - totalPurchasePaid);
      }
    }

    const netBalance = Math.round(balance * 100) / 100;
    if (party.currentBalance !== netBalance) {
      party.currentBalance = netBalance;
      party.updatedAt = new Date().toISOString();
      parties[partyIndex] = party;
      this.set(STORAGE_KEYS.PARTIES, parties);
      pouch.putDoc('party', party);
      this.broadcastChange('party', 'save', party.id, party);
      this.notifyListeners();
    }

    return netBalance;
  }

  // Synchronize balances for all parties in linear O(P + I + V + U) time
  syncAllPartyBalances(): void {
    const parties = this.getParties();
    if (!parties.length) return;

    const invoices = this.getInvoices();
    const purchases = this.getPurchases();
    const vouchers = this.getVouchers();

    // 1. Build lookup and accumulator maps: O(P)
    interface PartyAccumulator {
      unpaidInvoicesDelta: number;
      totalInvoicePaid: number;
      unpaidPurchasesDelta: number;
      totalPurchasePaid: number;
      totalReceipts: number;
      totalPayments: number;
    }

    const partyById = new Map<string, Party>();
    const partyByName = new Map<string, Party>();
    const accMap = new Map<string, PartyAccumulator>();

    for (const p of parties) {
      partyById.set(p.id, p);
      if (p.name) {
        partyByName.set(p.name.trim().toLowerCase(), p);
      }
      accMap.set(p.id, {
        unpaidInvoicesDelta: 0,
        totalInvoicePaid: 0,
        unpaidPurchasesDelta: 0,
        totalPurchasePaid: 0,
        totalReceipts: 0,
        totalPayments: 0,
      });
    }

    // 2. Single pass over invoices: O(I)
    for (const inv of invoices) {
      if (inv.isCancelled) continue;
      let party = inv.partyId ? partyById.get(inv.partyId) : undefined;
      if (!party && inv.partyName) {
        party = partyByName.get(inv.partyName.trim().toLowerCase());
      }
      if (!party || party.type !== 'CUSTOMER') continue;

      const acc = accMap.get(party.id);
      if (!acc) continue;

      acc.totalInvoicePaid += (inv.paidAmount || 0);

      if (inv.invoiceType === 'ESTIMATE' || inv.invoiceType === 'SALES_ORDER' || inv.invoiceType === 'DELIVERY_CHALLAN') {
        continue;
      }

      const unpaid = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : Math.max(0, inv.grandTotal - (inv.paidAmount || 0));
      if (inv.invoiceType === 'CREDIT_NOTE') {
        acc.unpaidInvoicesDelta -= unpaid;
      } else {
        acc.unpaidInvoicesDelta += unpaid;
      }
    }

    // 3. Single pass over purchases: O(U)
    for (const pur of purchases) {
      let supplier = pur.supplierId ? partyById.get(pur.supplierId) : undefined;
      if (!supplier && pur.supplierName) {
        supplier = partyByName.get(pur.supplierName.trim().toLowerCase());
      }
      if (!supplier || supplier.type === 'CUSTOMER') continue;

      const acc = accMap.get(supplier.id);
      if (!acc) continue;

      acc.totalPurchasePaid += (pur.paidAmount || 0);

      if (pur.purchaseType === 'PO') continue;

      const unpaid = typeof pur.balanceAmount === 'number' ? pur.balanceAmount : Math.max(0, pur.grandTotal - (pur.paidAmount || 0));
      if (pur.purchaseType === 'RETURN') {
        acc.unpaidPurchasesDelta += unpaid;
      } else {
        acc.unpaidPurchasesDelta -= unpaid;
      }
    }

    // 4. Single pass over vouchers: O(V * E)
    for (const v of vouchers) {
      const isReceipt = v.voucherType === 'RECEIPT';
      const isPayment = v.voucherType === 'PAYMENT';
      if (!isReceipt && !isPayment) continue;

      const matchedPartiesThisVoucher = new Set<string>();

      for (const e of v.entries) {
        let party = e.accountId ? partyById.get(e.accountId) : undefined;
        if (!party && e.accountName) {
          party = partyByName.get(e.accountName.trim().toLowerCase());
        }
        if (!party) continue;

        if (matchedPartiesThisVoucher.has(party.id)) continue;
        matchedPartiesThisVoucher.add(party.id);

        const acc = accMap.get(party.id);
        if (!acc) continue;

        if (isReceipt && party.type === 'CUSTOMER') {
          acc.totalReceipts += v.totalAmount;
        } else if (isPayment && party.type !== 'CUSTOMER') {
          acc.totalPayments += v.totalAmount;
        }
      }
    }

    // 5. Compute balances and update changed parties in a single pass: O(P)
    let hasChanges = false;
    const changedParties: Party[] = [];

    for (let i = 0; i < parties.length; i++) {
      const party = parties[i];
      const isCustomer = party.type === 'CUSTOMER';
      const acc = accMap.get(party.id)!;

      let balance = 0;
      if (typeof party.openingBalance === 'number' && party.openingBalance !== 0) {
        const absAmt = Math.abs(party.openingBalance);
        let opType = party.openingBalanceType;
        if (!opType) {
          opType = party.openingBalance > 0
            ? (isCustomer ? 'TO_RECEIVE' : 'TO_PAY')
            : (isCustomer ? 'TO_PAY' : 'TO_RECEIVE');
        }
        if (opType === 'TO_RECEIVE') {
          balance += absAmt;
        } else {
          balance -= absAmt;
        }
      }

      if (isCustomer) {
        balance += acc.unpaidInvoicesDelta;
        if (acc.totalReceipts > acc.totalInvoicePaid) {
          balance -= (acc.totalReceipts - acc.totalInvoicePaid);
        }
      } else {
        balance += acc.unpaidPurchasesDelta;
        if (acc.totalPayments > acc.totalPurchasePaid) {
          balance += (acc.totalPayments - acc.totalPurchasePaid);
        }
      }

      const netBalance = Math.round(balance * 100) / 100;
      if (party.currentBalance !== netBalance) {
        parties[i] = {
          ...party,
          currentBalance: netBalance,
          updatedAt: new Date().toISOString(),
        };
        changedParties.push(parties[i]);
        hasChanges = true;
      }
    }

    // 6. Single atomic persist and notification
    if (hasChanges) {
      this.set(STORAGE_KEYS.PARTIES, [...parties]);
      changedParties.forEach((p) => {
        pouch.putDoc('party', p);
        this.broadcastChange('party', 'save', p.id, p);
      });
      this.notifyListeners();
    }
  }
}
