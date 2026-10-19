import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { Expense } from '../../models/expense.ts';
import { BankAccount, CashBankTransaction } from '../../models/bankAccount.ts';
import { LoanAccount, LoanTransaction } from '../../models/loan.ts';
import { pouch } from '../pouchdb.ts';
import { auditTrail } from '../auditTrail.ts';
import { STORAGE_KEYS, DEFAULT_BANK_ACCOUNTS, DEFAULT_CASH_BANK_TXNS } from './storageEngine.ts';
import { ItemStorage } from './itemStorage.ts';

/**
 * Financial Accounting domain storage.
 * Handles vouchers (Receipt, Payment, Journal), expenses, bank/cash registers,
 * contra transfers, and business loans.
 */
export class FinancialStorage extends ItemStorage {
  // Vouchers
  getVouchers(): Voucher[] {
    return this.get<Voucher[]>(STORAGE_KEYS.VOUCHERS, []);
  }

  saveVoucher(voucher: Voucher): void {
    const list = [...this.getVouchers()];
    const idx = list.findIndex((v) => v.id === voucher.id);
    const prevVoucher = idx >= 0 ? list[idx] : null;

    if (idx >= 0) {
      list[idx] = voucher;
    } else {
      list.unshift(voucher);
    }
    this.set(STORAGE_KEYS.VOUCHERS, list);
    pouch.putDoc('voucher', voucher);
    this.broadcastChange('voucher', 'save', voucher.id, voucher);

    // MCA Audit Trail Hook
    const auditUser = this.getAuditUser();
    const isPaymentOrReceipt = voucher.voucherType === 'PAYMENT' || voucher.voucherType === 'RECEIPT';
    const actionType = isPaymentOrReceipt ? 'PAYMENT_RECORD' : 'VOUCHER_CREATE';
    const documentType = isPaymentOrReceipt ? 'PAYMENT' : 'VOUCHER';
    const typeLabel = voucher.voucherType === 'PAYMENT' ? 'Payment Out' : voucher.voucherType === 'RECEIPT' ? 'Payment Receipt' : 'Voucher';
    const summary = `${typeLabel} #${voucher.voucherNumber} (₹${(voucher.totalAmount || 0).toFixed(2)})${voucher.narration ? ': ' + voucher.narration : ''}`;

    auditTrail
      .logEvent({
        userId: auditUser.userId,
        userName: auditUser.userName,
        userRole: auditUser.userRole,
        actionType,
        documentId: voucher.id,
        documentType,
        previousSnapshot: prevVoucher ? JSON.parse(JSON.stringify(prevVoucher)) : undefined,
        newSnapshot: JSON.parse(JSON.stringify(voucher)),
        summary,
      })
      .catch((err) => console.error('Audit log failed for saveVoucher:', err));

    const partyIdsToRecalc = new Set<string>();
    const allParties = this.getParties();
    const findPartyId = (accountId: string, accountName?: string) => {
      const match = allParties.find(
        (p) => p.id === accountId || (accountName && p.name.trim().toLowerCase() === accountName.trim().toLowerCase())
      );
      return match?.id;
    };
    voucher.entries.forEach((e) => {
      const pid = findPartyId(e.accountId, e.accountName);
      if (pid) partyIdsToRecalc.add(pid);
    });
    if (prevVoucher) {
      prevVoucher.entries.forEach((e) => {
        const pid = findPartyId(e.accountId, e.accountName);
        if (pid) partyIdsToRecalc.add(pid);
      });
    }
    partyIdsToRecalc.forEach((pid) => this.recalculatePartyBalance(pid));

    this.notifyListeners();
  }

  deleteVoucher(id: string): void {
    const prevVoucher = this.getVouchers().find((v) => v.id === id);
    const list = this.getVouchers().filter((v) => v.id !== id);
    this.set(STORAGE_KEYS.VOUCHERS, list);
    pouch.deleteDoc('voucher', id);
    this.broadcastChange('voucher', 'delete', id);

    // MCA Audit Trail Hook
    const auditUser = this.getAuditUser();
    const isPaymentOrReceipt = prevVoucher?.voucherType === 'PAYMENT' || prevVoucher?.voucherType === 'RECEIPT';
    const actionType = 'VOUCHER_DELETE';
    const documentType = isPaymentOrReceipt ? 'PAYMENT' : 'VOUCHER';
    const summary = `Deleted voucher #${prevVoucher?.voucherNumber || id} (${prevVoucher?.voucherType || 'VOUCHER'})`;

    auditTrail
      .logEvent({
        userId: auditUser.userId,
        userName: auditUser.userName,
        userRole: auditUser.userRole,
        actionType,
        documentId: id,
        documentType,
        previousSnapshot: prevVoucher ? JSON.parse(JSON.stringify(prevVoucher)) : { id },
        newSnapshot: undefined,
        summary,
      })
      .catch((err) => console.error('Audit log failed for deleteVoucher:', err));

    if (prevVoucher) {
      const partyIdsToRecalc = new Set<string>();
      const allParties = this.getParties();
      prevVoucher.entries.forEach((e) => {
        const p = allParties.find(
          (pty) => pty.id === e.accountId || (e.accountName && pty.name.trim().toLowerCase() === e.accountName.trim().toLowerCase())
        );
        if (p) partyIdsToRecalc.add(p.id);
      });
      partyIdsToRecalc.forEach((pid) => this.recalculatePartyBalance(pid));
    }

    this.notifyListeners();
  }

  // Expenses
  getExpenses(): Expense[] {
    return this.get<Expense[]>(STORAGE_KEYS.EXPENSES, []);
  }

  saveExpense(expense: Expense): void {
    const list = [...this.getExpenses()];
    const idx = list.findIndex((e) => e.id === expense.id);
    if (idx >= 0) {
      list[idx] = expense;
    } else {
      list.unshift(expense);
    }
    this.set(STORAGE_KEYS.EXPENSES, list);
    pouch.putDoc('expense', expense);
    this.broadcastChange('expense', 'save', expense.id, expense);
    this.notifyListeners();
  }

  deleteExpense(id: string): void {
    const list = this.getExpenses().filter((e) => e.id !== id);
    this.set(STORAGE_KEYS.EXPENSES, list);
    pouch.deleteDoc('expense', id);
    this.broadcastChange('expense', 'delete', id);
    this.notifyListeners();
  }

  // Bank Accounts
  getBankAccounts(): BankAccount[] {
    const list = this.get<BankAccount[]>(STORAGE_KEYS.BANK_ACCOUNTS, DEFAULT_BANK_ACCOUNTS);
    return list && list.length > 0 ? list : DEFAULT_BANK_ACCOUNTS;
  }

  saveBankAccount(account: BankAccount): void {
    const list = [...this.getBankAccounts()];
    const idx = list.findIndex((b) => b.id === account.id);
    if (idx >= 0) {
      list[idx] = account;
    } else {
      list.push(account);
    }
    this.set(STORAGE_KEYS.BANK_ACCOUNTS, list);
    pouch.putDoc('bank_account', account);
    this.broadcastChange('bank_account', 'save', account.id, account);
    this.notifyListeners();
  }

  deleteBankAccount(id: string): void {
    if (id === 'ACC_CASH') return; // Cannot delete cash register
    const list = this.getBankAccounts().filter((b) => b.id !== id);
    this.set(STORAGE_KEYS.BANK_ACCOUNTS, list);
    pouch.deleteDoc('bank_account', id);
    this.broadcastChange('bank_account', 'delete', id);
    this.notifyListeners();
  }

  // Cash & Bank Transactions (Contra & Direct Transfers)
  getCashBankTransactions(): CashBankTransaction[] {
    return this.get<CashBankTransaction[]>(STORAGE_KEYS.CASH_BANK_TXNS, DEFAULT_CASH_BANK_TXNS);
  }

  saveCashBankTransaction(txn: CashBankTransaction): void {
    const list = [...this.getCashBankTransactions()];
    const idx = list.findIndex((t) => t.id === txn.id);
    if (idx >= 0) {
      list[idx] = txn;
    } else {
      list.unshift(txn);
    }
    this.set(STORAGE_KEYS.CASH_BANK_TXNS, list);
    pouch.putDoc('cash_bank_txn', txn);
    this.broadcastChange('cash_bank_txn', 'save', txn.id, txn);
    this.notifyListeners();
  }

  deleteCashBankTransaction(id: string): void {
    const list = this.getCashBankTransactions().filter((t) => t.id !== id);
    this.set(STORAGE_KEYS.CASH_BANK_TXNS, list);
    pouch.deleteDoc('cash_bank_txn', id);
    this.broadcastChange('cash_bank_txn', 'delete', id);
    this.notifyListeners();
  }

  // Loans & Borrowings
  getLoans(): LoanAccount[] {
    return this.get<LoanAccount[]>(STORAGE_KEYS.LOANS, []) || [];
  }

  saveLoan(loan: LoanAccount): void {
    const list = [...this.getLoans()];
    const idx = list.findIndex((l) => l.id === loan.id);
    if (idx >= 0) {
      list[idx] = loan;
    } else {
      list.push(loan);
    }
    this.set(STORAGE_KEYS.LOANS, list);
    pouch.putDoc('loan', loan);
    this.broadcastChange('loan', 'save', loan.id, loan);
    this.notifyListeners();
  }

  deleteLoan(id: string): void {
    const list = this.getLoans().filter((l) => l.id !== id);
    this.set(STORAGE_KEYS.LOANS, list);
    pouch.deleteDoc('loan', id);
    this.broadcastChange('loan', 'delete', id);
    this.notifyListeners();
  }

  getLoanTransactions(loanId?: string): LoanTransaction[] {
    const list = this.get<LoanTransaction[]>(STORAGE_KEYS.LOAN_TXNS, []) || [];
    if (loanId) {
      return list.filter((t) => t.loanId === loanId);
    }
    return list;
  }

  saveLoanTransaction(txn: LoanTransaction): void {
    const list = [...this.getLoanTransactions()];
    const idx = list.findIndex((t) => t.id === txn.id);
    if (idx >= 0) {
      list[idx] = txn;
    } else {
      list.unshift(txn);
    }
    this.set(STORAGE_KEYS.LOAN_TXNS, list);
    pouch.putDoc('loan_txn', txn);
    this.broadcastChange('loan_txn', 'save', txn.id, txn);
    this.notifyListeners();
  }
}
