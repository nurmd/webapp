import { useState, useEffect, useMemo, useCallback } from 'react';
import { Party } from '../../../models/party.ts';
import { BankAccount } from '../../../models/bankAccount.ts';
import { PassbookEntry } from '../usePartyPassbook.ts';
import { useBankAccounts } from '../../../core/store/useDataStore.ts';
import { getPartyTotalBalanceDue } from '../../../core/utils/upiAndShare.ts';

export interface UseVoucherEditorFormOptions {
  editingLedgerEntry: PassbookEntry | null;
  party: Party;
  initialEditing?: boolean;
  onReset?: () => void;
  bankAccounts?: BankAccount[];
}

export function useVoucherEditorForm({
  editingLedgerEntry,
  party,
  initialEditing,
  onReset,
  bankAccounts,
}: UseVoucherEditorFormOptions) {
  const storeBankAccounts = useBankAccounts();

  const isPayment = Boolean(
    editingLedgerEntry &&
      !editingLedgerEntry.isOpening &&
      (editingLedgerEntry.type === 'PAYMENT_IN' ||
        editingLedgerEntry.type === 'PAYMENT_OUT' ||
        editingLedgerEntry.rawVoucher ||
        editingLedgerEntry.id.startsWith('pay-inv-') ||
        editingLedgerEntry.id.startsWith('pay-pur-') ||
        editingLedgerEntry.id.startsWith('pay-'))
  );

  const [isEditing, setIsEditing] = useState<boolean>(() => {
    if (typeof initialEditing === 'boolean') return initialEditing;
    return !isPayment;
  });

  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editMode, setEditMode] = useState('UPI');
  const [editSplitCash, setEditSplitCash] = useState('');
  const [editSplitUPI, setEditSplitUPI] = useState('');
  const [editSplitBank, setEditSplitBank] = useState('');
  const [editDiscount, setEditDiscount] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editType, setEditType] = useState<'IN' | 'OUT'>('IN');
  const [editOpeningType, setEditOpeningType] = useState<'RECEIVABLE' | 'PAYABLE'>('RECEIVABLE');

  const allBankAccounts = bankAccounts || storeBankAccounts;

  const availableBankAccounts = useMemo(() => {
    const all = allBankAccounts || [];
    const banks = all.filter((a) => a.accountType === 'BANK');
    if (banks.length > 0) return banks;
    return [
      {
        id: 'ACC_BANK',
        accountName: 'Primary Bank Account',
        accountType: 'BANK' as const,
        openingBalance: 0,
        createdAt: '',
        updatedAt: '',
      },
    ];
  }, [allBankAccounts]);

  const [editBankAccountId, setEditBankAccountId] = useState<string>(() => {
    const banks = (bankAccounts || storeBankAccounts).filter((a) => a.accountType === 'BANK');
    const def = banks.find((a) => a.isDefault) || banks[0];
    return def?.id || 'ACC_BANK';
  });

  const selectedBankName = useMemo(() => {
    const found = availableBankAccounts.find((a) => a.id === editBankAccountId);
    return found?.accountName || 'Bank Account';
  }, [availableBankAccounts, editBankAccountId]);

  const partyTotalDue = useMemo(() => {
    return party ? getPartyTotalBalanceDue(party) : null;
  }, [party]);

  const populateForm = useCallback(() => {
    if (!editingLedgerEntry) return;

    setEditDate(editingLedgerEntry.date);
    const amtVal = editingLedgerEntry.credit > 0 ? editingLedgerEntry.credit : editingLedgerEntry.debit;
    setEditAmount(amtVal.toString());
    setEditMode(editingLedgerEntry.paymentMode || 'UPI');
    setEditNotes(editingLedgerEntry.description || '');
    setEditType(editingLedgerEntry.type === 'PAYMENT_IN' ? 'IN' : 'OUT');

    if (editingLedgerEntry.rawVoucher) {
      const v = editingLedgerEntry.rawVoucher;
      const discEntry = v.entries.find((e) => e.accountId === 'ACC_EXPENSE_DISCOUNT' || e.accountId === 'ACC_INCOME_DISCOUNT');
      const discVal = discEntry ? (discEntry.debit || discEntry.credit || 0) : 0;
      setEditDiscount(discVal > 0 ? discVal.toString() : '');

      const cashEntry = v.entries.find((e) => e.accountId === 'ACC_CASH');
      const bankEntries = v.entries.filter((e) => e.accountId !== 'ACC_CASH' && e.accountId !== party.id && (e.accountId.startsWith('BANK') || e.accountId.startsWith('ACC_BANK') || availableBankAccounts.some((a) => a.id === e.accountId)));
      if (bankEntries.length > 0 && bankEntries[0].accountId) {
        setEditBankAccountId(bankEntries[0].accountId);
      }
      const cashVal = cashEntry ? (cashEntry.debit || cashEntry.credit || 0) : 0;
      const bankVal = bankEntries.reduce((sum, e) => sum + (e.debit || e.credit || 0), 0);
      const paymentVal = cashVal + bankVal;
      if (paymentVal > 0) {
        setEditAmount(paymentVal.toString());
      }
      if (cashVal > 0 && bankVal > 0) {
        setEditMode('SPLIT');
        setEditSplitCash(cashVal.toString());
        setEditSplitUPI(bankVal.toString());
        setEditSplitBank('');
      } else {
        setEditSplitCash('');
        setEditSplitUPI('');
        setEditSplitBank('');
      }
    } else if (editingLedgerEntry.rawInvoice?.paymentSplits && editingLedgerEntry.rawInvoice.paymentSplits.length > 1) {
      setEditMode('SPLIT');
      const c = editingLedgerEntry.rawInvoice.paymentSplits.find((s) => s.mode === 'CASH')?.amount || 0;
      const u = editingLedgerEntry.rawInvoice.paymentSplits.find((s) => s.mode === 'UPI')?.amount || 0;
      const b = editingLedgerEntry.rawInvoice.paymentSplits.find((s) => s.mode === 'BANK' || s.mode === 'NET_BANKING')?.amount || 0;
      setEditSplitCash(c > 0 ? c.toString() : '');
      setEditSplitUPI(u > 0 ? u.toString() : '');
      setEditSplitBank(b > 0 ? b.toString() : '');
    } else if (editingLedgerEntry.rawPurchase?.paymentSplits && editingLedgerEntry.rawPurchase.paymentSplits.length > 1) {
      setEditMode('SPLIT');
      const c = editingLedgerEntry.rawPurchase.paymentSplits.find((s) => s.mode === 'CASH')?.amount || 0;
      const u = editingLedgerEntry.rawPurchase.paymentSplits.find((s) => s.mode === 'UPI')?.amount || 0;
      const b = editingLedgerEntry.rawPurchase.paymentSplits.find((s) => s.mode === 'BANK' || s.mode === 'NET_BANKING')?.amount || 0;
      setEditSplitCash(c > 0 ? c.toString() : '');
      setEditSplitUPI(u > 0 ? u.toString() : '');
      setEditSplitBank(b > 0 ? b.toString() : '');
    } else {
      setEditSplitCash('');
      setEditSplitUPI('');
      setEditSplitBank('');
    }

    if (editingLedgerEntry.isOpening) {
      const isRec = party.openingBalanceType
        ? party.openingBalanceType === 'TO_RECEIVE'
        : editingLedgerEntry.debit > 0;
      setEditOpeningType(isRec ? 'RECEIVABLE' : 'PAYABLE');
    } else {
      setEditOpeningType(editingLedgerEntry.debit > 0 ? 'RECEIVABLE' : 'PAYABLE');
    }

    onReset?.();
  }, [editingLedgerEntry, party, availableBankAccounts, onReset]);

  useEffect(() => {
    populateForm();
  }, [populateForm]);

  useEffect(() => {
    if (typeof initialEditing === 'boolean') {
      setIsEditing(initialEditing);
    } else {
      setIsEditing(!isPayment);
    }
  }, [editingLedgerEntry?.id, initialEditing, isPayment]);

  const totalSettled = useMemo(() => {
    const numPayAmount = parseFloat(editAmount) || 0;
    const numDiscount = parseFloat(editDiscount) || 0;
    return Number((numPayAmount + numDiscount).toFixed(2));
  }, [editAmount, editDiscount]);

  const isReceipt = Boolean(
    editingLedgerEntry &&
      (editingLedgerEntry.type === 'PAYMENT_IN' ||
        editType === 'IN' ||
        (editingLedgerEntry.credit > 0 && editingLedgerEntry.debit === 0))
  );

  const currentAmount =
    parseFloat(editAmount) ||
    (editingLedgerEntry ? (editingLedgerEntry.credit > 0 ? editingLedgerEntry.credit : editingLedgerEntry.debit) : 0) ||
    0;

  const currentDiscount = parseFloat(editDiscount) || 0;

  return {
    isPayment,
    isEditing,
    setIsEditing,
    editDate,
    setEditDate,
    editAmount,
    setEditAmount,
    editMode,
    setEditMode,
    editSplitCash,
    setEditSplitCash,
    editSplitUPI,
    setEditSplitUPI,
    editSplitBank,
    setEditSplitBank,
    editDiscount,
    setEditDiscount,
    editNotes,
    setEditNotes,
    editType,
    setEditType,
    editOpeningType,
    setEditOpeningType,
    availableBankAccounts,
    editBankAccountId,
    setEditBankAccountId,
    selectedBankName,
    partyTotalDue,
    populateForm,
    totalSettled,
    isReceipt,
    currentAmount,
    currentDiscount,
  };
}
