import type { BankAccount, CashBankTransaction, UnifiedLedgerEntry } from '../../models/bankAccount.ts';
import type { Invoice } from '../../models/invoice.ts';
import type { PurchaseBill } from '../../models/purchase.ts';
import type { Expense } from '../../models/expense.ts';
import type { Voucher } from './voucherTypes.ts';

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

  // 1. Initialize balances with opening balances
  const balances: Record<string, number> = {};
  accounts.forEach((acc) => {
    if (!acc) return;
    balances[acc.id] = acc.openingBalance || 0;
  });

  if (balances['ACC_CASH'] === undefined) {
    const cashAcc = accounts.find((a) => a && a.accountType === 'CASH');
    balances['ACC_CASH'] = cashAcc ? (cashAcc.openingBalance || 0) : 0;
  }

  const entries: UnifiedLedgerEntry[] = [];
  const todayStr = new Date().toISOString().split('T')[0];
  let todayInflow = 0;
  let todayOutflow = 0;

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
  // Calculate total voucher receipts per party so we only count unvouchered upfront invoice payments
  const partyVoucherReceipts: Record<string, number> = {};
  vouchers.forEach((v) => {
    if (!v || v.isReversed || v.isCancelled) return;
    if (v.voucherType === 'RECEIPT') {
      (v.entries || []).forEach((e) => {
        if (!e) return;
        if (e.accountId && e.accountId !== 'ACC_CASH' && e.accountId !== 'ACC_BANK') {
          const key = e.accountId.toLowerCase();
          partyVoucherReceipts[key] = (partyVoucherReceipts[key] || 0) + (v.totalAmount || 0);
        } else if (e.accountName) {
          const key = e.accountName.trim().toLowerCase();
          partyVoucherReceipts[key] = (partyVoucherReceipts[key] || 0) + (v.totalAmount || 0);
        }
      });
    }
  });

  // Track remaining voucher credit per party to offset against invoice paidAmount
  const remainingVoucherCredit = { ...partyVoucherReceipts };

  const orderedInvoices = [...invoices].sort(chronological);
  orderedInvoices.forEach((inv) => {
    if (!inv) return;
    const paid = typeof inv.paidAmount === 'number'
      ? inv.paidAmount
      : (inv.paymentStatus === 'PAID' ? inv.grandTotal : 0);

    if (paid > 0 && inv.paymentMode !== 'CREDIT') {
      const partyKey = (inv.partyId || inv.partyName || '').trim().toLowerCase();
      const availCredit = remainingVoucherCredit[partyKey] || 0;
      // Amount covered by vouchers is handled by section 5 (vouchers), only take unvouchered upfront amount here
      const coveredByVoucher = Math.min(paid, availCredit);
      const unvoucheredPaid = paid - coveredByVoucher;
      if (partyKey && coveredByVoucher > 0) {
        remainingVoucherCredit[partyKey] -= coveredByVoucher;
      }

      if (unvoucheredPaid > 0) {
        const splits = (inv.paymentSplits && inv.paymentSplits.length > 0)
          ? inv.paymentSplits.filter((s) => s.mode !== 'CREDIT' && s.amount > 0)
          : [];

        if (splits.length > 0) {
          const totalSplitsPaid = splits.reduce((sum, s) => sum + s.amount, 0) || unvoucheredPaid;
          const ratio = unvoucheredPaid / totalSplitsPaid;

          splits.forEach((s, sIdx) => {
            const splitAmt = Number((s.amount * ratio).toFixed(2));
            if (splitAmt <= 0) return;
            const isCash = s.mode === 'CASH';
            const targetAccId = isCash ? 'ACC_CASH' : (s.accountId || (inv as any).bankAccountId || defaultBank.id);
            const targetAccName = isCash
              ? 'Cash in Hand'
              : (s.accountName || accounts.find((a) => a.id === targetAccId)?.accountName || (inv as any).bankAccountName || defaultBank.accountName);

            balances[targetAccId] = (balances[targetAccId] || 0) + splitAmt;

            const dateStr = inv.date || inv.createdAt?.split('T')[0] || todayStr;
            if (dateStr === todayStr) {
              todayInflow += splitAmt;
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
              amount: splitAmt,
              description: `Sale Receipt #${inv.invoiceNumber} (${s.mode})${coveredByVoucher > 0 ? ' (Upfront)' : ''}`,
              rawInvoiceId: inv.id,
            });
          });
        } else {
          const isCash = inv.paymentMode === 'CASH';
          const targetAccId = isCash ? 'ACC_CASH' : ((inv as any).bankAccountId || defaultBank.id);
          const targetAccName = isCash
            ? 'Cash in Hand'
            : (accounts.find((a) => a.id === targetAccId)?.accountName || (inv as any).bankAccountName || defaultBank.accountName);

          balances[targetAccId] = (balances[targetAccId] || 0) + unvoucheredPaid;

          const dateStr = inv.date || inv.createdAt?.split('T')[0] || todayStr;
          if (dateStr === todayStr) {
            todayInflow += unvoucheredPaid;
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
            amount: unvoucheredPaid,
            description: `Sale Receipt #${inv.invoiceNumber}${coveredByVoucher > 0 ? ' (Upfront)' : ''}`,
            rawInvoiceId: inv.id,
          });
        }
      }
    }
  });

  // 3. Process Purchases (Outflow from upfront payments without vouchers)
  const supplierVoucherPayments: Record<string, number> = {};
  vouchers.forEach((v) => {
    if (!v || v.isReversed || v.isCancelled) return;
    if (v.voucherType === 'PAYMENT') {
      (v.entries || []).forEach((e) => {
        if (!e) return;
        if (e.accountId && e.accountId !== 'ACC_CASH' && e.accountId !== 'ACC_BANK') {
          const key = e.accountId.toLowerCase();
          supplierVoucherPayments[key] = (supplierVoucherPayments[key] || 0) + (v.totalAmount || 0);
        } else if (e.accountName) {
          const key = e.accountName.trim().toLowerCase();
          supplierVoucherPayments[key] = (supplierVoucherPayments[key] || 0) + (v.totalAmount || 0);
        }
      });
    }
  });

  const remainingVoucherDebit = { ...supplierVoucherPayments };

  const orderedPurchases = [...purchases].sort(chronological);
  orderedPurchases.forEach((pur) => {
    if (!pur) return;
    const paid = typeof pur.paidAmount === 'number'
      ? pur.paidAmount
      : (pur.paymentStatus === 'PAID' ? pur.grandTotal : 0);

    if (paid > 0 && pur.paymentMode !== 'CREDIT') {
      const supKey = (pur.supplierId || pur.supplierName || '').trim().toLowerCase();
      const availDebit = remainingVoucherDebit[supKey] || 0;
      const coveredByVoucher = Math.min(paid, availDebit);
      const unvoucheredPaid = paid - coveredByVoucher;
      if (supKey && coveredByVoucher > 0) {
        remainingVoucherDebit[supKey] -= coveredByVoucher;
      }

      if (unvoucheredPaid > 0) {
        const splits = (pur.paymentSplits && pur.paymentSplits.length > 0)
          ? pur.paymentSplits.filter((s) => s.mode !== 'CREDIT' && s.amount > 0)
          : [];

        if (splits.length > 0) {
          const totalSplitsPaid = splits.reduce((sum, s) => sum + s.amount, 0) || unvoucheredPaid;
          const ratio = unvoucheredPaid / totalSplitsPaid;

          splits.forEach((s, sIdx) => {
            const splitAmt = Number((s.amount * ratio).toFixed(2));
            if (splitAmt <= 0) return;
            const isCash = s.mode === 'CASH';
            const targetAccId = isCash ? 'ACC_CASH' : (s.accountId || (pur as any).bankAccountId || defaultBank.id);
            const targetAccName = isCash
              ? 'Cash in Hand'
              : (s.accountName || accounts.find((a) => a.id === targetAccId)?.accountName || (pur as any).bankAccountName || defaultBank.accountName);

            balances[targetAccId] = (balances[targetAccId] || 0) - splitAmt;

            const dateStr = pur.date || pur.createdAt?.split('T')[0] || todayStr;
            if (dateStr === todayStr) {
              todayOutflow += splitAmt;
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
              amount: splitAmt,
              description: `Purchase Payment #${pur.billNumber} (${s.mode})${coveredByVoucher > 0 ? ' (Upfront)' : ''}`,
              rawPurchaseId: pur.id,
            });
          });
        } else {
          const isCash = pur.paymentMode === 'CASH';
          const targetAccId = isCash ? 'ACC_CASH' : ((pur as any).bankAccountId || defaultBank.id);
          const targetAccName = isCash
            ? 'Cash in Hand'
            : (accounts.find((a) => a.id === targetAccId)?.accountName || (pur as any).bankAccountName || defaultBank.accountName);

          balances[targetAccId] = (balances[targetAccId] || 0) - unvoucheredPaid;

          const dateStr = pur.date || pur.createdAt?.split('T')[0] || todayStr;
          if (dateStr === todayStr) {
            todayOutflow += unvoucheredPaid;
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
            amount: unvoucheredPaid,
            description: `Purchase Payment #${pur.billNumber}${coveredByVoucher > 0 ? ' (Upfront)' : ''}`,
            rawPurchaseId: pur.id,
          });
        }
      }
    }
  });

  // 4. Process Expenses (Outflow)
  expenses.forEach((exp) => {
    if (exp && exp.amount > 0) {
      const isCash = exp.paymentMode === 'CASH';
      const targetAccId = isCash ? 'ACC_CASH' : ((exp as any).bankAccountId || defaultBank.id);
      const targetAccName = isCash
        ? 'Cash in Hand'
        : (accounts.find((a) => a && a.id === targetAccId)?.accountName || (exp as any).bankAccountName || defaultBank.accountName);

      balances[targetAccId] = (balances[targetAccId] || 0) - exp.amount;

      const dateStr = exp.date || exp.createdAt?.split('T')[0] || todayStr;
      if (dateStr === todayStr) {
        todayOutflow += exp.amount;
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
        amount: exp.amount,
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
        (e) => e && (e.accountId === 'ACC_CASH' || bankIds.has(e.accountId) || e.accountId?.startsWith('BANK') || e.accountId?.startsWith('ACC_BANK')) && e.debit > 0
      );
      cashOrBankEntries.forEach((entry, idx) => {
        const isCash = entry.accountId === 'ACC_CASH';
        const matchedAcc = accounts.find((a) => a && a.id === entry.accountId);
        const targetAccId = isCash ? 'ACC_CASH' : (matchedAcc?.id || (entry.accountId && entry.accountId !== 'ACC_BANK' ? entry.accountId : defaultBank.id));
        const targetAccName = isCash ? 'Cash in Hand' : (matchedAcc?.accountName || entry.accountName || defaultBank.accountName);
        const amt = entry.debit;

        balances[targetAccId] = (balances[targetAccId] || 0) + amt;
        const dateStr = v.date || todayStr;
        if (dateStr === todayStr) todayInflow += amt;

        entries.push({
          id: `LEDGER-VCH-${v.id}-${idx}`,
          date: dateStr,
          type: 'PARTY_RECEIPT',
          category: isCash ? 'CASH' : 'BANK',
          accountId: targetAccId,
          accountName: targetAccName,
          counterpartyOrTitle: v.narration || 'Party Receipt',
          referenceNo: v.voucherNumber,
          mode: isCash ? 'CASH' : 'BANK',
          flow: 'IN',
          amount: amt,
          description: v.narration || `Receipt Voucher #${v.voucherNumber}`,
          rawVoucherId: v.id,
        });
      });
    } else if (v.voucherType === 'PAYMENT') {
      const bankIds = new Set(accounts.filter(Boolean).map((a) => a.id));
      bankIds.add('ACC_BANK');
      bankIds.add('ACC_BANK_SBI');
      bankIds.add('ACC_BANK_DEFAULT');

      const cashOrBankEntries = vEntries.filter(
        (e) => e && (e.accountId === 'ACC_CASH' || bankIds.has(e.accountId) || e.accountId?.startsWith('BANK') || e.accountId?.startsWith('ACC_BANK')) && e.credit > 0
      );
      cashOrBankEntries.forEach((entry, idx) => {
        const isCash = entry.accountId === 'ACC_CASH';
        const matchedAcc = accounts.find((a) => a && a.id === entry.accountId);
        const targetAccId = isCash ? 'ACC_CASH' : (matchedAcc?.id || (entry.accountId && entry.accountId !== 'ACC_BANK' ? entry.accountId : defaultBank.id));
        const targetAccName = isCash ? 'Cash in Hand' : (matchedAcc?.accountName || entry.accountName || defaultBank.accountName);
        const amt = entry.credit;

        balances[targetAccId] = (balances[targetAccId] || 0) - amt;
        const dateStr = v.date || todayStr;
        if (dateStr === todayStr) todayOutflow += amt;

        entries.push({
          id: `LEDGER-VCH-${v.id}-${idx}`,
          date: dateStr,
          type: 'PARTY_PAYMENT',
          category: isCash ? 'CASH' : 'BANK',
          accountId: targetAccId,
          accountName: targetAccName,
          counterpartyOrTitle: v.narration || 'Party Payment',
          referenceNo: v.voucherNumber,
          mode: isCash ? 'CASH' : 'BANK',
          flow: 'OUT',
          amount: amt,
          description: v.narration || `Payment Voucher #${v.voucherNumber}`,
          rawVoucherId: v.id,
        });
      });
    } else if (v.voucherType === 'CONTRA') {
      const creditEntry = vEntries.find((e) => e && e.credit > 0);
      const debitEntry = vEntries.find((e) => e && e.debit > 0);
      if (creditEntry && debitEntry) {
        const fromAccId = creditEntry.accountId || 'ACC_CASH';
        const toAccId = debitEntry.accountId || defaultBank.id;
        const fromAcc = accounts.find((a) => a.id === fromAccId);
        const toAcc = accounts.find((a) => a.id === toAccId);
        const fromName = fromAcc?.accountName || creditEntry.accountName || (fromAccId === 'ACC_CASH' ? 'Cash in Hand' : 'Cash');
        const toName = toAcc?.accountName || debitEntry.accountName || defaultBank.accountName;
        const amt = debitEntry.debit || creditEntry.credit || v.totalAmount;
        const dateStr = v.date || todayStr;

        balances[fromAccId] = (balances[fromAccId] || 0) - amt;
        balances[toAccId] = (balances[toAccId] || 0) + amt;

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
          amount: amt,
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
          amount: amt,
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
    const amt = txn.amount || 0;
    if (amt <= 0) return;

    const dateStr = txn.date || txn.createdAt?.split('T')[0] || todayStr;

    if (txn.type === 'DEPOSIT') {
      // Cash -> Bank
      const fromId = txn.fromAccountId || 'ACC_CASH';
      const toId = txn.toAccountId || defaultBank.id;

      balances[fromId] = (balances[fromId] || 0) - amt;
      balances[toId] = (balances[toId] || 0) + amt;

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
        amount: amt,
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
        amount: amt,
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

      balances[fromId] = (balances[fromId] || 0) - amt;
      balances[toId] = (balances[toId] || 0) + amt;

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
        amount: amt,
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
        amount: amt,
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

      balances[fromId] = (balances[fromId] || 0) - amt;
      balances[toId] = (balances[toId] || 0) + amt;

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
        amount: amt,
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
        amount: amt,
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

      balances[toId] = (balances[toId] || 0) + amt;
      if (dateStr === todayStr) todayInflow += amt;

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
        amount: amt,
        description: txn.description || 'Direct Inflow to Account',
        txnId: txn.id,
      });
    } else if (txn.type === 'REDUCE_MONEY') {
      // Direct Outflow
      const fromId = txn.fromAccountId || 'ACC_CASH';
      const fromAcc = accounts.find((a) => a.id === fromId);
      const isCash = fromId === 'ACC_CASH' || fromAcc?.accountType === 'CASH';

      balances[fromId] = (balances[fromId] || 0) - amt;
      if (dateStr === todayStr) todayOutflow += amt;

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
        amount: amt,
        description: txn.description || 'Direct Outflow from Account',
        txnId: txn.id,
      });
    }
  });

  // 7. Sort entries descending by date & compute running balances
  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Aggregate total cash and total bank balances
  let totalCashBalance = 0;
  let totalBankBalance = 0;

  Object.entries(balances).forEach(([accId, bal]) => {
    const acc = accounts.find((a) => a.id === accId);
    if (accId === 'ACC_CASH' || acc?.accountType === 'CASH') {
      totalCashBalance += bal;
    } else {
      totalBankBalance += bal;
    }
  });

  const totalLiquidBalance = totalCashBalance + totalBankBalance;

  return {
    totalLiquidBalance: Math.round(totalLiquidBalance * 100) / 100,
    totalCashBalance: Math.round(totalCashBalance * 100) / 100,
    totalBankBalance: Math.round(totalBankBalance * 100) / 100,
    accountBalances: balances,
    todayInflow: Math.round(todayInflow * 100) / 100,
    todayOutflow: Math.round(todayOutflow * 100) / 100,
    ledgerEntries: entries,
  };
}
