import React, { useState, useEffect } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice, PaymentMode, PaymentSplit } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Voucher, JournalEntryLine } from '../../core/accounting/voucherTypes.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { db } from '../../services/db.ts';
import { PassbookEntry } from './usePartyPassbook.ts';

export interface VoucherEditorModalProps {
  editingLedgerEntry: PassbookEntry | null;
  onClose: () => void;
  party: Party;
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
  onViewInvoice,
  onEditInvoice,
  onEditPurchase,
  onViewPurchase,
  onRefresh,
}) => {
  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editMode, setEditMode] = useState('UPI');
  const [editSplitCash, setEditSplitCash] = useState('');
  const [editSplitUPI, setEditSplitUPI] = useState('');
  const [editSplitBank, setEditSplitBank] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editType, setEditType] = useState<'IN' | 'OUT'>('IN');
  const [editOpeningType, setEditOpeningType] = useState<'RECEIVABLE' | 'PAYABLE'>('RECEIVABLE');

  useEffect(() => {
    if (!editingLedgerEntry) return;

    setEditDate(editingLedgerEntry.date);
    const amtVal = editingLedgerEntry.credit > 0 ? editingLedgerEntry.credit : editingLedgerEntry.debit;
    setEditAmount(amtVal.toString());
    setEditMode(editingLedgerEntry.paymentMode || 'UPI');
    setEditNotes(editingLedgerEntry.description || '');
    setEditType(editingLedgerEntry.type === 'PAYMENT_IN' ? 'IN' : 'OUT');

    if (editingLedgerEntry.rawVoucher) {
      const v = editingLedgerEntry.rawVoucher;
      const cashEntry = v.entries.find((e) => e.accountId === 'ACC_CASH');
      const bankEntries = v.entries.filter((e) => e.accountId === 'ACC_BANK');
      const cashVal = cashEntry ? (cashEntry.debit || cashEntry.credit || 0) : 0;
      const bankVal = bankEntries.reduce((sum, e) => sum + (e.debit || e.credit || 0), 0);
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
  }, [editingLedgerEntry, party]);

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

      let adjustedBal = party.currentBalance;
      if (v.voucherType === 'RECEIPT') {
        adjustedBal += v.totalAmount;
      } else {
        adjustedBal -= v.totalAmount;
      }

      if (isReceipt) {
        adjustedBal -= newAmt;
      } else {
        adjustedBal += newAmt;
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
          entries.push({ accountId: party.id, accountName: party.name, debit: 0, credit: newAmt, narration: editNotes || v.narration });
        } else {
          entries.push({ accountId: party.id, accountName: party.name, debit: newAmt, credit: 0, narration: editNotes || v.narration });
          if (c > 0) entries.push({ accountId: 'ACC_CASH', accountName: 'Cash-in-hand', debit: 0, credit: c, narration: 'Paid via CASH' });
          if (bankSum > 0) entries.push({ accountId: 'ACC_BANK', accountName: 'Bank Account', debit: 0, credit: bankSum, narration: 'Paid via BANK/UPI' });
        }
      } else {
        const accId = editMode === 'CASH' ? 'ACC_CASH' : 'ACC_BANK';
        const accName = editMode === 'CASH' ? 'Cash-in-hand' : 'Bank Account';
        if (isReceipt) {
          entries.push({ accountId: accId, accountName: accName, debit: newAmt, credit: 0, narration: `Payment received via ${editMode}` });
          entries.push({ accountId: party.id, accountName: party.name, debit: 0, credit: newAmt, narration: editNotes || v.narration });
        } else {
          entries.push({ accountId: party.id, accountName: party.name, debit: newAmt, credit: 0, narration: editNotes || v.narration });
          entries.push({ accountId: accId, accountName: accName, debit: 0, credit: newAmt, narration: `Paid via ${editMode}` });
        }
      }

      const updatedVoucher: Voucher = {
        ...v,
        date: editDate,
        voucherType: newVoucherType,
        totalAmount: newAmt,
        narration: editNotes || v.narration,
        entries,
      };

      db.saveVoucher(updatedVoucher);
      db.saveParty({ ...party, currentBalance: adjustedBal, updatedAt: new Date().toISOString() });
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
        const splits: PaymentSplit[] = [];
        if (c > 0) splits.push({ id: `s-c-${Date.now()}`, mode: 'CASH', amount: c });
        if (u > 0) splits.push({ id: `s-u-${Date.now()}`, mode: 'UPI', amount: u });
        if (b > 0) splits.push({ id: `s-b-${Date.now()}`, mode: 'BANK', amount: b });
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
        const splits: PaymentSplit[] = [];
        if (c > 0) splits.push({ id: `s-c-${Date.now()}`, mode: 'CASH', amount: c });
        if (u > 0) splits.push({ id: `s-u-${Date.now()}`, mode: 'UPI', amount: u });
        if (b > 0) splits.push({ id: `s-b-${Date.now()}`, mode: 'BANK', amount: b });
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
      const hasOldExplicit = typeof party.openingBalance === 'number';
      const oldRawOpening = hasOldExplicit ? party.openingBalance! : 0;
      const oldType = party.openingBalanceType || (party.type === 'CUSTOMER' ? 'TO_RECEIVE' : 'TO_PAY');
      const oldSignedOpening = oldRawOpening > 0 ? (oldType === 'TO_RECEIVE' ? oldRawOpening : -oldRawOpening) : 0;

      const newSignedOpening = newAmt > 0 ? (editOpeningType === 'RECEIVABLE' ? newAmt : -newAmt) : 0;
      const delta = newSignedOpening - oldSignedOpening;
      const finalBal = party.currentBalance + delta;

      const updatedParty: Party = {
        ...party,
        openingBalance: newAmt > 0 ? newAmt : undefined,
        openingBalanceType: newAmt > 0 ? (editOpeningType === 'RECEIVABLE' ? 'TO_RECEIVE' : 'TO_PAY') : undefined,
        openingBalanceDate: editDate,
        currentBalance: finalBal,
        updatedAt: new Date().toISOString(),
      };
      db.saveParty(updatedParty);
      db.recalculatePartyBalance(party.id);
    }

    onClose();
    onRefresh?.();
  };

  const handleDeleteLedgerItem = (entry: PassbookEntry) => {
    if (!window.confirm(`Delete this ledger transaction "${entry.docNumber}"?`)) return;

    if (entry.rawVoucher) {
      const v = entry.rawVoucher;
      let adjustedBal = party.currentBalance;
      if (v.voucherType === 'RECEIPT') {
        adjustedBal += v.totalAmount;
      } else {
        adjustedBal -= v.totalAmount;
      }
      db.deleteVoucher(v.id);
      db.saveParty({ ...party, currentBalance: adjustedBal, updatedAt: new Date().toISOString() });
      db.recalculatePartyBalance(party.id);
    } else if (entry.id.startsWith('pay-inv-') && entry.rawInvoice) {
      const inv = entry.rawInvoice;
      const amt = entry.credit;
      const updatedInv: Invoice = {
        ...inv,
        paidAmount: Math.max(0, inv.paidAmount - amt),
        balanceAmount: inv.grandTotal,
        paymentStatus: 'UNPAID',
        updatedAt: new Date().toISOString(),
      };
      db.saveInvoice(updatedInv);
      db.saveParty({ ...party, currentBalance: party.currentBalance + amt, updatedAt: new Date().toISOString() });
      db.recalculatePartyBalance(party.id);
    } else if (entry.id.startsWith('pay-pur-') && entry.rawPurchase) {
      const pur = entry.rawPurchase;
      const amt = entry.debit;
      const updatedPur: PurchaseBill = {
        ...pur,
        paidAmount: Math.max(0, pur.paidAmount - amt),
        balanceAmount: pur.grandTotal,
        paymentStatus: 'UNPAID',
        updatedAt: new Date().toISOString(),
      };
      db.savePurchase(updatedPur);
      db.saveParty({ ...party, currentBalance: party.currentBalance - amt, updatedAt: new Date().toISOString() });
      db.recalculatePartyBalance(party.id);
    } else if (entry.isOpening) {
      db.clearPartyOpeningBalance(party.id);
    }

    onClose();
    onRefresh?.();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl p-4 w-full max-w-sm shadow-2xl border border-outline-variant/30 flex flex-col gap-3">
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
              {editingLedgerEntry.type === 'SALE'
                ? 'Sales Invoice Details'
                : editingLedgerEntry.type === 'PURCHASE'
                ? 'Purchase Bill Details'
                : editingLedgerEntry.type === 'PAYMENT_IN'
                ? 'Payment In Details'
                : editingLedgerEntry.type === 'PAYMENT_OUT'
                ? 'Payment Out Details'
                : 'Transaction Details'}
            </span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-0.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSaveLedgerItem} className="flex flex-col gap-2.5 text-xs">
          <div className="p-2 rounded-xl bg-surface-container-low text-[11px] text-on-surface-variant flex items-center justify-between">
            <span>Doc: <strong>{editingLedgerEntry.docNumber}</strong></span>
            <span className="font-semibold">{editingLedgerEntry.type.replace('_', ' ')}</span>
          </div>

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

          {/* Date & Amount */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-on-surface-variant mb-0.5">Date</label>
              <input
                type="date"
                required
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-surface-container-low rounded-xl text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary"
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
                className="w-full px-2.5 py-1.5 bg-surface-container-low rounded-xl font-bold text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary"
              />
            </div>
          </div>

          {/* Payment Mode */}
          {(editingLedgerEntry.rawVoucher || editingLedgerEntry.paymentMode) && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-4 gap-1">
                {['UPI', 'CASH', 'BANK', 'SPLIT'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
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
                    className={`py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                      editMode === m
                        ? 'bg-secondary text-on-secondary shadow-xs'
                        : 'bg-surface-container-low text-on-surface-variant'
                    }`}
                  >
                    {m}
                  </button>
                ))}
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
            <label className="block font-bold text-on-surface-variant mb-0.5">Notes / Description</label>
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
                onClick={() => handleDeleteLedgerItem(editingLedgerEntry)}
                className="px-2.5 py-1.5 rounded-xl bg-error/10 hover:bg-error/20 text-error font-bold text-xs cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[15px]">delete</span>
                <span>{editingLedgerEntry.isOpening ? 'Clear' : 'Delete'}</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl text-on-surface-variant font-bold text-xs cursor-pointer"
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
      </div>
    </div>
  );
};
