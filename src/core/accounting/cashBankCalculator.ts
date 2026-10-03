import { BankAccount, CashBankTransaction, UnifiedLedgerEntry } from '../../models/bankAccount.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Expense } from '../../models/expense.ts';
import { Voucher } from './voucherTypes.ts';

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
  const { accounts, invoices, purchases, expenses, vouchers = [], transactions } = params;

  // Identify primary / default bank account
  const defaultBank = accounts.find((a) => a.accountType === 'BANK' && a.isDefault) ||
    accounts.find((a) => a.accountType === 'BANK') || {
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
    balances[acc.id] = acc.openingBalance || 0;
  });

  if (balances['ACC_CASH'] === undefined) {
    const cashAcc = accounts.find((a) => a.accountType === 'CASH');
    balances['ACC_CASH'] = cashAcc ? (cashAcc.openingBalance || 0) : 0;
  }

  const entries: UnifiedLedgerEntry[] = [];
  const todayStr = new Date().toISOString().split('T')[0];
  let todayInflow = 0;
  let todayOutflow = 0;

  // 2. Process Sales Invoices (Inflow)
  invoices.forEach((inv) => {
    const paid = typeof inv.paidAmount === 'number'
      ? inv.paidAmount
      : (inv.paymentStatus === 'PAID' ? inv.grandTotal : 0);

    if (paid > 0 && inv.paymentMode !== 'CREDIT') {
      const isCash = inv.paymentMode === 'CASH';
      const targetAccId = isCash ? 'ACC_CASH' : defaultBank.id;
      const targetAccName = isCash ? 'Cash in Hand' : defaultBank.accountName;

      balances[targetAccId] = (balances[targetAccId] || 0) + paid;

      const dateStr = inv.date || inv.createdAt?.split('T')[0] || todayStr;
      if (dateStr === todayStr) {
        todayInflow += paid;
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
        amount: paid,
        description: `Sale Receipt #${inv.invoiceNumber}`,
      });
    }
  });

  // 3. Process Purchases (Outflow)
  purchases.forEach((pur) => {
    const paid = typeof pur.paidAmount === 'number'
      ? pur.paidAmount
      : (pur.paymentStatus === 'PAID' ? pur.grandTotal : 0);

    if (paid > 0 && pur.paymentMode !== 'CREDIT') {
      const isCash = pur.paymentMode === 'CASH';
      const targetAccId = isCash ? 'ACC_CASH' : defaultBank.id;
      const targetAccName = isCash ? 'Cash in Hand' : defaultBank.accountName;

      balances[targetAccId] = (balances[targetAccId] || 0) - paid;

      const dateStr = pur.date || pur.createdAt?.split('T')[0] || todayStr;
      if (dateStr === todayStr) {
        todayOutflow += paid;
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
        amount: paid,
        description: `Purchase Payment #${pur.billNumber}`,
      });
    }
  });

  // 4. Process Expenses (Outflow)
  expenses.forEach((exp) => {
    if (exp.amount > 0) {
      const isCash = exp.paymentMode === 'CASH';
      const targetAccId = isCash ? 'ACC_CASH' : defaultBank.id;
      const targetAccName = isCash ? 'Cash in Hand' : defaultBank.accountName;

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
      });
    }
  });

  // 5. Process Payment Vouchers (Receipts / Payments with specific accounts)
  vouchers.forEach((v) => {
    // Only process explicit receipt / payment vouchers that affect cash or bank
    if (v.voucherType === 'RECEIPT') {
      const cashOrBankEntry = v.entries.find((e) => e.accountId === 'ACC_CASH' || e.accountId === 'ACC_BANK');
      if (cashOrBankEntry && cashOrBankEntry.debit > 0) {
        const isCash = cashOrBankEntry.accountId === 'ACC_CASH';
        const targetAccId = isCash ? 'ACC_CASH' : defaultBank.id;
        const targetAccName = isCash ? 'Cash in Hand' : defaultBank.accountName;
        const amt = cashOrBankEntry.debit;

        balances[targetAccId] = (balances[targetAccId] || 0) + amt;
        const dateStr = v.date || todayStr;
        if (dateStr === todayStr) todayInflow += amt;

        entries.push({
          id: `LEDGER-VCH-${v.id}`,
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
        });
      }
    } else if (v.voucherType === 'PAYMENT') {
      const cashOrBankEntry = v.entries.find((e) => e.accountId === 'ACC_CASH' || e.accountId === 'ACC_BANK');
      if (cashOrBankEntry && cashOrBankEntry.credit > 0) {
        const isCash = cashOrBankEntry.accountId === 'ACC_CASH';
        const targetAccId = isCash ? 'ACC_CASH' : defaultBank.id;
        const targetAccName = isCash ? 'Cash in Hand' : defaultBank.accountName;
        const amt = cashOrBankEntry.credit;

        balances[targetAccId] = (balances[targetAccId] || 0) - amt;
        const dateStr = v.date || todayStr;
        if (dateStr === todayStr) todayOutflow += amt;

        entries.push({
          id: `LEDGER-VCH-${v.id}`,
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
        });
      }
    }
  });

  // 6. Process Explicit Cash & Bank Transactions (Contra transfers, Direct In/Out)
  transactions.forEach((txn) => {
    const amt = txn.amount || 0;
    if (amt <= 0) return;

    const dateStr = txn.date || txn.createdAt?.split('T')[0] || todayStr;

    if (txn.type === 'DEPOSIT') {
      // Cash -> Bank
      const fromId = txn.fromAccountId || 'ACC_CASH';
      const toId = txn.toAccountId || defaultBank.id;

      balances[fromId] = (balances[fromId] || 0) - amt;
      balances[toId] = (balances[toId] || 0) + amt;

      entries.push({
        id: `LEDGER-TXN-OUT-${txn.id}`,
        date: dateStr,
        type: 'CONTRA',
        category: 'CASH',
        accountId: fromId,
        accountName: 'Cash in Hand',
        counterpartyOrTitle: 'Cash Deposit to Bank',
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: 'CONTRA',
        flow: 'OUT',
        amount: amt,
        description: txn.description || 'Cash deposited into bank',
      });

      entries.push({
        id: `LEDGER-TXN-IN-${txn.id}`,
        date: dateStr,
        type: 'CONTRA',
        category: 'BANK',
        accountId: toId,
        accountName: defaultBank.accountName,
        counterpartyOrTitle: 'Cash Deposit Received',
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: 'CONTRA',
        flow: 'IN',
        amount: amt,
        description: txn.description || 'Cash deposit from counter',
      });
    } else if (txn.type === 'WITHDRAWAL') {
      // Bank -> Cash
      const fromId = txn.fromAccountId || defaultBank.id;
      const toId = txn.toAccountId || 'ACC_CASH';

      balances[fromId] = (balances[fromId] || 0) - amt;
      balances[toId] = (balances[toId] || 0) + amt;

      entries.push({
        id: `LEDGER-TXN-OUT-${txn.id}`,
        date: dateStr,
        type: 'CONTRA',
        category: 'BANK',
        accountId: fromId,
        accountName: defaultBank.accountName,
        counterpartyOrTitle: 'Cash Withdrawn from Bank',
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: 'CONTRA',
        flow: 'OUT',
        amount: amt,
        description: txn.description || 'Cash withdrawal for counter',
      });

      entries.push({
        id: `LEDGER-TXN-IN-${txn.id}`,
        date: dateStr,
        type: 'CONTRA',
        category: 'CASH',
        accountId: toId,
        accountName: 'Cash in Hand',
        counterpartyOrTitle: 'Cash Withdrawal Received',
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: 'CONTRA',
        flow: 'IN',
        amount: amt,
        description: txn.description || 'Cash received from bank',
      });
    } else if (txn.type === 'TRANSFER') {
      // Bank A -> Bank B
      const fromId = txn.fromAccountId || defaultBank.id;
      const toId = txn.toAccountId || defaultBank.id;

      balances[fromId] = (balances[fromId] || 0) - amt;
      balances[toId] = (balances[toId] || 0) + amt;

      const fromAcc = accounts.find((a) => a.id === fromId);
      const toAcc = accounts.find((a) => a.id === toId);

      entries.push({
        id: `LEDGER-TXN-OUT-${txn.id}`,
        date: dateStr,
        type: 'CONTRA',
        category: 'BANK',
        accountId: fromId,
        accountName: fromAcc?.accountName || 'Bank Account',
        counterpartyOrTitle: `Transfer to ${toAcc?.accountName || 'Bank'}`,
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: 'NEFT/RTGS',
        flow: 'OUT',
        amount: amt,
        description: txn.description || 'Inter-bank fund transfer',
      });

      entries.push({
        id: `LEDGER-TXN-IN-${txn.id}`,
        date: dateStr,
        type: 'CONTRA',
        category: 'BANK',
        accountId: toId,
        accountName: toAcc?.accountName || 'Bank Account',
        counterpartyOrTitle: `Transfer from ${fromAcc?.accountName || 'Bank'}`,
        referenceNo: txn.referenceNo || txn.txnNumber,
        mode: 'NEFT/RTGS',
        flow: 'IN',
        amount: amt,
        description: txn.description || 'Inter-bank fund transfer',
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
