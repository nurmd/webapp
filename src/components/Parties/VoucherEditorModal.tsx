import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Invoice, PaymentMode, PaymentSplit } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Voucher, JournalEntryLine } from '../../core/accounting/voucherTypes.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { safeOpenExternalUrl, getPartyTotalBalanceDue } from '../../core/utils/upiAndShare.ts';
import { buildWhatsAppSendUrl } from '../../core/utils/whatsappIntent.ts';
import { db } from '../../services/db.ts';
import { PassbookEntry } from './usePartyPassbook.ts';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

export interface VoucherEditorModalProps {
  editingLedgerEntry: PassbookEntry | null;
  onClose: () => void;
  party: Party;
  company?: CompanyProfile;
  initialEditing?: boolean;
  onViewInvoice?: (invoice: Invoice) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onEditPurchase?: (bill: PurchaseBill) => void;
  onViewPurchase?: (bill: PurchaseBill) => void;
  onRefresh?: () => void;
}

export const VoucherEditorModal: React.FC<VoucherEditorModalProps> = ({
  editingLedgerEntry,
  onClose,
  party,
  company,
  initialEditing,
  onViewInvoice,
  onEditInvoice,
  onEditPurchase,
  onViewPurchase,
  onRefresh,
}) => {
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

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
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

  const availableBankAccounts = useMemo(() => {
    const all = db.getBankAccounts() || [];
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
  }, []);

  const [editBankAccountId, setEditBankAccountId] = useState<string>(() => {
    const banks = db.getBankAccounts().filter((a) => a.accountType === 'BANK');
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
  }, [editingLedgerEntry, party, availableBankAccounts]);

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

  useBackNavigation(() => {
    if (isEditing && isPayment) {
      populateForm();
      setIsEditing(false);
      return true;
    }
    onClose();
    return true;
  }, !!editingLedgerEntry, 20);

  // Guard after ALL hooks have been registered
  if (!editingLedgerEntry) return null;

  const isReceipt =
    editingLedgerEntry.type === 'PAYMENT_IN' ||
    editType === 'IN' ||
    (editingLedgerEntry.credit > 0 && editingLedgerEntry.debit === 0);

  const currentAmount =
    parseFloat(editAmount) ||
    (editingLedgerEntry.credit > 0 ? editingLedgerEntry.credit : editingLedgerEntry.debit) ||
    0;

  const currentDiscount = parseFloat(editDiscount) || 0;

  const handleSaveLedgerItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLedgerEntry) return;

    let newAmt = parseFloat(editAmount);
    if (editMode === 'SPLIT') {
      const c = parseFloat(editSplitCash) || 0;
      const u = parseFloat(editSplitUPI) || 0;
      const b = parseFloat(editSplitBank) || 0;
      const splitTotal = Number((c + u + b).toFixed(2));
      if (splitTotal > 0) {
        newAmt = splitTotal;
      }
    }

    if (isNaN(newAmt) || newAmt < 0) {
      alert('Please enter a valid amount.');
      return;
    }

    const prevAmt = editingLedgerEntry.credit > 0 ? editingLedgerEntry.credit : editingLedgerEntry.debit;

    // 1. Voucher edit
    if (editingLedgerEntry.rawVoucher) {
      const v = editingLedgerEntry.rawVoucher;
      const newVoucherType = editType === 'IN' ? 'RECEIPT' : 'PAYMENT';
      const disc = parseFloat(editDiscount) || 0;
      const totalSettled = Number((newAmt + disc).toFixed(2));

      // Allocation validation & handling
      const oldAllocations = v.paymentAllocations || [];
      const allocatedSum = oldAllocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
      const isTypeChanged = (v.voucherType === 'RECEIPT' && editType !== 'IN') || (v.voucherType === 'PAYMENT' && editType === 'IN');

      let finalAllocations = oldAllocations.map((a) => ({
        ...a,
        date: editDate,
      }));
      let finalAllocationMode = v.allocationMode;

      if (isTypeChanged) {
        finalAllocations = [];
        finalAllocationMode = 'UNALLOCATED';
      } else if (v.allocationMode === 'SOURCE_DOCUMENT') {
        if (Math.abs(totalSettled - v.totalAmount) > 0.01) {
          alert(
            'Cannot change the amount of an upfront payment voucher directly. Please edit the paid amount from the invoice or bill instead.'
          );
          return;
        }
      } else {
        if (allocatedSum > 0) {
          if (totalSettled < allocatedSum - 0.01) {
            alert(
              `New total settled amount (${formatINR(totalSettled)}) cannot be less than the total allocated to linked documents (${formatINR(allocatedSum)}). Please adjust the amount or un-link documents.`
            );
            return;
          }
        }
        if (Math.abs(totalSettled - v.totalAmount) > 0.01) {
          finalAllocationMode = finalAllocations.length > 0 ? 'MANUAL' : 'UNALLOCATED';
        }
      }

      let entries: JournalEntryLine[] = [];
      if (editMode === 'SPLIT') {
        const c = parseFloat(editSplitCash) || 0;
        const u = parseFloat(editSplitUPI) || 0;
        const b = parseFloat(editSplitBank) || 0;
        const bankSum = Number((u + b).toFixed(2));

        if (editType === 'IN') {
          if (c > 0) entries.push({ accountId: 'ACC_CASH', accountName: 'Cash-in-hand', debit: c, credit: 0, narration: 'Payment received via CASH' });
          if (bankSum > 0) entries.push({ accountId: 'ACC_BANK', accountName: 'Bank Account', debit: bankSum, credit: 0, narration: 'Payment received via BANK/UPI' });
          if (disc > 0) entries.push({ accountId: 'ACC_EXPENSE_DISCOUNT', accountName: 'Discount Allowed', debit: disc, credit: 0, narration: 'Cash discount allowed' });
          entries.push({ accountId: party.id, accountName: party.name, debit: 0, credit: totalSettled, narration: editNotes || v.narration });
        } else {
          entries.push({ accountId: party.id, accountName: party.name, debit: totalSettled, credit: 0, narration: editNotes || v.narration });
          if (c > 0) entries.push({ accountId: 'ACC_CASH', accountName: 'Cash-in-hand', debit: 0, credit: c, narration: 'Paid via CASH' });
          if (bankSum > 0) entries.push({ accountId: 'ACC_BANK', accountName: 'Bank Account', debit: 0, credit: bankSum, narration: 'Paid via BANK/UPI' });
          if (disc > 0) entries.push({ accountId: 'ACC_INCOME_DISCOUNT', accountName: 'Discount Received', debit: 0, credit: disc, narration: 'Cash discount received' });
        }
      } else {
        const selectedBank = availableBankAccounts.find((a) => a.id === editBankAccountId) || availableBankAccounts[0];
        const accId = editMode === 'CASH' ? 'ACC_CASH' : (selectedBank?.id || 'ACC_BANK');
        const accName = editMode === 'CASH' ? 'Cash-in-hand' : (selectedBank?.accountName || 'Bank Account');
        if (editType === 'IN') {
          entries.push({ accountId: accId, accountName: accName, debit: newAmt, credit: 0, narration: `Payment received via ${editMode}${selectedBank && editMode === 'BANK' ? ` (${selectedBank.accountName})` : ''}` });
          if (disc > 0) entries.push({ accountId: 'ACC_EXPENSE_DISCOUNT', accountName: 'Discount Allowed', debit: disc, credit: 0, narration: 'Cash discount allowed' });
          entries.push({ accountId: party.id, accountName: party.name, debit: 0, credit: totalSettled, narration: editNotes || v.narration });
        } else {
          entries.push({ accountId: party.id, accountName: party.name, debit: totalSettled, credit: 0, narration: editNotes || v.narration });
          entries.push({ accountId: accId, accountName: accName, debit: 0, credit: newAmt, narration: `Paid via ${editMode}${selectedBank && editMode === 'BANK' ? ` (${selectedBank.accountName})` : ''}` });
          if (disc > 0) entries.push({ accountId: 'ACC_INCOME_DISCOUNT', accountName: 'Discount Received', debit: 0, credit: disc, narration: 'Cash discount received' });
        }
      }

      const updatedVoucher: Voucher = {
        ...v,
        date: editDate,
        voucherType: newVoucherType,
        totalAmount: totalSettled,
        narration: editNotes || v.narration,
        entries,
        partyId: party.id,
        partyName: party.name,
        paymentAllocations: finalAllocations,
        allocationMode: finalAllocationMode,
      };

      try {
        db.savePaymentVoucher(updatedVoucher);
      } catch (err: any) {
        alert(err.message || 'Failed to save voucher.');
        return;
      }
    }
    // 2. Invoice payment edit (pay-inv)
    else if (editingLedgerEntry.id.startsWith('pay-inv-') && editingLedgerEntry.rawInvoice) {
      const inv = editingLedgerEntry.rawInvoice;
      const delta = newAmt - prevAmt;
      const newPaid = Math.max(0, inv.paidAmount + delta);
      const newBalInv = Math.max(0, inv.grandTotal - newPaid);
      const safePaymentMode: PaymentMode = editMode === 'SPLIT' ? 'SPLIT' : editMode === 'BANK' ? 'NET_BANKING' : (editMode as PaymentMode);

      let updatedSplits: PaymentSplit[] | undefined = inv.paymentSplits;
      if (editMode === 'SPLIT') {
        const c = parseFloat(editSplitCash) || 0;
        const u = parseFloat(editSplitUPI) || 0;
        const b = parseFloat(editSplitBank) || 0;
        const selectedBank = availableBankAccounts.find((a) => a.id === editBankAccountId) || availableBankAccounts[0];
        const existingUpi = inv.paymentSplits?.find((s) => s.mode === 'UPI');
        const existingBank = inv.paymentSplits?.find((s) => s.mode === 'BANK' || s.mode === 'NET_BANKING');
        const splits: PaymentSplit[] = [];
        if (c > 0) splits.push({ id: `s-c-${Date.now()}`, mode: 'CASH', amount: c, accountId: 'ACC_CASH', accountName: 'Cash-in-hand' });
        if (u > 0) splits.push({ id: `s-u-${Date.now()}`, mode: 'UPI', amount: u, accountId: existingUpi?.accountId || selectedBank?.id, accountName: existingUpi?.accountName || selectedBank?.accountName });
        if (b > 0) splits.push({ id: `s-b-${Date.now()}`, mode: 'BANK', amount: b, accountId: existingBank?.accountId || selectedBank?.id, accountName: existingBank?.accountName || selectedBank?.accountName });
        if (newBalInv > 0) splits.push({ id: `s-bal-${Date.now()}`, mode: 'CREDIT', amount: newBalInv });
        if (splits.length > 0) updatedSplits = splits;
      }

      const updatedInv: Invoice = {
        ...inv,
        paidAmount: newPaid,
        balanceAmount: newBalInv,
        paymentStatus: newBalInv <= 0.01 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID',
        paymentMode: safePaymentMode,
        paymentSplits: updatedSplits,
        updatedAt: new Date().toISOString(),
      };
      db.saveInvoice(updatedInv);
      db.saveParty({
        ...party,
        currentBalance: party.currentBalance - delta,
        updatedAt: new Date().toISOString(),
      });
    }
    // 3. Purchase payment edit (pay-pur)
    else if (editingLedgerEntry.id.startsWith('pay-pur-') && editingLedgerEntry.rawPurchase) {
      const pur = editingLedgerEntry.rawPurchase;
      const delta = newAmt - prevAmt;
      const newPaid = Math.max(0, pur.paidAmount + delta);
      const newBalPur = Math.max(0, pur.grandTotal - newPaid);
      const safePaymentMode: PaymentMode = editMode === 'SPLIT' ? 'SPLIT' : editMode === 'BANK' ? 'NET_BANKING' : (editMode as PaymentMode);

      let updatedSplits: PaymentSplit[] | undefined = pur.paymentSplits;
      if (editMode === 'SPLIT') {
        const c = parseFloat(editSplitCash) || 0;
        const u = parseFloat(editSplitUPI) || 0;
        const b = parseFloat(editSplitBank) || 0;
        const selectedBank = availableBankAccounts.find((a) => a.id === editBankAccountId) || availableBankAccounts[0];
        const existingUpi = pur.paymentSplits?.find((s) => s.mode === 'UPI');
        const existingBank = pur.paymentSplits?.find((s) => s.mode === 'BANK' || s.mode === 'NET_BANKING');
        const splits: PaymentSplit[] = [];
        if (c > 0) splits.push({ id: `s-c-${Date.now()}`, mode: 'CASH', amount: c, accountId: 'ACC_CASH', accountName: 'Cash-in-hand' });
        if (u > 0) splits.push({ id: `s-u-${Date.now()}`, mode: 'UPI', amount: u, accountId: existingUpi?.accountId || selectedBank?.id, accountName: existingUpi?.accountName || selectedBank?.accountName });
        if (b > 0) splits.push({ id: `s-b-${Date.now()}`, mode: 'BANK', amount: b, accountId: existingBank?.accountId || selectedBank?.id, accountName: existingBank?.accountName || selectedBank?.accountName });
        if (newBalPur > 0) splits.push({ id: `s-bal-${Date.now()}`, mode: 'CREDIT', amount: newBalPur });
        if (splits.length > 0) updatedSplits = splits;
      }

      const updatedPur: PurchaseBill = {
        ...pur,
        paidAmount: newPaid,
        balanceAmount: newBalPur,
        paymentStatus: newBalPur <= 0.01 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID',
        paymentMode: safePaymentMode,
        paymentSplits: updatedSplits,
        updatedAt: new Date().toISOString(),
      };
      db.savePurchase(updatedPur);
      db.saveParty({
        ...party,
        currentBalance: party.currentBalance + delta,
        updatedAt: new Date().toISOString(),
      });
    }
    // 4. Sales invoice entry edit (sale-)
    else if (editingLedgerEntry.type === 'SALE' && editingLedgerEntry.rawInvoice) {
      const inv = editingLedgerEntry.rawInvoice;
      const delta = newAmt - inv.grandTotal;
      const newGrandTotal = newAmt;
      const newBalInv = Math.max(0, newGrandTotal - inv.paidAmount);

      const updatedInv: Invoice = {
        ...inv,
        date: editDate,
        grandTotal: newGrandTotal,
        balanceAmount: newBalInv,
        paymentStatus: newBalInv <= 0.01 ? 'PAID' : inv.paidAmount > 0 ? 'PARTIAL' : 'UNPAID',
        updatedAt: new Date().toISOString(),
      };
      db.saveInvoice(updatedInv);
      db.saveParty({
        ...party,
        currentBalance: party.currentBalance + delta,
        updatedAt: new Date().toISOString(),
      });
    }
    // 5. Purchase bill entry edit (pur-)
    else if (editingLedgerEntry.type === 'PURCHASE' && editingLedgerEntry.rawPurchase) {
      const pur = editingLedgerEntry.rawPurchase;
      const delta = newAmt - pur.grandTotal;
      const newGrandTotal = newAmt;
      const newBalPur = Math.max(0, newGrandTotal - pur.paidAmount);

      const updatedPur: PurchaseBill = {
        ...pur,
        date: editDate,
        grandTotal: newGrandTotal,
        balanceAmount: newBalPur,
        paymentStatus: newBalPur <= 0.01 ? 'PAID' : pur.paidAmount > 0 ? 'PARTIAL' : 'UNPAID',
        updatedAt: new Date().toISOString(),
      };
      db.savePurchase(updatedPur);
      db.saveParty({
        ...party,
        currentBalance: party.currentBalance - delta,
        updatedAt: new Date().toISOString(),
      });
    }
    // 6. Opening balance edit
    else if (editingLedgerEntry.isOpening) {
      if (newAmt === 0) {
        db.clearPartyOpeningBalance(party.id);
      } else {
        const hasOldExplicit = typeof party.openingBalance === 'number';
        const oldRawOpening = hasOldExplicit ? party.openingBalance! : 0;
        const oldType = party.openingBalanceType || (party.type === 'CUSTOMER' ? 'TO_RECEIVE' : 'TO_PAY');
        const oldSignedOpening = oldRawOpening > 0 ? (oldType === 'TO_RECEIVE' ? oldRawOpening : -oldRawOpening) : 0;

        const newSignedOpening = editOpeningType === 'RECEIVABLE' ? newAmt : -newAmt;
        const delta = newSignedOpening - oldSignedOpening;
        const finalBal = party.currentBalance + delta;

        const updatedParty: Party = {
          ...party,
          openingBalance: newAmt,
          openingBalanceType: editOpeningType === 'RECEIVABLE' ? 'TO_RECEIVE' : 'TO_PAY',
          openingBalanceDate: editDate,
          currentBalance: finalBal,
          updatedAt: new Date().toISOString(),
        };
        db.saveParty(updatedParty);
        db.recalculatePartyBalance(party.id);
      }
    }

    onClose();
    onRefresh?.();
  };

  const executeDeleteLedgerItem = (entry: PassbookEntry) => {
    try {
      if (entry.rawVoucher) {
        const v = entry.rawVoucher;
        db.reversePaymentVoucher(v, `Reversal of ${v.voucherType} #${v.voucherNumber} from Party Passbook`);
      } else if (entry.id.startsWith('pay-inv-') && entry.rawInvoice) {
        const inv = entry.rawInvoice;
        const amt = entry.credit;
        const newPaid = Math.max(0, (inv.paidAmount || 0) - amt);
        const newBalance = Number((inv.grandTotal - newPaid).toFixed(2));
        const updatedInv: Invoice = {
          ...inv,
          paidAmount: newPaid,
          balanceAmount: newBalance,
          paymentStatus: newPaid <= 0 ? 'UNPAID' : (newPaid >= inv.grandTotal ? 'PAID' : 'PARTIAL'),
          updatedAt: new Date().toISOString(),
        };
        db.saveInvoice(updatedInv);
        db.recalculatePartyBalance(party.id);
      } else if (entry.id.startsWith('pay-pur-') && entry.rawPurchase) {
        const pur = entry.rawPurchase;
        const amt = entry.debit;
        const newPaid = Math.max(0, (pur.paidAmount || 0) - amt);
        const newBalance = Number((pur.grandTotal - newPaid).toFixed(2));
        const updatedPur: PurchaseBill = {
          ...pur,
          paidAmount: newPaid,
          balanceAmount: newBalance,
          paymentStatus: newPaid <= 0 ? 'UNPAID' : (newPaid >= pur.grandTotal ? 'PAID' : 'PARTIAL'),
          updatedAt: new Date().toISOString(),
        };
        db.savePurchase(updatedPur);
        db.recalculatePartyBalance(party.id);
      } else if (entry.isOpening) {
        db.clearPartyOpeningBalance(party.id);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete / reverse transaction.');
      return;
    }

    onClose();
    onRefresh?.();
  };

  const handleDeleteLedgerItem = () => {
    setIsDeleteConfirmOpen(true);
  };

  const handleShareWhatsApp = () => {
    if (!editingLedgerEntry) return;

    const companyName =
      company?.tradeName ||
      company?.businessName ||
      db.getCompany()?.tradeName ||
      db.getCompany()?.businessName ||
      'Vyapar Books';

    const voucherTitle = isReceipt ? 'Payment In Receipt' : 'Payment Out Voucher';
    const numAmt = currentAmount;
    const discAmt = currentDiscount;
    const totalDue = partyTotalDue;

    const lines: string[] = [
      `*${voucherTitle} - ${companyName}*`,
      '--------------------------------',
      `*Receipt No:* ${editingLedgerEntry.docNumber}`,
      `*Type:* ${isReceipt ? 'Payment In' : 'Payment Out'}`,
      `*Date:* ${formatDate(editDate || editingLedgerEntry.date)}`,
      `*Party:* ${party.name}`,
      `*Amount:* ${formatINR(numAmt)}`,
    ];

    if (discAmt > 0) {
      lines.push(`*Discount:* ${formatINR(discAmt)}`);
      lines.push(`*Total Settled:* ${formatINR(numAmt + discAmt)}`);
    }

    if (editMode) {
      if (editMode === 'BANK') {
        const selectedBank = availableBankAccounts.find((a) => a.id === editBankAccountId);
        lines.push(`*Payment Mode:* Bank${selectedBank ? ` (${selectedBank.accountName})` : ''}`);
      } else if (editMode === 'SPLIT') {
        const c = parseFloat(editSplitCash) || 0;
        const u = parseFloat(editSplitUPI) || 0;
        const b = parseFloat(editSplitBank) || 0;
        const parts: string[] = [];
        if (c > 0) parts.push(`Cash: ${formatINR(c)}`);
        if (u > 0) parts.push(`UPI: ${formatINR(u)}`);
        if (b > 0) parts.push(`Bank: ${formatINR(b)}`);
        lines.push(`*Payment Mode:* Split (${parts.join(', ')})`);
      } else {
        lines.push(`*Payment Mode:* ${editMode}`);
      }
    }

    if (totalDue !== null && !isNaN(totalDue)) {
      lines.push(`*Total Balance Due:* ${formatINR(totalDue)}`);
    }

    const narration = editNotes || editingLedgerEntry.description || editingLedgerEntry.rawVoucher?.narration;
    if (narration) {
      lines.push(`*Notes:* ${narration}`);
    }

    lines.push('--------------------------------');
    lines.push('Recorded in GST Billing App');

    const text = lines.join('\n');
    const { url } = buildWhatsAppSendUrl({ phone: party.phone, text });
    safeOpenExternalUrl(url);
  };

  const renderLinkedDocs = () => (
    <>
      {/* View/Edit Invoice buttons if linked to a full sales invoice */}
      {editingLedgerEntry.rawInvoice && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/10 border border-primary/20 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary text-[18px]">receipt_long</span>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-primary/80 block">Linked Sales Invoice</span>
              <span className="text-primary font-bold truncate">#{editingLedgerEntry.rawInvoice.invoiceNumber}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onViewInvoice && (
              <button
                type="button"
                onClick={() => {
                  const inv = editingLedgerEntry.rawInvoice!;
                  onClose();
                  onViewInvoice(inv);
                }}
                className="px-3 py-1.5 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[14px]">visibility</span>
                <span>View</span>
              </button>
            )}
            {onEditInvoice && (
              <button
                type="button"
                onClick={() => {
                  const inv = editingLedgerEntry.rawInvoice!;
                  onClose();
                  onEditInvoice(inv);
                }}
                className="px-3 py-1.5 rounded-xl bg-surface-container text-on-surface font-bold text-xs cursor-pointer flex items-center gap-1 active:scale-95 transition-all hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-[14px]">edit</span>
                <span>Edit</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Linked Documents Section for Vouchers */}
      {editingLedgerEntry.rawVoucher?.paymentAllocations && editingLedgerEntry.rawVoucher.paymentAllocations.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-2">
          <span className="text-[11px] font-bold text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-secondary">link</span>
            <span>Linked Documents ({editingLedgerEntry.rawVoucher.paymentAllocations.length})</span>
          </span>
          <div className="flex flex-col gap-1.5 divide-y divide-outline-variant/15 text-xs">
            {editingLedgerEntry.rawVoucher.paymentAllocations.map((alloc) => (
              <div key={alloc.documentId} className="pt-1.5 pb-0.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      alloc.documentType === 'INVOICE'
                        ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                        : 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
                    }`}
                  >
                    {alloc.documentType === 'INVOICE' ? 'Invoice' : 'Bill'}
                  </span>
                  <span className="font-bold text-on-surface truncate">#{alloc.documentNumber}</span>
                  <span className="text-secondary font-bold font-tabular-data">({formatINR(alloc.amount)})</span>
                </div>
                {alloc.documentType === 'INVOICE' && onViewInvoice && (
                  <button
                    type="button"
                    onClick={() => {
                      const inv = db.getInvoices().find((i) => i.id === alloc.documentId || i.invoiceNumber === alloc.documentNumber);
                      if (inv) {
                        onClose();
                        onViewInvoice(inv);
                      }
                    }}
                    className="px-2.5 py-1 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[13px]">visibility</span>
                    <span>View</span>
                  </button>
                )}
                {alloc.documentType === 'PURCHASE' && (onViewPurchase || onEditPurchase) && (
                  <button
                    type="button"
                    onClick={() => {
                      const pur = db.getPurchases().find((p) => p.id === alloc.documentId || p.billNumber === alloc.documentNumber);
                      if (pur) {
                        onClose();
                        if (onViewPurchase) onViewPurchase(pur);
                        else if (onEditPurchase) onEditPurchase(pur);
                      }
                    }}
                    className="px-2.5 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold text-xs flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[13px]">visibility</span>
                    <span>View</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View/Edit Purchase buttons if linked to a purchase bill */}
      {editingLedgerEntry.rawPurchase && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-orange-600 dark:text-orange-400 text-[18px]">shopping_bag</span>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-orange-700 dark:text-orange-300 block">Linked Purchase Bill</span>
              <span className="text-orange-600 dark:text-orange-400 font-bold truncate">#{editingLedgerEntry.rawPurchase.billNumber}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onViewPurchase && (
              <button
                type="button"
                onClick={() => {
                  const bill = editingLedgerEntry.rawPurchase!;
                  onClose();
                  onViewPurchase(bill);
                }}
                className="px-3 py-1.5 rounded-xl bg-orange-600 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[14px]">visibility</span>
                <span>View</span>
              </button>
            )}
            {onEditPurchase && (
              <button
                type="button"
                onClick={() => {
                  const bill = editingLedgerEntry.rawPurchase!;
                  onClose();
                  onEditPurchase(bill);
                }}
                className="px-3 py-1.5 rounded-xl bg-surface-container text-on-surface font-bold text-xs cursor-pointer flex items-center gap-1 active:scale-95 transition-all hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-[14px]">edit</span>
                <span>Edit</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-3xl w-full max-w-md shadow-2xl border border-outline-variant/30 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-4 py-3.5 flex-shrink-0 bg-surface">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isReceipt
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isReceipt ? 'south_west' : 'north_east'}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-on-surface truncate">
                  {isEditing
                    ? editingLedgerEntry.type === 'SALE'
                      ? 'Edit Sales Invoice'
                      : editingLedgerEntry.type === 'PURCHASE'
                      ? 'Edit Purchase Bill'
                      : isReceipt
                      ? 'Edit Payment In'
                      : 'Edit Payment Out'
                    : isReceipt
                    ? 'Payment In Details'
                    : editingLedgerEntry.type === 'SALE'
                    ? 'Sales Invoice Details'
                    : editingLedgerEntry.type === 'PURCHASE'
                    ? 'Purchase Bill Details'
                    : 'Payment Out Details'}
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isReceipt
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {isReceipt ? 'Payment In' : 'Payment Out'}
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant font-medium">
                Doc #{editingLedgerEntry.docNumber} • {formatDate(editDate || editingLedgerEntry.date)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
            title="Close"
            aria-label="Close transaction details"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {!isEditing ? (
          <>
            {/* Scrollable Content Area */}
            <div data-testid="voucher-readonly-view" className="flex-1 overflow-y-auto p-4 space-y-3.5 overscroll-contain text-xs">
              {/* Amount Hero Card */}
              <div
                className={`p-4 rounded-2xl border flex flex-col items-center justify-center relative overflow-hidden ${
                  isReceipt
                    ? 'bg-gradient-to-b from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/25'
                    : 'bg-gradient-to-b from-rose-500/10 via-rose-500/5 to-transparent border-rose-500/25'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider ${
                      isReceipt ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {isReceipt ? 'Amount Received' : 'Amount Paid'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-container-high/80 text-on-surface-variant">
                    <span className="material-symbols-outlined text-[13px] text-emerald-600 dark:text-emerald-400">
                      check_circle
                    </span>
                    <span>Recorded</span>
                  </span>
                </div>

                <div
                  className={`font-tabular-data text-3xl sm:text-4xl font-black my-1 tracking-tight ${
                    isReceipt
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {formatINR(currentAmount)}
                </div>

                <div className="flex items-center gap-2 mt-1 flex-wrap justify-center text-xs">
                  <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                    <span>{formatDate(editDate || editingLedgerEntry.date)}</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">
                      {editMode === 'CASH' ? 'payments' : editMode === 'BANK' ? 'account_balance' : editMode === 'SPLIT' ? 'call_split' : 'qr_code_2'}
                    </span>
                    <span>{editMode === 'BANK' ? `Bank (${selectedBankName})` : editMode}</span>
                  </span>
                </div>

                {currentDiscount > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-outline-variant/20 w-full flex items-center justify-between text-xs">
                    <span className="text-on-surface-variant font-medium">
                      Discount {isReceipt ? 'Allowed' : 'Received'}:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-secondary font-tabular-data">{formatINR(currentDiscount)}</span>
                      <span className="text-on-surface-variant text-[11px]">
                        (Settled: <strong className="font-tabular-data">{formatINR(currentAmount + currentDiscount)}</strong>)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Party & Balance Card */}
              <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Party Details
                  </span>
                  {party.phone && (
                    <a
                      href={`tel:${party.phone}`}
                      className="text-[11px] font-bold text-secondary flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[13px]">call</span>
                      <span>{party.phone}</span>
                    </a>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-secondary/15 text-secondary flex items-center justify-center font-black text-xs flex-shrink-0">
                      {party.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-sm text-on-surface block truncate">
                        {party.name}
                      </span>
                      <span className="text-[10px] font-medium text-on-surface-variant">
                        {party.type === 'CUSTOMER' ? 'Customer' : 'Supplier'}
                      </span>
                    </div>
                  </div>
                  {partyTotalDue !== null && !isNaN(partyTotalDue) && (
                    <div className="text-right flex-shrink-0">
                      <div className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">
                        Total Balance Due
                      </div>
                      <div
                        className={`font-black text-sm font-tabular-data ${
                          partyTotalDue > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {formatINR(partyTotalDue)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Details & Notes Card */}
              <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Payment Method
                  </span>
                  <span className="font-bold text-on-surface">
                    {editMode === 'BANK' ? `Bank (${selectedBankName})` : editMode}
                  </span>
                </div>

                {editMode === 'SPLIT' && (
                  <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant/20 flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-secondary">call_split</span>
                      <span>Split Tender Breakdown</span>
                    </span>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      {parseFloat(editSplitCash) > 0 && (
                        <span className="px-2 py-0.5 rounded-lg bg-surface border border-outline-variant/25 font-bold text-on-surface">
                          Cash: <span className="text-secondary font-tabular-data">{formatINR(parseFloat(editSplitCash))}</span>
                        </span>
                      )}
                      {parseFloat(editSplitUPI) > 0 && (
                        <span className="px-2 py-0.5 rounded-lg bg-surface border border-outline-variant/25 font-bold text-on-surface">
                          UPI: <span className="text-secondary font-tabular-data">{formatINR(parseFloat(editSplitUPI))}</span>
                        </span>
                      )}
                      {parseFloat(editSplitBank) > 0 && (
                        <span className="px-2 py-0.5 rounded-lg bg-surface border border-outline-variant/25 font-bold text-on-surface">
                          Bank: <span className="text-secondary font-tabular-data">{formatINR(parseFloat(editSplitBank))}</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {(editNotes || editingLedgerEntry.description || editingLedgerEntry.rawVoucher?.narration) && (
                  <div className="pt-2 border-t border-outline-variant/15 flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                      Notes / Remarks
                    </span>
                    <p className="text-xs text-on-surface italic bg-surface-container/50 p-2.5 rounded-xl border border-outline-variant/15 leading-relaxed">
                      "{editNotes || editingLedgerEntry.description || editingLedgerEntry.rawVoucher?.narration}"
                    </p>
                  </div>
                )}
              </div>

              {/* Linked Documents (Invoice / Purchase / Allocations) */}
              {renderLinkedDocs()}
            </div>

            {/* Read-Only Actions Footer */}
            <div className="flex items-center justify-between gap-2 p-3.5 border-t border-outline-variant/20 bg-surface-container-lowest/90 backdrop-blur-xs flex-shrink-0">
              {(editingLedgerEntry.rawVoucher || editingLedgerEntry.id.startsWith('pay-inv-') || editingLedgerEntry.id.startsWith('pay-pur-') || editingLedgerEntry.isOpening) ? (
                <button
                  type="button"
                  onClick={handleDeleteLedgerItem}
                  className="px-3 py-2 rounded-xl bg-error/10 hover:bg-error/20 text-error font-bold text-xs flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                  title="Delete transaction"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  <span>Delete</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="voucher-share-whatsapp"
                  onClick={handleShareWhatsApp}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                  title="Share on WhatsApp"
                >
                  <span className="material-symbols-outlined text-[16px]">share</span>
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  data-testid="voucher-edit-button"
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/90 text-on-secondary font-bold text-xs shadow-sm flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                  title="Edit transaction"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  <span>Edit</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <form onSubmit={handleSaveLedgerItem} className="flex-1 flex flex-col min-h-0 overflow-hidden text-xs">
            <div className="flex-1 overflow-y-auto p-4 space-y-3 overscroll-contain">
              <div className="p-2.5 rounded-xl bg-surface-container-low text-[11px] text-on-surface-variant flex items-center justify-between">
                <span>Doc: <strong>#{editingLedgerEntry.docNumber}</strong></span>
                <span className="font-semibold">{editingLedgerEntry.type.replace('_', ' ')}</span>
              </div>

              {/* Linked Documents in Edit Mode */}
              {renderLinkedDocs()}

              {/* Payment Type switch if payment */}
              {(editingLedgerEntry.rawVoucher || editingLedgerEntry.type === 'PAYMENT_IN' || editingLedgerEntry.type === 'PAYMENT_OUT') && (
                <div className="grid grid-cols-2 gap-1 p-0.5 bg-surface rounded-xl border border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => setEditType('IN')}
                    className={`py-1.5 rounded-lg font-bold cursor-pointer transition-all ${
                      editType === 'IN' ? 'bg-secondary text-on-secondary shadow-xs' : 'text-on-surface-variant'
                    }`}
                  >
                    Payment In
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditType('OUT')}
                    className={`py-1.5 rounded-lg font-bold cursor-pointer transition-all ${
                      editType === 'OUT' ? 'bg-amber-600 text-white shadow-xs' : 'text-on-surface-variant'
                    }`}
                  >
                    Payment Out
                  </button>
                </div>
              )}

              {/* Date, Amount & Discount */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1 text-[11px]">Date</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-surface-container-low rounded-xl text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary min-h-[38px]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1 text-[11px]">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-surface-container-low rounded-xl font-bold text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary min-h-[38px]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-on-surface-variant mb-1 text-[11px]">
                    {editType === 'IN' ? 'Discount Allowed (₹)' : 'Discount Received (₹)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-surface-container-low rounded-xl font-bold text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary min-h-[38px]"
                  />
                </div>
              </div>

              {parseFloat(editDiscount) > 0 && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/10 rounded-xl text-xs font-bold text-secondary">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px]">discount</span>
                    <span>Total Settled against Balance:</span>
                  </span>
                  <span>{formatINR((parseFloat(editAmount) || 0) + (parseFloat(editDiscount) || 0))}</span>
                </div>
              )}

              {/* Payment Mode & Bank Account */}
              {(editingLedgerEntry.rawVoucher || editingLedgerEntry.paymentMode) && (
                <div className="flex flex-col gap-2.5">
                  <div className={`grid gap-2.5 ${editMode === 'BANK' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="voucher-edit-mode-select" className="text-[11px] font-bold text-on-surface-variant">
                        Payment Mode
                      </label>
                      <select
                        id="voucher-edit-mode-select"
                        value={editMode}
                        onChange={(e) => {
                          const m = e.target.value;
                          setEditMode(m);
                          if (m === 'SPLIT') {
                            const total = parseFloat(editAmount) || 0;
                            if (total > 0 && !editSplitCash && !editSplitUPI && !editSplitBank) {
                              if (editMode === 'CASH') setEditSplitCash(total.toString());
                              else if (editMode === 'BANK') setEditSplitBank(total.toString());
                              else setEditSplitUPI(total.toString());
                            }
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-surface-container-low rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[38px] cursor-pointer"
                      >
                        <option value="UPI">UPI</option>
                        <option value="CASH">Cash</option>
                        <option value="BANK">Bank</option>
                        <option value="SPLIT">Split Tender</option>
                      </select>
                    </div>

                    {editMode === 'BANK' && (
                      <div className="flex flex-col gap-1 animate-in fade-in">
                        <label htmlFor="voucher-bank-select" className="text-[11px] font-bold text-on-surface-variant truncate">
                          {editType === 'IN' ? 'Deposit to Bank' : 'Pay from Bank'}
                        </label>
                        <select
                          id="voucher-bank-select"
                          value={editBankAccountId}
                          onChange={(e) => setEditBankAccountId(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface-container-low rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[38px] cursor-pointer"
                        >
                          {availableBankAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.accountName} {acc.accountNumber ? `(•••${acc.accountNumber.slice(-4)})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {editMode === 'SPLIT' && (() => {
                    const target = parseFloat(editAmount) || 0;
                    const c = parseFloat(editSplitCash) || 0;
                    const u = parseFloat(editSplitUPI) || 0;
                    const b = parseFloat(editSplitBank) || 0;
                    const allocated = Number((c + u + b).toFixed(2));
                    const remaining = target > 0 ? Number(Math.max(0, target - allocated).toFixed(2)) : 0;

                    return (
                      <div className="p-3 bg-surface rounded-2xl border border-secondary/25 flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-on-surface flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[15px] text-secondary">call_split</span>
                            <span>Split Breakdown</span>
                          </span>
                          <span className={`font-bold ${
                            target > 0 && allocated === target
                              ? 'text-secondary'
                              : target > 0 && allocated > target
                              ? 'text-error'
                              : 'text-amber-600'
                          }`}>
                            Allocated: {formatINR(allocated)} {target > 0 ? `/ ${formatINR(target)}` : ''}
                            {remaining > 0 && ` (${formatINR(remaining)} left)`}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="flex flex-col gap-1 p-2 rounded-xl bg-surface-container-low border border-outline-variant/20">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-on-surface">Cash</span>
                              {remaining > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = (c + remaining).toFixed(2);
                                    setEditSplitCash(parseFloat(next).toString());
                                  }}
                                  className="text-[10px] font-bold text-secondary cursor-pointer"
                                >
                                  +Fill
                                </button>
                              )}
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={editSplitCash}
                              onChange={(e) => setEditSplitCash(e.target.value)}
                              className="w-full px-2 py-1 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                            />
                          </div>

                          <div className="flex flex-col gap-1 p-2 rounded-xl bg-surface-container-low border border-outline-variant/20">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-on-surface">UPI</span>
                              {remaining > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = (u + remaining).toFixed(2);
                                    setEditSplitUPI(parseFloat(next).toString());
                                  }}
                                  className="text-[10px] font-bold text-secondary cursor-pointer"
                                >
                                  +Fill
                                </button>
                              )}
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={editSplitUPI}
                              onChange={(e) => setEditSplitUPI(e.target.value)}
                              className="w-full px-2 py-1 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                            />
                          </div>

                          <div className="flex flex-col gap-1 p-2 rounded-xl bg-surface-container-low border border-outline-variant/20">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-on-surface">Bank</span>
                              {remaining > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = (b + remaining).toFixed(2);
                                    setEditSplitBank(parseFloat(next).toString());
                                  }}
                                  className="text-[10px] font-bold text-secondary cursor-pointer"
                                >
                                  +Fill
                                </button>
                              )}
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={editSplitBank}
                              onChange={(e) => setEditSplitBank(e.target.value)}
                              className="w-full px-2 py-1 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1 text-[11px]">Notes / Remarks</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Remarks..."
                  className="w-full px-2.5 py-1.5 bg-surface-container-low rounded-xl text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary min-h-[38px]"
                />
              </div>

              {/* Opening Balance Type Switcher */}
              {editingLedgerEntry.isOpening && (
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-bold text-on-surface-variant">Opening Balance Type</label>
                  <div className="grid grid-cols-2 gap-2 p-0.5 bg-surface rounded-xl border border-outline-variant/20">
                    <button
                      type="button"
                      onClick={() => setEditOpeningType('RECEIVABLE')}
                      className={`py-2 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                        editOpeningType === 'RECEIVABLE' ? 'bg-secondary text-on-secondary shadow-xs' : 'text-on-surface-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">call_received</span>
                      <span>To Receive (Dr)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditOpeningType('PAYABLE')}
                      className={`py-2 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                        editOpeningType === 'PAYABLE' ? 'bg-error text-on-error shadow-xs' : 'text-on-surface-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[15px]">call_made</span>
                      <span>To Pay (Cr)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Edit Mode Actions Footer */}
            <div className="flex items-center justify-between gap-2 p-3.5 border-t border-outline-variant/20 bg-surface-container-lowest/90 backdrop-blur-xs flex-shrink-0">
              {(editingLedgerEntry.rawVoucher || editingLedgerEntry.id.startsWith('pay-inv-') || editingLedgerEntry.id.startsWith('pay-pur-') || editingLedgerEntry.isOpening) ? (
                <button
                  type="button"
                  onClick={handleDeleteLedgerItem}
                  className="px-3 py-2 rounded-xl bg-error/10 hover:bg-error/20 text-error font-bold text-xs cursor-pointer flex items-center gap-1 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  <span>{editingLedgerEntry.isOpening ? 'Clear' : 'Delete'}</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isPayment) {
                      populateForm();
                      setIsEditing(false);
                    } else {
                      onClose();
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl text-on-surface-variant font-bold text-xs cursor-pointer hover:bg-surface-container-high transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-sm active:scale-95 transition-all cursor-pointer hover:bg-secondary/90"
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Delete Ledger Transaction Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <ConfirmDeleteModal
          isOpen={isDeleteConfirmOpen}
          title={editingLedgerEntry.isOpening ? 'Clear Opening Balance?' : 'Delete Ledger Transaction?'}
          recordName={editingLedgerEntry.docNumber}
          description="Are you sure you want to delete this ledger transaction? This action will adjust party balances."
          confirmText={editingLedgerEntry.isOpening ? 'Clear Balance' : 'Delete Transaction'}
          onConfirm={() => executeDeleteLedgerItem(editingLedgerEntry)}
          onClose={() => setIsDeleteConfirmOpen(false)}
        />
      )}
    </div>
  );
};
