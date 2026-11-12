/**
 * Cash & Bank financial summary calculator and ledger generator.
 * All amounts accumulate in integer paise; rupee values are emitted only at the return boundary.
 */

import type { BankAccount, CashBankTransaction, UnifiedLedgerEntry } from '../../models/bankAccount.ts';
import type { Invoice } from '../../models/invoice.ts';
import type { PurchaseBill } from '../../models/purchase.ts';
import type { Expense } from '../../models/expense.ts';
import type { Voucher } from './voucherTypes.ts';
import { toPaise, fromPaise, addPaise, subPaise, comparePaise } from '../money.ts';

export interface CashBankFinancialSummary {
  totalLiquidBalance: number;
  totalCashBalance: number;
  totalBankBalance: number;
  accountBalances: Record<string, number>;
  todayInflow: number;
  todayOutflow: number;
  ledgerEntries: UnifiedLedgerEntry[];
}

export function computeCashBankSummary(params: {
  accounts: BankAccount[];
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  vouchers?: Voucher[];
  transactions: CashBankTransaction[];
}): CashBankFinancialSummary {
  const accounts = params.accounts || [];
  const invoices = params.invoices || [];
  const purchases = params.purchases || [];
  const expenses = params.expenses || [];
  const vouchers = params.vouchers || [];
  const transactions = params.transactions || [];

  // Identify primary / default bank account
  const defaultBank = accounts.find((a) => a && a.accountType === 'BANK' && a.isDefault) ||
    accounts.find((a) => a && a.accountType === 'BANK') || {
      id: 'ACC_BANK_DEFAULT',
      accountName: 'Primary Bank Account',
      accountType: 'BANK' as const,
      openingBalance: 0,
      createdAt: '',
      updatedAt: '',
    };

  // 1. Initialize balances with opening balances (in paise)
  const balancesPaise: Record<string, number> = {};
  accounts.forEach((acc) => {
    if (!acc) return;
    balancesPaise[acc.id] = toPaise(acc.openingBalance || 0);
  });

  if (balancesPaise['ACC_CASH'] === undefined) {
    const cashAcc = accounts.find((a) => a && a.accountType === 'CASH');
    balancesPaise['ACC_CASH'] = cashAcc ? toPaise(cashAcc.openingBalance || 0) : 0;
  }

  const entries: UnifiedLedgerEntry[] = [];
  const todayStr = new Date().toISOString().split('T')[0];
  let todayInflowPaise = 0;
  let todayOutflowPaise = 0;

  // Voucher credit offsets are allocated per party. Process documents in
  // chronological order so the allocation is deterministic and does not depend
  // on array order after a sync, restore, or local edit. Without this, all
  // walk-in invoices share CUSTOM_PARTY and an older receipt can consume a
  // newer invoice's cash/bank row (or vice versa).
  const chronological = <T extends { date?: string; createdAt?: string }>(a: T, b: T): number => {
    const aKey = `${a.date || ''}|${a.createdAt || ''}`;
    const bKey = `${b.date || ''}|${b.createdAt || ''}`;
    return aKey.localeCompare(bKey);
  };

  // 2. Process Sales Invoices (Inflow from upfront payments without vouchers)
  // Build a per-document map of active receipt-voucher allocations:
  // allocatedReceiptsByInvoice[documentId] += allocation.amount (in paise)
  // Only use the old party-aggregate fallback for legacy vouchers that have no paymentAllocations.
  const allocatedReceiptsByInvoice: Record<string, number> = {};
  const legacyPartyVoucherReceipts: Record<string, number> = {};

  vouchers.forEach((v) => {
    if (!v || v.isReversed || v.isCancelled) return;
    if (v.voucherType === 'RECEIPT') {
      if (v.paymentAllocations && v.paymentAllocations.length > 0) {
        v.paymentAllocations.forEach((alloc) => {
          if (alloc && alloc.documentType === 'INVOICE' && alloc.documentId) {
            allocatedReceiptsByInvoice[alloc.documentId] = addPaise(
              allocatedReceiptsByInvoice[alloc.documentId] || 0,
              toPaise(alloc.amount || 0)
            );
          }
        });
      } else if (v.sourceDocumentType === 'INVOICE' && v.sourceDocumentId) {
        // Direct-link fallback: legacy source voucher with sourceDocumentId but no paymentAllocations
        allocatedReceiptsByInvoice[v.sourceDocumentId] = addPaise(
          allocatedReceiptsByInvoice[v.sourceDocumentId] || 0,
          toPaise(v.totalAmount || 0)
        );
      } else {
        // Legacy fallback: aggregate voucher receipts per party key only when neither an allocation nor a sourceDocument link exists
        const partyKeys = new Set<string>();
        if (v.partyId) partyKeys.add(v.partyId.trim().toLowerCase());
        if (v.partyName) partyKeys.add(v.partyName.trim().toLowerCase());
        (v.entries || []).forEach((e) => {
          if (!e) return;
          if (e.accountId && e.accountId !== 'ACC_CASH' && e.accountId !== 'ACC_BANK' && !e.accountId.startsWith('BANK') && !e.accountId.startsWith('ACC_BANK')) {
            partyKeys.add(e.accountId.trim().toLowerCase());
          }
          if (e.accountName) {
            partyKeys.add(e.accountName.trim().toLowerCase());
          }
        });
        const vTotalPaise = toPaise(v.totalAmount || 0);
        partyKeys.forEach((key) => {
          legacyPartyVoucherReceipts[key] = addPaise(legacyPartyVoucherReceipts[key] || 0, vTotalPaise);
        });
      }
    }
  });

  // Track remaining voucher credit per party to offset against invoice paidAmount for legacy vouchers
  const remainingLegacyCredit = { ...legacyPartyVoucherReceipts };

  const orderedInvoices = [...invoices].sort(chronological);
  orderedInvoices.forEach((inv) => {
    if (!inv) return;
    const paidPaise = typeof inv.paidAmount === 'number'
      ? toPaise(inv.paidAmount)
      : (inv.paymentStatus === 'PAID' ? toPaise(inv.grandTotal || 0) : 0);

    if (comparePaise(paidPaise, 0) > 0 && inv.paymentMode !== 'CREDIT') {
      // 1. Direct document allocation suppression
      const directAllocPaise = allocatedReceiptsByInvoice[inv.id] || 0;
      const coveredByDirectAllocPaise = comparePaise(paidPaise, directAllocPaise) <= 0 ? paidPaise : directAllocPaise;
      const remainingPaidToCoverPaise = subPaise(paidPaise, coveredByDirectAllocPaise);

      // 2. Legacy party-aggregate fallback only for vouchers without paymentAllocations
      const partyKey = (inv.partyId || inv.partyName || '').trim().toLowerCase();
      const legacyAvailPaise = remainingLegacyCredit[partyKey] || 0;
      const coveredByLegacyPaise = comparePaise(remainingPaidToCoverPaise, legacyAvailPaise) <= 0 ? remainingPaidToCoverPaise : legacyAvailPaise;
      if (partyKey && comparePaise(coveredByLegacyPaise, 0) > 0) {
        remainingLegacyCredit[partyKey] = subPaise(remainingLegacyCredit[partyKey], coveredByLegacyPaise);
      }

      // Amount covered by vouchers is handled by section 5 (vouchers), only take unvouchered upfront amount here
      const coveredByVoucherPaise = addPaise(coveredByDirectAllocPaise, coveredByLegacyPaise);
      const unvoucheredPaidPaise = subPaise(paidPaise, coveredByVoucherPaise);

      if (comparePaise(unvoucheredPaidPaise, 0) > 0) {
        const splits = (inv.paymentSplits && inv.paymentSplits.length > 0)
          ? inv.paymentSplits.filter((s) => s.mode !== 'CREDIT' && comparePaise(toPaise(s.amount), 0) > 0)
          : [];

        if (splits.length > 0) {
          const totalSplitsPaise = splits.reduce((s, x) => addPaise(s, toPaise(x.amount)), 0) || unvoucheredPaidPaise;

          splits.forEach((s, sIdx) => {
            const splitPaise = Math.round((toPaise(s.amount) * unvoucheredPaidPaise) / totalSplitsPaise);
            if (comparePaise(splitPaise, 0) <= 0) return;
            const isCash = s.mode === 'CASH';
            const targetAccId = isCash ? 'ACC_CASH' : (s.accountId || inv.bankAccountId || defaultBank.id);
            const targetAccName = isCash
              ? 'Cash in Hand'
              : (s.accountName || accounts.find((a) => a.id === targetAccId)?.accountName || inv.bankAccountName || defaultBank.accountName);

            balancesPaise[targetAccId] = addPaise(balancesPaise[targetAccId] || 0, splitPaise);

            const dateStr = inv.date || inv.createdAt?.split('T')[0] || todayStr;
            if (dateStr === todayStr) {
              todayInflowPaise = addPaise(todayInflowPaise, splitPaise);
            }

            entries.push({
              id: `LEDGER-SALE-${inv.id}-${sIdx}`,
              date: dateStr,
              type: 'SALE',
              category: isCash ? 'CASH' : 'BANK',
              accountId: targetAccId,
              accountName: targetAccName,
              counterpartyOrTitle: inv.partyName || 'Retail Customer',
              referenceNo: inv.invoiceNumber,
              mode: s.mode,
              flow: 'IN',
              amount: fromPaise(splitPaise),
              description: `Sale Receipt #${inv.invoiceNumber} (${s.mode})${comparePaise(coveredByVoucherPaise, 0) > 0 ? ' (Upfront)' : ''}`,
              rawInvoiceId: inv.id,
            });
          });
        } else {
          const isCash = inv.paymentMode === 'CASH';
          const targetAccId = isCash ? 'ACC_CASH' : (inv.bankAccountId || defaultBank.id);
          const targetAccName = isCash
            ? 'Cash in Hand'
            : (accounts.find((a) => a.id === targetAccId)?.accountName || inv.bankAccountName || defaultBank.accountName);

          balancesPaise[targetAccId] = addPaise(balancesPaise[targetAccId] || 0, unvoucheredPaidPaise);

          const dateStr = inv.date || inv.createdAt?.split('T')[0] || todayStr;
          if (dateStr === todayStr) {
            todayInflowPaise = addPaise(todayInflowPaise, unvoucheredPaidPaise);
          }

          entries.push({
            id: `LEDGER-SALE-${inv.id}`,
            date: dateStr,
            type: 'SALE',
            category: isCash ? 'CASH' : 'BANK',
            accountId: targetAccId,
            accountName: targetAccName,
            counterpartyOrTitle: inv.partyName || 'Retail Customer',
            referenceNo: inv.invoiceNumber,
            mode: inv.paymentMode || (isCash ? 'CASH' : 'UPI'),
            flow: 'IN',
            amount: fromPaise(unvoucheredPaidPaise),
            description: `Sale Receipt #${inv.invoiceNumber}${comparePaise(coveredByVoucherPaise, 0) > 0 ? ' (Upfront)' : ''}`,
            rawInvoiceId: inv.id,
          });
        }
      }
    }
  });

  // 3. Process Purchases (Outflow from upfront payments without vouchers)
  // Build a per-document map of active payment-voucher allocations:
  // allocatedPaymentsByPurchase[documentId] += allocation.amount (in paise)
  // Only use the old supplier-aggregate fallback for legacy vouchers that have no paymentAllocations.
  const allocatedPaymentsByPurchase: Record<string, number> = {};
  const legacySupplierVoucherPayments: Record<string, number> = {};

  vouchers.forEach((v) => {
    if (!v || v.isReversed || v.isCancelled) return;
    if (v.voucherType === 'PAYMENT') {
      if (v.paymentAllocations && v.paymentAllocations.length > 0) {
        v.paymentAllocations.forEach((alloc) => {
          if (alloc && alloc.documentType === 'PURCHASE' && alloc.documentId) {
            allocatedPaymentsByPurchase[alloc.documentId] = addPaise(
              allocatedPaymentsByPurchase[alloc.documentId] || 0,
              toPaise(alloc.amount || 0)
            );
          }
        });
      } else if (v.sourceDocumentType === 'PURCHASE' && v.sourceDocumentId) {
        // Direct-link fallback: legacy source voucher with sourceDocumentId but no paymentAllocations
        allocatedPaymentsByPurchase[v.sourceDocumentId] = addPaise(
          allocatedPaymentsByPurchase[v.sourceDocumentId] || 0,
          toPaise(v.totalAmount || 0)
        );
      } else {
        // Legacy fallback: aggregate voucher payments per supplier key only when neither an allocation nor a sourceDocument link exists
        const supKeys = new Set<string>();
        if (v.partyId) supKeys.add(v.partyId.trim().toLowerCase());
        if (v.partyName) supKeys.add(v.partyName.trim().toLowerCase());
        (v.entries || []).forEach((e) => {
          if (!e) return;
          if (e.accountId && e.accountId !== 'ACC_CASH' && e.accountId !== 'ACC_BANK' && !e.accountId.startsWith('BANK') && !e.accountId.startsWith('ACC_BANK')) {
            supKeys.add(e.accountId.trim().toLowerCase());
          }
          if (e.accountName) {
            supKeys.add(e.accountName.trim().toLowerCase());
          }
        });
        const vTotalPaise = toPaise(v.totalAmount || 0);
        supKeys.forEach((key) => {
          legacySupplierVoucherPayments[key] = addPaise(legacySupplierVoucherPayments[key] || 0, vTotalPaise);
        });
      }
    }
  });

  // Track remaining voucher debit per supplier to offset against purchase paidAmount for legacy vouchers
  const remainingLegacyDebit = { ...legacySupplierVoucherPayments };

  const orderedPurchases = [...purchases].sort(chronological);
  orderedPurchases.forEach((pur) => {
    if (!pur) return;
    const paidPaise = typeof pur.paidAmount === 'number'
      ? toPaise(pur.paidAmount)
      : (pur.paymentStatus === 'PAID' ? toPaise(pur.grandTotal || 0) : 0);

    if (comparePaise(paidPaise, 0) > 0 && pur.paymentMode !== 'CREDIT') {
      // 1. Direct document allocation suppression
      const directAllocPaise = allocatedPaymentsByPurchase[pur.id] || 0;
      const coveredByDirectAllocPaise = comparePaise(paidPaise, directAllocPaise) <= 0 ? paidPaise : directAllocPaise;
      const remainingPaidToCoverPaise = subPaise(paidPaise, coveredByDirectAllocPaise);

      // 2. Legacy supplier-aggregate fallback only for vouchers without paymentAllocations
      const supKey = (pur.supplierId || pur.supplierName || '').trim().toLowerCase();
      const legacyAvailPaise = remainingLegacyDebit[supKey] || 0;
      const coveredByLegacyPaise = comparePaise(remainingPaidToCoverPaise, legacyAvailPaise) <= 0 ? remainingPaidToCoverPaise : legacyAvailPaise;
      if (supKey && comparePaise(coveredByLegacyPaise, 0) > 0) {
        remainingLegacyDebit[supKey] = subPaise(remainingLegacyDebit[supKey], coveredByLegacyPaise);
      }

      const coveredByVoucherPaise = addPaise(coveredByDirectAllocPaise, coveredByLegacyPaise);
      const unvoucheredPaidPaise = subPaise(paidPaise, coveredByVoucherPaise);

      if (comparePaise(unvoucheredPaidPaise, 0) > 0) {
        const splits = (pur.paymentSplits && pur.paymentSplits.length > 0)
          ? pur.paymentSplits.filter((s) => s.mode !== 'CREDIT' && comparePaise(toPaise(s.amount), 0) > 0)
          : [];

        if (splits.length > 0) {
          const totalSplitsPaise = splits.reduce((s, x) => addPaise(s, toPaise(x.amount)), 0) || unvoucheredPaidPaise;

          splits.forEach((s, sIdx) => {
            const splitPaise = Math.round((toPaise(s.amount) * unvoucheredPaidPaise) / totalSplitsPaise);
            if (comparePaise(splitPaise, 0) <= 0) return;
            const isCash = s.mode === 'CASH';
            const targetAccId = isCash ? 'ACC_CASH' : (s.accountId || pur.bankAccountId || defaultBank.id);
            const targetAccName = isCash
              ? 'Cash in Hand'
              : (s.accountName || accounts.find((a) => a.id === targetAccId)?.accountName || pur.bankAccountName || defaultBank.accountName);

            balancesPaise[targetAccId] = subPaise(balancesPaise[targetAccId] || 0, splitPaise);

            const dateStr = pur.date || pur.createdAt?.split('T')[0] || todayStr;
            if (dateStr === todayStr) {
              todayOutflowPaise = addPaise(todayOutflowPaise, splitPaise);
            }

            entries.push({
              id: `LEDGER-PUR-${pur.id}-${sIdx}`,
              date: dateStr,
              type: 'PURCHASE',
              category: isCash ? 'CASH' : 'BANK',
              accountId: targetAccId,
              accountName: targetAccName,
              counterpartyOrTitle: pur.supplierName || 'Vendor Payment',
              referenceNo: pur.billNumber,
              mode: s.mode,
              flow: 'OUT',
              amount: fromPaise(splitPaise),
              description: `Purchase Payment #${pur.billNumber} (${s.mode})${comparePaise(coveredByVoucherPaise, 0) > 0 ? ' (Upfront)' : ''}`,
              rawPurchaseId: pur.id,
            });
          });
        } else {
          const isCash = pur.paymentMode === 'CASH';
          const targetAccId = isCash ? 'ACC_CASH' : (pur.bankAccountId || defaultBank.id);
          const targetAccName = isCash
            ? 'Cash in Hand'
            : (accounts.find((a) => a.id === targetAccId)?.accountName || pur.bankAccountName || defaultBank.accountName);

          balancesPaise[targetAccId] = subPaise(balancesPaise[targetAccId] || 0, unvoucheredPaidPaise);

          const dateStr = pur.date || pur.createdAt?.split('T')[0] || todayStr;
          if (dateStr === todayStr) {
            todayOutflowPaise = addPaise(todayOutflowPaise, unvoucheredPaidPaise);
          }

          entries.push({
            id: `LEDGER-PUR-${pur.id}`,
            date: dateStr,
            type: 'PURCHASE',
            category: isCash ? 'CASH' : 'BANK',
            accountId: targetAccId,
            accountName: targetAccName,
            counterpartyOrTitle: pur.supplierName || 'Vendor Payment',
            referenceNo: pur.billNumber,
            mode: pur.paymentMode || (isCash ? 'CASH' : 'NET_BANKING'),
            flow: 'OUT',
            amount: fromPaise(unvoucheredPaidPaise),
            description: `Purchase Payment #${pur.billNumber}${comparePaise(coveredByVoucherPaise, 0) > 0 ? ' (Upfront)' : ''}`,
            rawPurchaseId: pur.id,
          });
        }
      }
    }
  });

  // 4. Process Expenses (Outflow)
  expenses.forEach((exp) => {
    if (!exp) return;
    const expPaise = toPaise(exp.amount || 0);
    if (comparePaise(expPaise, 0) > 0) {
      const isCash = exp.paymentMode === 'CASH';
      const targetAccId = isCash ? 'ACC_CASH' : (exp.bankAccountId || defaultBank.id);
      const targetAccName = isCash
        ? 'Cash in Hand'
        : (accounts.find((a) => a && a.id === targetAccId)?.accountName || exp.bankAccountName || defaultBank.accountName);

      balancesPaise[targetAccId] = subPaise(balancesPaise[targetAccId] || 0, expPaise);

      const dateStr = exp.date || exp.createdAt?.split('T')[0] || todayStr;
      if (dateStr === todayStr) {
        todayOutflowPaise = addPaise(todayOutflowPaise, expPaise);
      }

      entries.push({
        id: `LEDGER-EXP-${exp.id}`,
        date: dateStr,
        type: 'EXPENSE',
        category: isCash ? 'CASH' : 'BANK',
        accountId: targetAccId,
        accountName: targetAccName,
        counterpartyOrTitle: exp.title || exp.category,
        referenceNo: exp.voucherNumber,
        mode: exp.paymentMode || (isCash ? 'CASH' : 'UPI'),
        flow: 'OUT',
        amount: fromPaise(expPaise),
        description: `${exp.category} Expense: ${exp.title}`,
        rawExpenseId: exp.id,
      });
    }
  });

  // 5. Process Payment Vouchers (Receipts / Payments with specific accounts)
  vouchers.forEach((v) => {
    if (!v || v.isReversed || v.isCancelled) return;
    const vEntries = v.entries || [];
    // Process explicit receipt / payment vouchers that affect cash or bank
    if (v.voucherType === 'RECEIPT') {
      const bankIds = new Set(accounts.filter(Boolean).map((a) => a.id));
      bankIds.add('ACC_BANK');
      bankIds.add('ACC_BANK_SBI');
      bankIds.add('ACC_BANK_DEFAULT');

      const cashOrBankEntries = vEntries.filter(
        (e) => e && (e.accountId === 'ACC_CASH' || bankIds.has(e.accountId) || e.accountId?.startsWith('BANK') || e.accountId?.startsWith('ACC_BANK')) && comparePaise(toPaise(e.debit || 0), 0) > 0
      );
      cashOrBankEntries.forEach((entry, idx) => {
        const isCash = entry.accountId === 'ACC_CASH';
        const matchedAcc = accounts.find((a) => a && a.id === entry.accountId);
        const targetAccId = isCash ? 'ACC_CASH' : (matchedAcc?.id || (entry.accountId && entry.accountId !== 'ACC_BANK' ? entry.accountId : defaultBank.id));
        const targetAccName = isCash ? 'Cash in Hand' : (matchedAcc?.accountName || entry.accountName || defaultBank.accountName);
        const amtPaise = toPaise(entry.debit || 0);

        balancesPaise[targetAccId] = addPaise(balancesPaise[targetAccId] || 0, amtPaise);
        const dateStr = v.date || todayStr;
        if (dateStr === todayStr) todayInflowPaise = addPaise(todayInflowPaise, amtPaise);

        entries.push({
          id: `LEDGER-VCH-${v.id}-${idx}`,
          date: dateStr,
          type: 'PARTY_RECEIPT',
          category: isCash ? 'CASH' : 'BANK',
          accountId: targetAccId,
          accountName: targetAccName,
          counterpartyOrTitle: v.partyName || v.narration || 'Party Receipt',
          referenceNo: v.voucherNumber,
          mode: isCash ? 'CASH' : 'BANK',
          flow: 'IN',
          amount: fromPaise(amtPaise),
          description: v.narration || `Receipt Voucher #${v.voucherNumber}`,
          rawVoucherId: v.id,
          partyId: v.partyId,
        });
      });
    } else if (v.voucherType === 'PAYMENT') {
      const bankIds = new Set(accounts.filter(Boolean).map((a) => a.id));
      bankIds.add('ACC_BANK');
      bankIds.add('ACC_BANK_SBI');
      bankIds.add('ACC_BANK_DEFAULT');

      const cashOrBankEntries = vEntries.filter(
        (e) => e && (e.accountId === 'ACC_CASH' || bankIds.has(e.accountId) || e.accountId?.startsWith('BANK') || e.accountId?.startsWith('ACC_BANK')) && comparePaise(toPaise(e.credit || 0), 0) > 0
      );
      cashOrBankEntries.forEach((entry, idx) => {
        const isCash = entry.accountId === 'ACC_CASH';
        const matchedAcc = accounts.find((a) => a && a.id === entry.accountId);
        const targetAccId = isCash ? 'ACC_CASH' : (matchedAcc?.id || (entry.accountId && entry.accountId !== 'ACC_BANK' ? entry.accountId : defaultBank.id));
        const targetAccName = isCash ? 'Cash in Hand' : (matchedAcc?.accountName || entry.accountName || defaultBank.accountName);
        const amtPaise = toPaise(entry.credit || 0);

        balancesPaise[targetAccId] = subPaise(balancesPaise[targetAccId] || 0, amtPaise);
        const dateStr = v.date || todayStr;
        if (dateStr === todayStr) todayOutflowPaise = addPaise(todayOutflowPaise, amtPaise);

        entries.push({
          id: `LEDGER-VCH-${v.id}-${idx}`,
          date: dateStr,
          type: 'PARTY_PAYMENT',
          category: isCash ? 'CASH' : 'BANK',
          accountId: targetAccId,
          accountName: targetAccName,
          counterpartyOrTitle: v.partyName || v.narration || 'Party Payment',
          referenceNo: v.voucherNumber,
          mode: isCash ? 'CASH' : 'BANK',
          flow: 'OUT',
          amount: fromPaise(amtPaise),
          description: v.narration || `Payment Voucher #${v.voucherNumber}`,
          rawVoucherId: v.id,
          partyId: v.partyId,
        });
      });
    } else if (v.voucherType === 'CONTRA') {
      const creditEntry = vEntries.find((e) => e && comparePaise(toPaise(e.credit || 0), 0) > 0);
      const debitEntry = vEntries.find((e) => e && comparePaise(toPaise(e.debit || 0), 0) > 0);
      if (creditEntry && debitEntry) {
        const fromAccId = creditEntry.accountId || 'ACC_CASH';
        const toAccId = debitEntry.accountId || defaultBank.id;
        const fromAcc = accounts.find((a) => a.id === fromAccId);
        const toAcc = accounts.find((a) => a.id === toAccId);
        const fromName = fromAcc?.accountName || creditEntry.accountName || (fromAccId === 'ACC_CASH' ? 'Cash in Hand' : 'Cash');
        const toName = toAcc?.accountName || debitEntry.accountName || defaultBank.accountName;
        const amtPaise = toPaise(debitEntry.debit || creditEntry.credit || v.totalAmount || 0);
        const dateStr = v.date || todayStr;

        balancesPaise[fromAccId] = subPaise(balancesPaise[fromAccId] || 0, amtPaise);
        balancesPaise[toAccId] = addPaise(balancesPaise[toAccId] || 0, amtPaise);

        const contraType = fromAccId === 'ACC_CASH' ? 'DEPOSIT' : (toAccId === 'ACC_CASH' ? 'WITHDRAWAL' : 'TRANSFER');

        entries.push({
          id: `LEDGER-VCH-OUT-${v.id}`,
          date: dateStr,
          type: 'CONTRA',
          category: fromAccId === 'ACC_CASH' ? 'CASH' : 'BANK',
          accountId: fromAccId,
          accountName: fromName,
          counterpartyOrTitle: `Transfer to ${toName}`,
          referenceNo: v.voucherNumber,
          mode: 'CONTRA',
          flow: 'OUT',
          amount: fromPaise(amtPaise),
          description: v.narration || `Contra Transfer: ${fromName} ➔ ${toName}`,
          fromAccountId: fromAccId,
          fromAccountName: fromName,
          toAccountId: toAccId,
          toAccountName: toName,
          contraType,
          rawVoucherId: v.id,
        });

        entries.push({
          id: `LEDGER-VCH-IN-${v.id}`,
          date: dateStr,
          type: 'CONTRA',
          category: toAccId === 'ACC_CASH' ? 'CASH' : 'BANK',
          accountId: toAccId,
          accountName: toName,
          counterpartyOrTitle: `Transfer from ${fromName}`,
          referenceNo: v.voucherNumber,
          mode: 'CONTRA',
          flow: 'IN',
          amount: fromPaise(amtPaise),
          description: v.narration || `Contra Transfer: ${fromName} ➔ ${toName}`,
          fromAccountId: fromAccId,
          fromAccountName: fromName,
          toAccountId: toAccId,
          toAccountName: toName,
          contraType,
          rawVoucherId: v.id,
        });
      }
    }
  });

  // 6. Process Explicit Cash & Bank Transactions (Contra transfers, Direct In/Out)
  transactions.forEach((txn) => {
    if (!txn) return;
    const amtPaise = toPaise(txn.amount || 0);
    if (comparePaise(amtPaise, 0) <= 0) return;

    const dateStr = txn.date || txn.createdAt?.split('T')[0] || todayStr;

    if (txn.type === 'DEPOSIT') {
      // Cash -> Bank
      const fromId = txn.fromAccountId || 'ACC_CASH';
      const toId = txn.toAccountId || defaultBank.id;

      balancesPaise[fromId] = subPaise(balancesPaise[fromId] || 0, amtPaise);
      balancesPaise[toId] = addPaise(balancesPaise[toId] || 0, amtPaise);

      const fromAcc = accounts.find((a) => a.id === fromId);
      const toAcc = accounts.find((a) => a.id === toId);
      const fromName = fromAcc?.accountName || (fromId === 'ACC_CASH' ? 'Cash in Hand' : 'Cash');
      const toName = toAcc?.accountName || defaultBank.accountName;

      entries.push({
        id: `LEDGER-TXN-OUT-${txn.id}`,
        date: dateStr,
        type: 'CONTRA',
        category: 'CASH',
        accountId: fromId,
        accountName: fromName,
        counterpartyOrTitle: 'Cash Deposit to Bank',
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: 'CONTRA',
        flow: 'OUT',
        amount: fromPaise(amtPaise),
        description: txn.description || `Cash deposited into ${toName}`,
        fromAccountId: fromId,
        fromAccountName: fromName,
        toAccountId: toId,
        toAccountName: toName,
        contraType: 'DEPOSIT',
        txnId: txn.id,
      });

      entries.push({
        id: `LEDGER-TXN-IN-${txn.id}`,
        date: dateStr,
        type: 'CONTRA',
        category: 'BANK',
        accountId: toId,
        accountName: toName,
        counterpartyOrTitle: 'Cash Deposit Received',
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: 'CONTRA',
        flow: 'IN',
        amount: fromPaise(amtPaise),
        description: txn.description || `Cash deposit received from ${fromName}`,
        fromAccountId: fromId,
        fromAccountName: fromName,
        toAccountId: toId,
        toAccountName: toName,
        contraType: 'DEPOSIT',
        txnId: txn.id,
      });
    } else if (txn.type === 'WITHDRAWAL') {
      // Bank -> Cash
      const fromId = txn.fromAccountId || defaultBank.id;
      const toId = txn.toAccountId || 'ACC_CASH';

      balancesPaise[fromId] = subPaise(balancesPaise[fromId] || 0, amtPaise);
      balancesPaise[toId] = addPaise(balancesPaise[toId] || 0, amtPaise);

      const fromAcc = accounts.find((a) => a.id === fromId);
      const toAcc = accounts.find((a) => a.id === toId);
      const fromName = fromAcc?.accountName || defaultBank.accountName;
      const toName = toAcc?.accountName || (toId === 'ACC_CASH' ? 'Cash in Hand' : 'Cash');

      entries.push({
        id: `LEDGER-TXN-OUT-${txn.id}`,
        date: dateStr,
        type: 'CONTRA',
        category: 'BANK',
        accountId: fromId,
        accountName: fromName,
        counterpartyOrTitle: 'Cash Withdrawn from Bank',
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: 'CONTRA',
        flow: 'OUT',
        amount: fromPaise(amtPaise),
        description: txn.description || `Cash withdrawal for ${toName}`,
        fromAccountId: fromId,
        fromAccountName: fromName,
        toAccountId: toId,
        toAccountName: toName,
        contraType: 'WITHDRAWAL',
        txnId: txn.id,
      });

      entries.push({
        id: `LEDGER-TXN-IN-${txn.id}`,
        date: dateStr,
        type: 'CONTRA',
        category: 'CASH',
        accountId: toId,
        accountName: toName,
        counterpartyOrTitle: 'Cash Withdrawal Received',
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: 'CONTRA',
        flow: 'IN',
        amount: fromPaise(amtPaise),
        description: txn.description || `Cash received from ${fromName}`,
        fromAccountId: fromId,
        fromAccountName: fromName,
        toAccountId: toId,
        toAccountName: toName,
        contraType: 'WITHDRAWAL',
        txnId: txn.id,
      });
    } else if (txn.type === 'TRANSFER') {
      // Bank A -> Bank B
      const fromId = txn.fromAccountId || defaultBank.id;
      const toId = txn.toAccountId || defaultBank.id;

      balancesPaise[fromId] = subPaise(balancesPaise[fromId] || 0, amtPaise);
      balancesPaise[toId] = addPaise(balancesPaise[toId] || 0, amtPaise);

      const fromAcc = accounts.find((a) => a.id === fromId);
      const toAcc = accounts.find((a) => a.id === toId);
      const fromName = fromAcc?.accountName || 'Bank Account';
      const toName = toAcc?.accountName || 'Bank Account';

      entries.push({
        id: `LEDGER-TXN-OUT-${txn.id}`,
        date: dateStr,
        type: 'CONTRA',
        category: 'BANK',
        accountId: fromId,
        accountName: fromName,
        counterpartyOrTitle: `Transfer to ${toName}`,
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: 'NEFT/RTGS',
        flow: 'OUT',
        amount: fromPaise(amtPaise),
        description: txn.description || `Inter-bank fund transfer to ${toName}`,
        fromAccountId: fromId,
        fromAccountName: fromName,
        toAccountId: toId,
        toAccountName: toName,
        contraType: 'TRANSFER',
        txnId: txn.id,
      });

      entries.push({
        id: `LEDGER-TXN-IN-${txn.id}`,
        date: dateStr,
        type: 'CONTRA',
        category: 'BANK',
        accountId: toId,
        accountName: toName,
        counterpartyOrTitle: `Transfer from ${fromName}`,
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: 'NEFT/RTGS',
        flow: 'IN',
        amount: fromPaise(amtPaise),
        description: txn.description || `Inter-bank fund transfer from ${fromName}`,
        fromAccountId: fromId,
        fromAccountName: fromName,
        toAccountId: toId,
        toAccountName: toName,
        contraType: 'TRANSFER',
        txnId: txn.id,
      });
    } else if (txn.type === 'ADD_MONEY') {
      // Direct Inflow
      const toId = txn.toAccountId || 'ACC_CASH';
      const toAcc = accounts.find((a) => a.id === toId);
      const isCash = toId === 'ACC_CASH' || toAcc?.accountType === 'CASH';

      balancesPaise[toId] = addPaise(balancesPaise[toId] || 0, amtPaise);
      if (dateStr === todayStr) todayInflowPaise = addPaise(todayInflowPaise, amtPaise);

      entries.push({
        id: `LEDGER-TXN-${txn.id}`,
        date: dateStr,
        type: 'DIRECT_IN',
        category: isCash ? 'CASH' : 'BANK',
        accountId: toId,
        accountName: toAcc?.accountName || (isCash ? 'Cash in Hand' : 'Bank Account'),
        counterpartyOrTitle: txn.description || 'Capital / Other Inflow',
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: isCash ? 'CASH' : 'BANK',
        flow: 'IN',
        amount: fromPaise(amtPaise),
        description: txn.description || 'Direct Inflow to Account',
        txnId: txn.id,
      });
    } else if (txn.type === 'REDUCE_MONEY') {
      // Direct Outflow
      const fromId = txn.fromAccountId || 'ACC_CASH';
      const fromAcc = accounts.find((a) => a.id === fromId);
      const isCash = fromId === 'ACC_CASH' || fromAcc?.accountType === 'CASH';

      balancesPaise[fromId] = subPaise(balancesPaise[fromId] || 0, amtPaise);
      if (dateStr === todayStr) todayOutflowPaise = addPaise(todayOutflowPaise, amtPaise);

      entries.push({
        id: `LEDGER-TXN-${txn.id}`,
        date: dateStr,
        type: 'DIRECT_OUT',
        category: isCash ? 'CASH' : 'BANK',
        accountId: fromId,
        accountName: fromAcc?.accountName || (isCash ? 'Cash in Hand' : 'Bank Account'),
        counterpartyOrTitle: txn.description || 'Drawings / Bank Charges',
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: isCash ? 'CASH' : 'BANK',
        flow: 'OUT',
        amount: fromPaise(amtPaise),
        description: txn.description || 'Direct Outflow from Account',
        txnId: txn.id,
      });
    }
  });

  // 7. Sort entries descending by date & compute running balances
  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Aggregate total cash and total bank balances (summing paise)
  let totalCashBalancePaise = 0;
  let totalBankBalancePaise = 0;

  Object.entries(balancesPaise).forEach(([accId, balPaise]) => {
    const acc = accounts.find((a) => a.id === accId);
    if (accId === 'ACC_CASH' || acc?.accountType === 'CASH') {
      totalCashBalancePaise = addPaise(totalCashBalancePaise, balPaise);
    } else {
      totalBankBalancePaise = addPaise(totalBankBalancePaise, balPaise);
    }
  });

  const totalLiquidBalancePaise = addPaise(totalCashBalancePaise, totalBankBalancePaise);

  return {
    totalLiquidBalance: fromPaise(totalLiquidBalancePaise),
    totalCashBalance: fromPaise(totalCashBalancePaise),
    totalBankBalance: fromPaise(totalBankBalancePaise),
    accountBalances: Object.fromEntries(
      Object.entries(balancesPaise).map(([id, p]) => [id, fromPaise(p)])
    ),
    todayInflow: fromPaise(todayInflowPaise),
    todayOutflow: fromPaise(todayOutflowPaise),
    ledgerEntries: entries,
  };
}
