import React, { useState, useEffect, useMemo } from 'react';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Invoice, PaymentMode, PaymentSplit } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Voucher, JournalEntryLine } from '../../core/accounting/voucherTypes.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { safeOpenExternalUrl, getPartyTotalBalanceDue } from '../../core/utils/upiAndShare.ts';
import { buildWhatsAppSendUrl } from '../../core/utils/whatsappIntent.ts';
import { db } from '../../services/db.ts';
import { createReversalVoucher } from '../../core/accounting/ledger.ts';
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

  const populateForm = () => {
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
  };

  useEffect(() => {
    populateForm();
  }, [editingLedgerEntry, party]);

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

  if (!editingLedgerEntry) return null;

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
      const isReceipt = editType === 'IN';
      const newVoucherType = isReceipt ? 'RECEIPT' : 'PAYMENT';

      const disc = parseFloat(editDiscount) || 0;
      const totalSettled = Number((newAmt + disc).toFixed(2));

      // Allocation validation & handling
      const oldAllocations = v.paymentAllocations || [];
      const allocatedSum = oldAllocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
      const isTypeChanged = (v.voucherType === 'RECEIPT' && !isReceipt) || (v.voucherType === 'PAYMENT' && isReceipt);

      let finalAllocations = oldAllocations.map((a) => ({
        ...a,
        date: editDate,
      }));
      let finalAllocationMode = v.allocationMode;

      if (isTypeChanged) {
        // Changing flow between IN and OUT clears allocations and requires re-linking
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

        if (isReceipt) {
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
        if (isReceipt) {
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

  const selectedBankName = useMemo(() => {
    const found = availableBankAccounts.find((a) => a.id === editBankAccountId);
    return found?.accountName || 'Bank Account';
  }, [availableBankAccounts, editBankAccountId]);

  const partyTotalDue = useMemo(() => {
    return getPartyTotalBalanceDue(party);
  }, [party]);

  const handleShareWhatsApp = () => {
    if (!editingLedgerEntry) return;

    const companyName =
      company?.tradeName ||
      company?.businessName ||
      db.getCompany()?.tradeName ||
      db.getCompany()?.businessName ||
      'Vyapar Books';

    const isReceipt =
      editingLedgerEntry.type === 'PAYMENT_IN' ||
      editType === 'IN' ||
      (editingLedgerEntry.credit > 0 && editingLedgerEntry.debit === 0);
    const voucherTitle = isReceipt ? 'Payment In Receipt' : 'Payment Out Voucher';
    const numAmt =
      parseFloat(editAmount) ||
      (editingLedgerEntry.credit > 0 ? editingLedgerEntry.credit : editingLedgerEntry.debit);
    const discAmt = parseFloat(editDiscount) || 0;
    const totalDue = getPartyTotalBalanceDue(party);

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
        <div className="flex items-center justify-between p-2 rounded-xl bg-primary/10 border border-primary/20 text-xs">
          <span className="text-primary font-bold">Invoice #{editingLedgerEntry.rawInvoice.invoiceNumber}</span>
          <div className="flex items-center gap-1.5">
            {onViewInvoice && (
              <button
                type="button"
                onClick={() => {
                  const inv = editingLedgerEntry.rawInvoice!;
                  onClose();
                  onViewInvoice(inv);
                }}
                className="px-2.5 py-1 rounded-lg bg-primary text-on-primary font-bold text-[11px] shadow-xs cursor-pointer flex items-center gap-1 active:scale-95"
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
                className="px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-bold text-[11px] cursor-pointer flex items-center gap-1 active:scale-95"
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
        <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-1.5">
          <span className="text-[11px] font-bold text-on-surface flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-secondary">link</span>
            <span>Linked Documents ({editingLedgerEntry.rawVoucher.paymentAllocations.length})</span>
          </span>
          <div className="flex flex-col gap-1 divide-y divide-outline-variant/15 text-xs">
            {editingLedgerEntry.rawVoucher.paymentAllocations.map((alloc) => (
              <div key={alloc.documentId} className="pt-1 pb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                      alloc.documentType === 'INVOICE'
                        ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
                        : 'bg-orange-500/10 text-orange-700 dark:text-orange-300'
                    }`}
                  >
                    {alloc.documentType === 'INVOICE' ? 'Invoice' : 'Bill'}
                  </span>
                  <span className="font-bold text-on-surface truncate">#{alloc.documentNumber}</span>
                  <span className="text-secondary font-bold">({formatINR(alloc.amount)})</span>
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
                    className="px-2 py-0.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[10px] flex items-center gap-0.5 cursor-pointer active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[12px]">visibility</span>
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
                    className="px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold text-[10px] flex items-center gap-0.5 cursor-pointer active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[12px]">visibility</span>
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
        <div className="flex items-center justify-between p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs">
          <span className="text-orange-600 dark:text-orange-400 font-bold">Purchase Bill #{editingLedgerEntry.rawPurchase.billNumber}</span>
          <div className="flex items-center gap-1.5">
            {onViewPurchase && (
              <button
                type="button"
                onClick={() => {
                  const bill = editingLedgerEntry.rawPurchase!;
                  onClose();
                  onViewPurchase(bill);
                }}
                className="px-2.5 py-1 rounded-lg bg-orange-600 text-white font-bold text-[11px] shadow-xs cursor-pointer flex items-center gap-1 active:scale-95"
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
                className="px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-bold text-[11px] cursor-pointer flex items-center gap-1 active:scale-95"
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl p-4 w-full max-w-sm sm:max-w-md shadow-2xl border border-outline-variant/30 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
          <h3 className="font-bold text-sm text-on-surface flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px] text-secondary">
              {editingLedgerEntry.type === 'SALE'
                ? 'receipt_long'
                : editingLedgerEntry.type === 'PURCHASE'
                ? 'shopping_bag'
                : 'payments'}
            </span>
            <span>
              {isEditing
                ? editingLedgerEntry.type === 'SALE'
                  ? 'Edit Sales Invoice'
                  : editingLedgerEntry.type === 'PURCHASE'
                  ? 'Edit Purchase Bill'
                  : editingLedgerEntry.type === 'PAYMENT_IN' || editType === 'IN'
                  ? 'Edit Payment In'
                  : editingLedgerEntry.type === 'PAYMENT_OUT' || editType === 'OUT'
                  ? 'Edit Payment Out'
                  : editingLedgerEntry.isOpening
                  ? 'Edit Opening Balance'
                  : 'Edit Transaction'
                : editingLedgerEntry.type === 'PAYMENT_IN' || editType === 'IN' || (editingLedgerEntry.credit > 0 && editingLedgerEntry.debit === 0)
                ? 'Payment In Details'
                : editingLedgerEntry.type === 'PAYMENT_OUT' || editType === 'OUT'
                ? 'Payment Out Details'
                : editingLedgerEntry.type === 'SALE'
                ? 'Sales Invoice Details'
                : editingLedgerEntry.type === 'PURCHASE'
                ? 'Purchase Bill Details'
                : 'Transaction Details'}
            </span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-0.5 cursor-pointer"
            title="Close"
            aria-label="Close transaction details"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        {!isEditing ? (
          <div data-testid="voucher-readonly-view" className="flex flex-col gap-3 text-xs">
            {/* Amount Hero Card */}
            <div
              className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 ${
                editingLedgerEntry.type === 'PAYMENT_IN' || editType === 'IN' || (editingLedgerEntry.credit > 0 && editingLedgerEntry.debit === 0)
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-950 dark:text-emerald-100'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-950 dark:text-rose-100'
              }`}
            >
              <div className="flex items-center justify-between w-full text-[11px] font-semibold text-on-surface-variant">
                <span className="font-bold text-on-surface">Doc: #{editingLedgerEntry.docNumber}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    editingLedgerEntry.type === 'PAYMENT_IN' || editType === 'IN' || (editingLedgerEntry.credit > 0 && editingLedgerEntry.debit === 0)
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {editingLedgerEntry.type === 'PAYMENT_IN' || editType === 'IN' || (editingLedgerEntry.credit > 0 && editingLedgerEntry.debit === 0)
                    ? 'Payment In'
                    : 'Payment Out'}
                </span>
              </div>

              <div className="text-2xl font-black my-1 text-on-surface">
                {formatINR(parseFloat(editAmount) || (editingLedgerEntry.credit > 0 ? editingLedgerEntry.credit : editingLedgerEntry.debit))}
              </div>

              <div className="text-[11px] text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                <span>{formatDate(editDate || editingLedgerEntry.date)}</span>
              </div>

              {parseFloat(editDiscount) > 0 && (
                <div className="mt-1 pt-1 border-t border-outline-variant/20 w-full flex items-center justify-between text-[11px] font-medium text-on-surface-variant">
                  <span>Discount {editType === 'IN' ? 'Allowed' : 'Received'}:</span>
                  <span className="font-bold text-secondary">{formatINR(parseFloat(editDiscount))}</span>
                </div>
              )}
            </div>

            {/* Party & Total Due Info */}
            <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Party</span>
                {party.phone && (
                  <span className="text-[10px] text-on-surface-variant flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">call</span>
                    <span>{party.phone}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-on-surface truncate">{party.name}</span>
                {partyTotalDue !== null && !isNaN(partyTotalDue) && (
                  <div className="text-right flex-shrink-0">
                    <div className="text-[9px] text-on-surface-variant font-bold uppercase">Total Balance Due</div>
                    <div className={`font-bold text-xs ${partyTotalDue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {formatINR(partyTotalDue)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Mode & Notes */}
            <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant font-bold">Payment Mode:</span>
                <span className="font-bold text-on-surface px-1.5 py-0.5 rounded bg-surface border border-outline-variant/20">
                  {editMode === 'BANK' ? `Bank (${selectedBankName})` : editMode}
                </span>
              </div>
              {editMode === 'SPLIT' && (
                <div className="mt-1 pt-1 border-t border-outline-variant/15 flex flex-col gap-0.5 text-[10px]">
                  <span className="font-bold text-on-surface-variant">Split Tender Breakdown:</span>
                  <div className="flex items-center gap-2 text-on-surface flex-wrap">
                    {parseFloat(editSplitCash) > 0 && <span>Cash: <strong>{formatINR(parseFloat(editSplitCash))}</strong></span>}
                    {parseFloat(editSplitUPI) > 0 && <span>UPI: <strong>{formatINR(parseFloat(editSplitUPI))}</strong></span>}
                    {parseFloat(editSplitBank) > 0 && <span>Bank: <strong>{formatINR(parseFloat(editSplitBank))}</strong></span>}
                  </div>
                </div>
              )}
              {(editNotes || editingLedgerEntry.description || editingLedgerEntry.rawVoucher?.narration) && (
                <div className="mt-1 pt-1 border-t border-outline-variant/15 text-on-surface-variant">
                  <span className="font-bold text-[10px] block">Notes / Remarks:</span>
                  <p className="italic text-on-surface text-xs mt-0.5">
                    {editNotes || editingLedgerEntry.description || editingLedgerEntry.rawVoucher?.narration}
                  </p>
                </div>
              )}
            </div>

            {/* Linked Documents (Invoice / Purchase / Allocations) */}
            {renderLinkedDocs()}

            {/* Read-Only Actions */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/20">
              {(editingLedgerEntry.rawVoucher || editingLedgerEntry.id.startsWith('pay-inv-') || editingLedgerEntry.id.startsWith('pay-pur-') || editingLedgerEntry.isOpening) ? (
                <button
                  type="button"
                  onClick={handleDeleteLedgerItem}
                  className="px-2.5 py-1.5 rounded-xl bg-error/10 hover:bg-error/20 text-error font-bold text-xs cursor-pointer flex items-center gap-1 active:scale-95 transition-all"
                  title="Delete transaction"
                >
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                  <span>Delete</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="voucher-share-whatsapp"
                  onClick={handleShareWhatsApp}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer transition-all"
                  title="Share on WhatsApp"
                >
                  <span className="material-symbols-outlined text-[15px]">share</span>
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  data-testid="voucher-edit-button"
                  onClick={() => setIsEditing(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs flex items-center gap-1.5 active:scale-95 cursor-pointer transition-all"
                  title="Edit transaction"
                >
                  <span className="material-symbols-outlined text-[15px]">edit</span>
                  <span>Edit</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveLedgerItem} className="flex flex-col gap-2.5 text-xs">
            <div className="p-2 rounded-xl bg-surface-container-low text-[11px] text-on-surface-variant flex items-center justify-between">
              <span>Doc: <strong>{editingLedgerEntry.docNumber}</strong></span>
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
                  className={`py-1 rounded-lg font-bold cursor-pointer ${
                    editType === 'IN' ? 'bg-secondary text-on-secondary shadow-xs' : 'text-on-surface-variant'
                  }`}
                >
                  Payment In
                </button>
                <button
                  type="button"
                  onClick={() => setEditType('OUT')}
                  className={`py-1 rounded-lg font-bold cursor-pointer ${
                    editType === 'OUT' ? 'bg-amber-600 text-white shadow-xs' : 'text-on-surface-variant'
                  }`}
                >
                  Payment Out
                </button>
              </div>
            )}

            {/* Date, Amount & Discount */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block font-bold text-on-surface-variant mb-0.5">Date</label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-surface-container-low rounded-xl text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary min-h-[36px]"
                />
              </div>
              <div>
                <label className="block font-bold text-on-surface-variant mb-0.5">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-surface-container-low rounded-xl font-bold text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary min-h-[36px]"
                />
              </div>
              <div>
                <label className="block font-bold text-on-surface-variant mb-0.5">
                  {editType === 'IN' ? 'Discount Allowed (₹)' : 'Discount Received (₹)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={editDiscount}
                  onChange={(e) => setEditDiscount(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-surface-container-low rounded-xl font-bold text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary min-h-[36px]"
                />
              </div>
            </div>

            {parseFloat(editDiscount) > 0 && (
              <div className="flex items-center justify-between px-2.5 py-1 bg-secondary/10 rounded-xl text-[11px] font-bold text-secondary">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">discount</span>
                  <span>Total Settled against Balance:</span>
                </span>
                <span>{formatINR((parseFloat(editAmount) || 0) + (parseFloat(editDiscount) || 0))}</span>
              </div>
            )}

            {/* Payment Mode & Bank Account (Side-by-Side Dropdowns) */}
            {(editingLedgerEntry.rawVoucher || editingLedgerEntry.paymentMode) && (
              <div className="flex flex-col gap-2">
                <div className={`grid gap-2 ${editMode === 'BANK' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="voucher-edit-mode-select" className="text-[10px] font-bold text-on-surface-variant">
                      Payment Mode
                    </label>
                    <div className="relative flex items-center">
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
                        className="w-full px-2.5 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px] cursor-pointer"
                      >
                        <option value="UPI">UPI</option>
                        <option value="CASH">Cash</option>
                        <option value="BANK">Bank</option>
                        <option value="SPLIT">Split Tender</option>
                      </select>
                    </div>
                  </div>

                  {editMode === 'BANK' && (
                    <div className="flex flex-col gap-1 animate-in fade-in">
                      <label htmlFor="voucher-bank-select" className="text-[10px] font-bold text-on-surface-variant truncate">
                        {editType === 'IN' ? 'Deposit to Bank' : 'Pay from Bank'}
                      </label>
                      <div className="relative flex items-center">
                        <select
                          id="voucher-bank-select"
                          value={editBankAccountId}
                          onChange={(e) => setEditBankAccountId(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px] cursor-pointer"
                        >
                          {availableBankAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.accountName} {acc.accountNumber ? `(•••${acc.accountNumber.slice(-4)})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
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
                    <div className="p-2 bg-surface rounded-xl border border-secondary/20 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-on-surface flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px] text-secondary">call_split</span>
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

                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="flex flex-col gap-0.5 p-1.5 rounded-lg bg-surface-container-low border border-outline-variant/20">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-on-surface">Cash</span>
                            {remaining > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = (c + remaining).toFixed(2);
                                  setEditSplitCash(parseFloat(next).toString());
                                }}
                                className="text-[9px] font-bold text-secondary cursor-pointer"
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
                            className="w-full px-1.5 py-0.5 bg-surface rounded text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                          />
                        </div>

                        <div className="flex flex-col gap-0.5 p-1.5 rounded-lg bg-surface-container-low border border-outline-variant/20">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-on-surface">UPI</span>
                            {remaining > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = (u + remaining).toFixed(2);
                                  setEditSplitUPI(parseFloat(next).toString());
                                }}
                                className="text-[9px] font-bold text-secondary cursor-pointer"
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
                            className="w-full px-1.5 py-0.5 bg-surface rounded text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                          />
                        </div>

                        <div className="flex flex-col gap-0.5 p-1.5 rounded-lg bg-surface-container-low border border-outline-variant/20">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-on-surface">Bank</span>
                            {remaining > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = (b + remaining).toFixed(2);
                                  setEditSplitBank(parseFloat(next).toString());
                                }}
                                className="text-[9px] font-bold text-secondary cursor-pointer"
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
                            className="w-full px-1.5 py-0.5 bg-surface rounded text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
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
              <label className="block font-bold text-on-surface-variant mb-0.5">Notes / Remarks</label>
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Remarks..."
                className="w-full px-2.5 py-1.5 bg-surface-container-low rounded-xl text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary"
              />
            </div>

            {/* Opening Balance Type Switcher */}
            {editingLedgerEntry.isOpening && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-on-surface-variant">Opening Balance Type</label>
                <div className="grid grid-cols-2 gap-1.5 p-0.5 bg-surface rounded-xl border border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => setEditOpeningType('RECEIVABLE')}
                    className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1 ${
                      editOpeningType === 'RECEIVABLE' ? 'bg-secondary text-on-secondary shadow-xs' : 'text-on-surface-variant'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">call_received</span>
                    <span>To Receive (Dr)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditOpeningType('PAYABLE')}
                    className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1 ${
                      editOpeningType === 'PAYABLE' ? 'bg-error text-on-error shadow-xs' : 'text-on-surface-variant'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">call_made</span>
                    <span>To Pay (Cr)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/20">
              {(editingLedgerEntry.rawVoucher || editingLedgerEntry.id.startsWith('pay-inv-') || editingLedgerEntry.id.startsWith('pay-pur-') || editingLedgerEntry.isOpening) ? (
                <button
                  type="button"
                  onClick={() => handleDeleteLedgerItem()}
                  className="px-2.5 py-1.5 rounded-xl bg-error/10 hover:bg-error/20 text-error font-bold text-xs cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                  <span>{editingLedgerEntry.isOpening ? 'Clear' : 'Delete'}</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-1.5">
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
                  className="px-3 py-1.5 rounded-xl text-on-surface-variant font-bold text-xs cursor-pointer hover:text-on-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs active:scale-95 cursor-pointer"
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
