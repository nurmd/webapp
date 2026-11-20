import { Party, PartyGroup, PartyCategory } from '../../models/party.ts';
import { pouch } from '../pouchdb.ts';
import { auditTrail } from '../auditTrail.ts';
import { STORAGE_KEYS } from './storageEngine.ts';
import { SettingsStorage } from './settingsStorage.ts';
import {
  normalizeEntityName,
  findDuplicateParty,
  DuplicateEntityNameError,
} from '../../core/utils/entityUniqueness.ts';
import { attachPaiseFields } from '../../core/accounting/paisePersistence.ts';
import { toPaise, fromPaise } from '../../core/money.ts';

/**
 * Party and Customer/Supplier Accounts domain storage.
 * Handles party mutations, opening balance management, linear O(P+I+V+U) full sync,
 * and individual party balance recalculations.
 */
export class PartyStorage extends SettingsStorage {
  saveParty(party: Party, allowDuplicateName?: boolean | { allowDuplicateName?: boolean }): void {
    party = attachPaiseFields(party, 'party');
    const skipDuplicateCheck =
      typeof allowDuplicateName === 'boolean'
        ? allowDuplicateName
        : Boolean(allowDuplicateName?.allowDuplicateName);

    const list = [...this.getParties()];
    const idx = list.findIndex((p) => p.id === party.id);
    const prevParty = idx >= 0 ? list[idx] : null;

    if (!skipDuplicateCheck && party.name) {
      const normNewName = normalizeEntityName(party.name);
      if (normNewName) {
        const isNew = idx < 0;
        const nameChanged = prevParty ? normalizeEntityName(prevParty.name) !== normNewName : true;
        if (isNew || nameChanged) {
          const duplicate = findDuplicateParty(party.name, list, party.id);
          if (duplicate) {
            throw new DuplicateEntityNameError('party', party.name, duplicate.id);
          }
        }
      }
    }

    let partyToSave = party;
    if (idx >= 0) {
      const existing = list[idx];
      const isExplicitZero = party.openingBalance !== undefined && party.openingBalance === 0;
      partyToSave = {
        ...party,
        groupId: 'groupId' in party ? (party.groupId || undefined) : existing.groupId,
        categoryId: 'categoryId' in party ? (party.categoryId || undefined) : existing.categoryId,
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
    this.removeTombstone('party', partyToSave.id);
    this.set(STORAGE_KEYS.PARTIES, list);
    this.backgroundPouchPut('party', partyToSave);
    this.broadcastChange('party', 'save', partyToSave.id, partyToSave);

    // MCA Audit Trail Hook
    const auditUser = this.getAuditUser();
    const actionType = prevParty ? 'PARTY_UPDATE' : 'PARTY_CREATE';
    const summary = `${prevParty ? 'Updated' : 'Created'} ${partyToSave.type.toLowerCase()} "${partyToSave.name}" (Balance: ₹${partyToSave.currentBalance || 0})`;
    auditTrail
      .logEvent({
        userId: auditUser.userId,
        userName: auditUser.userName,
        userRole: auditUser.userRole,
        actionType,
        documentId: partyToSave.id,
        documentType: 'PARTY',
        previousSnapshot: prevParty ? JSON.parse(JSON.stringify(prevParty)) : undefined,
        newSnapshot: JSON.parse(JSON.stringify(partyToSave)),
        summary,
      })
      .catch((err) => console.error('Audit log failed for saveParty:', err));

    this.recalculatePartyBalance(partyToSave.id);
    this.notifyListeners();
  }

  // Party Groups Management
  getPartyGroups(): PartyGroup[] {
    return this.get<PartyGroup[]>(STORAGE_KEYS.PARTY_GROUPS, []);
  }

  savePartyGroup(group: PartyGroup): PartyGroup {
    const trimmedName = (group.name || '').trim();
    if (!trimmedName) {
      throw new Error('Party group name cannot be empty');
    }

    const list = [...this.getPartyGroups()];
    const idx = list.findIndex((g) => g.id === group.id);
    const duplicate = list.find(
      (g) => g.id !== group.id && g.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A party group named "${trimmedName}" already exists`);
    }

    const savedGroup: PartyGroup = {
      ...group,
      name: trimmedName,
      description: group.description?.trim() || undefined,
      color: group.color?.trim() || undefined,
      createdAt: (idx >= 0 && list[idx].createdAt) || group.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (idx >= 0) {
      list[idx] = savedGroup;
    } else {
      list.push(savedGroup);
    }

    this.removeTombstone('party_group', savedGroup.id);
    this.set(STORAGE_KEYS.PARTY_GROUPS, list);
    this.backgroundPouchPut('party_group', savedGroup);
    this.broadcastChange('party_group', 'save', savedGroup.id, savedGroup);

    // MCA Audit Trail Hook
    const auditUser = this.getAuditUser();
    auditTrail
      .logEvent({
        userId: auditUser.userId,
        userName: auditUser.userName,
        userRole: auditUser.userRole,
        actionType: idx >= 0 ? 'PARTY_UPDATE' : 'PARTY_CREATE',
        documentId: savedGroup.id,
        documentType: 'PARTY',
        previousSnapshot: idx >= 0 ? JSON.parse(JSON.stringify(list[idx])) : undefined,
        newSnapshot: JSON.parse(JSON.stringify(savedGroup)),
        summary: `${idx >= 0 ? 'Updated' : 'Created'} party group "${savedGroup.name}"`,
      })
      .catch((err) => console.error('Audit log failed for savePartyGroup:', err));

    this.notifyListeners();
    return savedGroup;
  }

  deletePartyGroup(id: string): void {
    const list = this.getPartyGroups().filter((g) => g.id !== id);
    this.recordTombstone('party_group', id);
    this.set(STORAGE_KEYS.PARTY_GROUPS, list);
    this.backgroundPouchDelete('party_group', id);

    // Unassign this group from all parties referencing it; never delete parties
    const parties = this.getParties();
    let partiesChanged = false;
    const updatedParties = parties.map((p) => {
      if (p.groupId === id) {
        partiesChanged = true;
        const updated: Party = { ...p, groupId: undefined, updatedAt: new Date().toISOString() };
        this.backgroundPouchPut('party', updated);
        this.broadcastChange('party', 'save', updated.id, updated);
        return updated;
      }
      return p;
    });

    if (partiesChanged) {
      this.set(STORAGE_KEYS.PARTIES, updatedParties);
    }

    this.broadcastChange('party_group', 'delete', id);
    this.notifyListeners();
  }

  // Party Categories Management
  getPartyCategories(): PartyCategory[] {
    return this.get<PartyCategory[]>(STORAGE_KEYS.PARTY_CATEGORIES, []);
  }

  savePartyCategory(category: PartyCategory): PartyCategory {
    const trimmedName = (category.name || '').trim();
    if (!trimmedName) {
      throw new Error('Party category name cannot be empty');
    }

    const list = [...this.getPartyCategories()];
    const idx = list.findIndex((c) => c.id === category.id);
    const duplicate = list.find(
      (c) => c.id !== category.id && c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A party category named "${trimmedName}" already exists`);
    }

    const savedCat: PartyCategory = {
      ...category,
      name: trimmedName,
      description: category.description?.trim() || undefined,
      color: category.color?.trim() || undefined,
      createdAt: (idx >= 0 && list[idx].createdAt) || category.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (idx >= 0) {
      list[idx] = savedCat;
    } else {
      list.push(savedCat);
    }

    this.removeTombstone('party_category', savedCat.id);
    this.set(STORAGE_KEYS.PARTY_CATEGORIES, list);
    this.backgroundPouchPut('party_category', savedCat);
    this.broadcastChange('party_category', 'save', savedCat.id, savedCat);

    // MCA Audit Trail Hook
    const auditUser = this.getAuditUser();
    auditTrail
      .logEvent({
        userId: auditUser.userId,
        userName: auditUser.userName,
        userRole: auditUser.userRole,
        actionType: idx >= 0 ? 'PARTY_UPDATE' : 'PARTY_CREATE',
        documentId: savedCat.id,
        documentType: 'PARTY',
        previousSnapshot: idx >= 0 ? JSON.parse(JSON.stringify(list[idx])) : undefined,
        newSnapshot: JSON.parse(JSON.stringify(savedCat)),
        summary: `${idx >= 0 ? 'Updated' : 'Created'} party category "${savedCat.name}"`,
      })
      .catch((err) => console.error('Audit log failed for savePartyCategory:', err));

    this.notifyListeners();
    return savedCat;
  }

  deletePartyCategory(id: string): void {
    const list = this.getPartyCategories().filter((c) => c.id !== id);
    this.recordTombstone('party_category', id);
    this.set(STORAGE_KEYS.PARTY_CATEGORIES, list);
    this.backgroundPouchDelete('party_category', id);

    // Unassign this category from all parties referencing it; never delete parties
    const parties = this.getParties();
    let partiesChanged = false;
    const updatedParties = parties.map((p) => {
      if (p.categoryId === id) {
        partiesChanged = true;
        const updated: Party = { ...p, categoryId: undefined, updatedAt: new Date().toISOString() };
        this.backgroundPouchPut('party', updated);
        this.broadcastChange('party', 'save', updated.id, updated);
        return updated;
      }
      return p;
    });

    if (partiesChanged) {
      this.set(STORAGE_KEYS.PARTIES, updatedParties);
    }

    this.broadcastChange('party_category', 'delete', id);
    this.notifyListeners();
  }

  clearPartyOpeningBalance(id: string): void {
    const list = this.getParties();
    const idx = list.findIndex((p) => p.id === id);
    if (idx >= 0) {
      const prevParty = list[idx];
      const party: Party = {
        ...prevParty,
        openingBalance: undefined,
        openingBalanceType: undefined,
        openingBalanceDate: undefined,
        updatedAt: new Date().toISOString(),
      };
      list[idx] = party;
      this.set(STORAGE_KEYS.PARTIES, list);
      this.backgroundPouchPut('party', party);
      this.broadcastChange('party', 'save', party.id, party);

      // MCA Audit Trail Hook
      const auditUser = this.getAuditUser();
      auditTrail
        .logEvent({
          userId: auditUser.userId,
          userName: auditUser.userName,
          userRole: auditUser.userRole,
          actionType: 'OPENING_BALANCE_CLEAR',
          documentId: party.id,
          documentType: 'PARTY',
          previousSnapshot: JSON.parse(JSON.stringify(prevParty)),
          newSnapshot: JSON.parse(JSON.stringify(party)),
          summary: `Cleared opening balance for ${party.type.toLowerCase()} "${party.name}"`,
        })
        .catch((err) => console.error('Audit log failed for clearPartyOpeningBalance:', err));

      this.recalculatePartyBalance(id);
      this.notifyListeners();
    }
  }

  deleteParty(id: string): void {
    const prevParty = this.getParties().find((p) => p.id === id);
    const list = this.getParties().filter((p) => p.id !== id);
    this.recordTombstone('party', id);
    this.set(STORAGE_KEYS.PARTIES, list);
    this.backgroundPouchDelete('party', id);
    this.broadcastChange('party', 'delete', id);

    // MCA Audit Trail Hook
    const auditUser = this.getAuditUser();
    auditTrail
      .logEvent({
        userId: auditUser.userId,
        userName: auditUser.userName,
        userRole: auditUser.userRole,
        actionType: 'PARTY_DELETE',
        documentId: id,
        documentType: 'PARTY',
        previousSnapshot: prevParty ? JSON.parse(JSON.stringify(prevParty)) : { id },
        newSnapshot: undefined,
        summary: `Deleted ${prevParty?.type?.toLowerCase() || 'party'} "${prevParty?.name || id}"`,
      })
      .catch((err) => console.error('Audit log failed for deleteParty:', err));

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
    let balancePaise = 0;
    if (typeof party.openingBalance === 'number' && party.openingBalance !== 0) {
      const absAmtPaise = toPaise(Math.abs(party.openingBalance));
      let opType = party.openingBalanceType;
      if (!opType) {
        if (party.openingBalance > 0) {
          opType = isCustomer ? 'TO_RECEIVE' : 'TO_PAY';
        } else {
          opType = isCustomer ? 'TO_PAY' : 'TO_RECEIVE';
        }
      }
      if (opType === 'TO_RECEIVE') {
        balancePaise += absAmtPaise;
      } else {
        balancePaise -= absAmtPaise;
      }
    }

    if (isCustomer) {
      // Invoices: customer owes remaining unpaid balance (positive = receivable)
      const invoices = this.getInvoices();
      const partyInvoices = invoices.filter(
        (inv) => !inv.isCancelled && (inv.partyId === party.id || (inv.partyName && inv.partyName.trim().toLowerCase() === partyNameNorm))
      );
      let unpaidInvoicesPaise = 0;
      let unpaidCreditNotesPaise = 0;
      let invoicePaidTotalPaise = 0;

      for (const inv of partyInvoices) {
        // Estimates, Sales Orders, and Delivery Challans do not post to accounting balances
        if (inv.invoiceType === 'ESTIMATE' || inv.invoiceType === 'SALES_ORDER' || inv.invoiceType === 'DELIVERY_CHALLAN') {
          continue;
        }
        const unpaid = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : Math.max(0, inv.grandTotal - (inv.paidAmount || 0));
        if (inv.invoiceType === 'CREDIT_NOTE') {
          unpaidCreditNotesPaise += toPaise(unpaid);
        } else {
          unpaidInvoicesPaise += toPaise(unpaid);
          invoicePaidTotalPaise += toPaise(inv.paidAmount || 0);
        }
      }
      balancePaise += unpaidInvoicesPaise;
      balancePaise -= unpaidCreditNotesPaise;

      // Receipts
      const vouchers = this.getVouchers();
      const partyReceipts = vouchers.filter(
        (v) =>
          !v.isCancelled &&
          !v.isReversed &&
          v.voucherType === 'RECEIPT' &&
          (v.partyId === party.id ||
            (v.partyName && v.partyName.trim().toLowerCase() === partyNameNorm) ||
            v.entries.some((e) => e.accountId === party.id || (e.accountName && e.accountName.toLowerCase() === partyNameNorm)))
      );

      let openingAllocatedPaise = 0;
      let allReceiptTotalsPaise = 0;

      for (const v of partyReceipts) {
        allReceiptTotalsPaise += toPaise(Number(v.totalAmount) || 0);
        for (const alloc of v.paymentAllocations || []) {
          if (alloc.documentId?.startsWith('OPENING-BALANCE-')) {
            openingAllocatedPaise += toPaise(Number(alloc.amount) || 0);
          }
        }
      }

      const advancePaise = Math.max(
        0,
        allReceiptTotalsPaise - invoicePaidTotalPaise - openingAllocatedPaise
      );
      balancePaise -= (openingAllocatedPaise + advancePaise);
    } else {
      // Sales invoices to this supplier (we sold to them) are receivables.
      const invoices = this.getInvoices();
      const partyInvoices = invoices.filter(
        (inv) => !inv.isCancelled && (inv.partyId === party.id || (inv.partyName && inv.partyName.trim().toLowerCase() === partyNameNorm))
      );
      for (const inv of partyInvoices) {
        if (inv.invoiceType === 'ESTIMATE' || inv.invoiceType === 'SALES_ORDER' || inv.invoiceType === 'DELIVERY_CHALLAN') {
          continue;
        }
        const unpaid = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : Math.max(0, inv.grandTotal - (inv.paidAmount || 0));
        if (inv.invoiceType === 'CREDIT_NOTE') {
          balancePaise -= toPaise(unpaid);
        } else {
          balancePaise += toPaise(unpaid);
        }
      }

      // Purchases: we owe vendor remaining unpaid balance (negative = payable)
      const purchases = this.getPurchases();
      const partyPurchases = purchases.filter(
        (pur) => !pur.isCancelled && (pur.supplierId === party.id || (pur.supplierName && pur.supplierName.trim().toLowerCase() === partyNameNorm))
      );
      let unpaidPurchasesPaise = 0;
      let unpaidDebitNotesPaise = 0;
      let purchasePaidTotalPaise = 0;

      for (const pur of partyPurchases) {
        // Purchase Orders and Purchase Challans do not affect vendor payable balances
        if (pur.purchaseType === 'PO' || pur.purchaseType === 'CHALLAN') {
          continue;
        }
        const unpaid = typeof pur.balanceAmount === 'number' ? pur.balanceAmount : Math.max(0, pur.grandTotal - (pur.paidAmount || 0));
        if (pur.purchaseType === 'RETURN' || pur.noteType === 'D') {
          unpaidDebitNotesPaise += toPaise(unpaid);
        } else {
          unpaidPurchasesPaise += toPaise(unpaid);
          purchasePaidTotalPaise += toPaise(pur.paidAmount || 0);
        }
      }
      balancePaise -= unpaidPurchasesPaise;
      balancePaise += unpaidDebitNotesPaise;

      // Payments
      const vouchers = this.getVouchers();
      const partyPayments = vouchers.filter(
        (v) =>
          !v.isCancelled &&
          !v.isReversed &&
          v.voucherType === 'PAYMENT' &&
          (v.partyId === party.id ||
            (v.partyName && v.partyName.trim().toLowerCase() === partyNameNorm) ||
            v.entries.some((e) => e.accountId === party.id || (e.accountName && e.accountName.toLowerCase() === partyNameNorm)))
      );

      let openingAllocatedPaise = 0;
      let allPaymentTotalsPaise = 0;

      for (const v of partyPayments) {
        allPaymentTotalsPaise += toPaise(Number(v.totalAmount) || 0);
        for (const alloc of v.paymentAllocations || []) {
          if (alloc.documentId?.startsWith('OPENING-BALANCE-')) {
            openingAllocatedPaise += toPaise(Number(alloc.amount) || 0);
          }
        }
      }

      const advanceOutPaise = Math.max(
        0,
        allPaymentTotalsPaise - purchasePaidTotalPaise - openingAllocatedPaise
      );
      balancePaise += (openingAllocatedPaise + advanceOutPaise);
    }

    const netBalance = Math.round(fromPaise(balancePaise) * 100) / 100;
    if (party.currentBalance !== netBalance) {
      party.currentBalance = netBalance;
      party.updatedAt = new Date().toISOString();
      parties[partyIndex] = party;
      this.set(STORAGE_KEYS.PARTIES, parties);
      this.backgroundPouchPut('party', party);
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
      unpaidInvoicesPaise: number;
      unpaidCreditNotesPaise: number;
      invoicePaidTotalPaise: number;

      unpaidPurchasesPaise: number;
      unpaidDebitNotesPaise: number;
      purchasePaidTotalPaise: number;

      allReceiptTotalsPaise: number;
      openingAllocatedReceiptsPaise: number;

      allPaymentTotalsPaise: number;
      openingAllocatedPaymentsPaise: number;
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
        unpaidInvoicesPaise: 0,
        unpaidCreditNotesPaise: 0,
        invoicePaidTotalPaise: 0,

        unpaidPurchasesPaise: 0,
        unpaidDebitNotesPaise: 0,
        purchasePaidTotalPaise: 0,

        allReceiptTotalsPaise: 0,
        openingAllocatedReceiptsPaise: 0,

        allPaymentTotalsPaise: 0,
        openingAllocatedPaymentsPaise: 0,
      });
    }

    // 2. Single pass over invoices: O(I)
    for (const inv of invoices) {
      if (inv.isCancelled) continue;
      let party = inv.partyId ? partyById.get(inv.partyId) : undefined;
      if (!party && inv.partyName) {
        party = partyByName.get(inv.partyName.trim().toLowerCase());
      }
      if (!party) continue;

      const acc = accMap.get(party.id);
      if (!acc) continue;

      if (inv.invoiceType === 'ESTIMATE' || inv.invoiceType === 'SALES_ORDER' || inv.invoiceType === 'DELIVERY_CHALLAN') {
        continue;
      }

      const unpaid = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : Math.max(0, inv.grandTotal - (inv.paidAmount || 0));
      if (inv.invoiceType === 'CREDIT_NOTE') {
        acc.unpaidCreditNotesPaise += toPaise(unpaid);
      } else {
        acc.unpaidInvoicesPaise += toPaise(unpaid);
        if (party.type === 'CUSTOMER') {
          acc.invoicePaidTotalPaise += toPaise(inv.paidAmount || 0);
        }
      }
    }

    // 3. Single pass over purchases: O(U)
    for (const pur of purchases) {
      if (pur.isCancelled) continue;
      let supplier = pur.supplierId ? partyById.get(pur.supplierId) : undefined;
      if (!supplier && pur.supplierName) {
        supplier = partyByName.get(pur.supplierName.trim().toLowerCase());
      }
      if (!supplier || supplier.type === 'CUSTOMER') continue;

      const acc = accMap.get(supplier.id);
      if (!acc) continue;

      if (pur.purchaseType === 'PO' || pur.purchaseType === 'CHALLAN') continue;

      const unpaid = typeof pur.balanceAmount === 'number' ? pur.balanceAmount : Math.max(0, pur.grandTotal - (pur.paidAmount || 0));
      if (pur.purchaseType === 'RETURN' || pur.noteType === 'D') {
        acc.unpaidDebitNotesPaise += toPaise(unpaid);
      } else {
        acc.unpaidPurchasesPaise += toPaise(unpaid);
        acc.purchasePaidTotalPaise += toPaise(pur.paidAmount || 0);
      }
    }

    // 4. Single pass over vouchers: O(V * E)
    for (const v of vouchers) {
      if (v.isCancelled || v.isReversed) continue;
      const isReceipt = v.voucherType === 'RECEIPT';
      const isPayment = v.voucherType === 'PAYMENT';
      if (!isReceipt && !isPayment) continue;

      const matchedPartiesThisVoucher = new Set<string>();

      if (v.partyId) {
        const party = partyById.get(v.partyId);
        if (party) matchedPartiesThisVoucher.add(party.id);
      }
      if (v.partyName) {
        const party = partyByName.get(v.partyName.trim().toLowerCase());
        if (party) matchedPartiesThisVoucher.add(party.id);
      }

      for (const e of v.entries) {
        let party = e.accountId ? partyById.get(e.accountId) : undefined;
        if (!party && e.accountName) {
          party = partyByName.get(e.accountName.trim().toLowerCase());
        }
        if (party) {
          matchedPartiesThisVoucher.add(party.id);
        }
      }

      if (matchedPartiesThisVoucher.size === 0) continue;

      const vTotalPaise = toPaise(Number(v.totalAmount) || 0);
      let openingAllocatedPaise = 0;
      for (const alloc of v.paymentAllocations || []) {
        if (alloc.documentId?.startsWith('OPENING-BALANCE-')) {
          openingAllocatedPaise += toPaise(Number(alloc.amount) || 0);
        }
      }

      for (const pId of matchedPartiesThisVoucher) {
        const party = partyById.get(pId);
        if (!party) continue;
        const acc = accMap.get(pId);
        if (!acc) continue;

        if (isReceipt && party.type === 'CUSTOMER') {
          acc.allReceiptTotalsPaise += vTotalPaise;
          acc.openingAllocatedReceiptsPaise += openingAllocatedPaise;
        } else if (isPayment && party.type !== 'CUSTOMER') {
          acc.allPaymentTotalsPaise += vTotalPaise;
          acc.openingAllocatedPaymentsPaise += openingAllocatedPaise;
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

      let balancePaise = 0;
      if (typeof party.openingBalance === 'number' && party.openingBalance !== 0) {
        const absAmtPaise = toPaise(Math.abs(party.openingBalance));
        let opType = party.openingBalanceType;
        if (!opType) {
          opType = party.openingBalance > 0
            ? (isCustomer ? 'TO_RECEIVE' : 'TO_PAY')
            : (isCustomer ? 'TO_PAY' : 'TO_RECEIVE');
        }
        if (opType === 'TO_RECEIVE') {
          balancePaise += absAmtPaise;
        } else {
          balancePaise -= absAmtPaise;
        }
      }

      if (isCustomer) {
        balancePaise += acc.unpaidInvoicesPaise;
        balancePaise -= acc.unpaidCreditNotesPaise;

        const advancePaise = Math.max(
          0,
          acc.allReceiptTotalsPaise - acc.invoicePaidTotalPaise - acc.openingAllocatedReceiptsPaise
        );
        balancePaise -= (acc.openingAllocatedReceiptsPaise + advancePaise);
      } else {
        balancePaise += acc.unpaidInvoicesPaise;
        balancePaise -= acc.unpaidCreditNotesPaise;

        balancePaise -= acc.unpaidPurchasesPaise;
        balancePaise += acc.unpaidDebitNotesPaise;

        const advanceOutPaise = Math.max(
          0,
          acc.allPaymentTotalsPaise - acc.purchasePaidTotalPaise - acc.openingAllocatedPaymentsPaise
        );
        balancePaise += (acc.openingAllocatedPaymentsPaise + advanceOutPaise);
      }

      const netBalance = Math.round(fromPaise(balancePaise) * 100) / 100;
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
        this.backgroundPouchPut('party', p);
        this.broadcastChange('party', 'save', p.id, p);
      });
      this.notifyListeners();
    }
  }
}
