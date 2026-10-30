import React, { useState, useEffect, useMemo } from 'react';
import { BankAccount, CashBankTransaction, CashBankTxnType, UnifiedLedgerEntry } from '../../models/bankAccount.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { safeOpenExternalUrl, getPartyTotalBalanceDue } from '../../core/utils/upiAndShare.ts';
import { buildPaymentVoucherWhatsAppMessage } from '../../core/utils/whatsAppMessageBuilders.ts';
import { db } from '../../services/db.ts';
import { AppTab } from '../Shell/Drawer.tsx';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';

export interface CashBankTransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: UnifiedLedgerEntry | null;
  rawTransaction?: CashBankTransaction | null;
  accounts: BankAccount[];
  company?: CompanyProfile;
  parties?: Party[];
  vouchers?: Voucher[];
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  onSaveTransaction?: (txn: CashBankTransaction) => void;
  onDeleteTransaction?: (id: string) => void;
  onNavigateTab?: (tab: AppTab) => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onViewPurchase?: (bill: PurchaseBill) => void;
  onUnlinkAllocation?: (voucherId: string, documentType: 'INVOICE' | 'PURCHASE', documentId: string) => void;
  onEditVoucher?: (voucher: Voucher) => void;
}

export const CashBankTransactionDetailModal: React.FC<CashBankTransactionDetailModalProps> = ({
  isOpen,
  onClose,
  entry,
  rawTransaction,
  accounts,
  company,
  parties,
  vouchers,
  invoices,
  purchases,
  onSaveTransaction,
  onDeleteTransaction,
  onNavigateTab,
  onViewInvoice,
  onViewPurchase,
  onUnlinkAllocation,
  onEditVoucher,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<{
    voucherId: string;
    documentType: 'INVOICE' | 'PURCHASE';
    documentId: string;
    documentNumber: string;
  } | null>(null);

  const linkedVoucher = useMemo(() => {
    if (!entry) return null;
    const all = vouchers && vouchers.length > 0 ? vouchers : db.getVouchers();
    if (entry.rawVoucherId) {
      return all.find((v) => v.id === entry.rawVoucherId) || null;
    }
    // Fallback resolution for payment vouchers (excluding CONTRA entries)
    if (
      entry.id?.startsWith('LEDGER-VCH-') &&
      !entry.id.startsWith('LEDGER-VCH-IN-') &&
      !entry.id.startsWith('LEDGER-VCH-OUT-') &&
      entry.type !== 'CONTRA' &&
      !entry.contraType
    ) {
      const candidateId = entry.id.replace(/^LEDGER-VCH-/, '').replace(/-\d+$/, '');
      const match = all.find(
        (v) =>
          v.voucherType !== 'CONTRA' &&
          (v.voucherType === 'RECEIPT' || v.voucherType === 'PAYMENT') &&
          (v.id === candidateId || entry.id.includes(v.id))
      );
      if (match) return match;
    }
    return null;
  }, [entry, vouchers]);

  const linkedParty = useMemo(() => {
    if (!entry || !parties || parties.length === 0) return null;

    // 1. entry.partyId
    if (entry.partyId) {
      const match = parties.find((p) => p.id === entry.partyId);
      if (match) return match;
    }

    // 2. entry.rawVoucherId -> linked voucher .partyId
    if (linkedVoucher?.partyId) {
      const match = parties.find((p) => p.id === linkedVoucher.partyId);
      if (match) return match;
    }

    // 3. entry.rawInvoiceId -> invoice .partyId, then normalized .partyName
    if (entry.rawInvoiceId) {
      const allInvoices = invoices && invoices.length > 0 ? invoices : db.getInvoices();
      const invoice = allInvoices.find((i) => i.id === entry.rawInvoiceId);
      if (invoice) {
        if (invoice.partyId) {
          const match = parties.find((p) => p.id === invoice.partyId);
          if (match) return match;
        }
        if (invoice.partyName) {
          const normInvName = invoice.partyName.trim().toLowerCase();
          const match = parties.find((p) => p.name.trim().toLowerCase() === normInvName);
          if (match) return match;
        }
      }
    }

    // 4. entry.rawPurchaseId -> purchase .supplierId, then normalized .supplierName
    if (entry.rawPurchaseId) {
      const allPurchases = purchases && purchases.length > 0 ? purchases : db.getPurchases();
      const purchase = allPurchases.find((p) => p.id === entry.rawPurchaseId);
      if (purchase) {
        if (purchase.supplierId) {
          const match = parties.find((p) => p.id === purchase.supplierId);
          if (match) return match;
        }
        if (purchase.supplierName) {
          const normSuppName = purchase.supplierName.trim().toLowerCase();
          const match = parties.find((p) => p.name.trim().toLowerCase() === normSuppName);
          if (match) return match;
        }
      }
    }

    return null;
  }, [entry, parties, linkedVoucher, invoices, purchases]);

  // Form State for Editing
  const [editType, setEditType] = useState<CashBankTxnType>('TRANSFER');
  const [editDate, setEditDate] = useState<string>('');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editFromAccountId, setEditFromAccountId] = useState<string>('ACC_CASH');
  const [editToAccountId, setEditToAccountId] = useState<string>('');
  const [editReferenceNo, setEditReferenceNo] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Ensure accounts has Cash in Hand
  const allAccounts = useMemo(() => {
    const hasCash = accounts.some((a) => a.id === 'ACC_CASH' || a.accountType === 'CASH');
    if (hasCash) return accounts;
    return [
      {
        id: 'ACC_CASH',
        accountName: 'Cash in Hand',
        accountType: 'CASH' as const,
        openingBalance: 0,
        createdAt: '',
        updatedAt: '',
      },
      ...accounts,
    ];
  }, [accounts]);

  const bankAccounts = useMemo(() => {
    return allAccounts.filter((a) => a.accountType === 'BANK');
  }, [allAccounts]);

  const defaultBank = useMemo(() => {
    return bankAccounts.find((b) => b.isDefault) || bankAccounts[0];
  }, [bankAccounts]);

  // Synchronize edit form when modal opens or target changes
  useEffect(() => {
    if (isOpen) {
      setIsEditing(false);
      setShowDeleteConfirm(false);
      setFormError(null);

      if (rawTransaction) {
        setEditType(rawTransaction.type);
        setEditDate(rawTransaction.date || new Date().toISOString().split('T')[0]);
        setEditAmount(rawTransaction.amount ? rawTransaction.amount.toString() : '');
        setEditFromAccountId(rawTransaction.fromAccountId || (rawTransaction.type === 'DEPOSIT' ? 'ACC_CASH' : (defaultBank?.id || '')));
        setEditToAccountId(rawTransaction.toAccountId || (rawTransaction.type === 'WITHDRAWAL' ? 'ACC_CASH' : (defaultBank?.id || '')));
        setEditReferenceNo(rawTransaction.referenceNo || '');
        setEditDescription(rawTransaction.description || '');
      } else if (entry) {
        setEditDate(entry.date || new Date().toISOString().split('T')[0]);
        setEditAmount(entry.amount ? entry.amount.toString() : '');
        setEditFromAccountId(entry.fromAccountId || (entry.flow === 'OUT' ? entry.accountId : 'ACC_CASH'));
        setEditToAccountId(entry.toAccountId || (entry.flow === 'IN' ? entry.accountId : (defaultBank?.id || '')));
        setEditReferenceNo(entry.referenceNo || '');
        setEditDescription(entry.description || '');
      }
    }
  }, [isOpen, rawTransaction, entry, defaultBank]);

  // Hardware back navigation: tiered priorities (p30 unlink/confirm -> p25 edit -> p20 close)
  useBackNavigation(
    () => {
      setUnlinkTarget(null);
      return true;
    },
    isOpen && !!unlinkTarget,
    30
  );

  useBackNavigation(
    () => {
      setShowDeleteConfirm(false);
      return true;
    },
    isOpen && !unlinkTarget && showDeleteConfirm,
    30
  );

  useBackNavigation(
    () => {
      setIsEditing(false);
      return true;
    },
    isOpen && !unlinkTarget && !showDeleteConfirm && isEditing,
    25
  );

  useBackNavigation(
    () => {
      onClose();
      return true;
    },
    isOpen && !unlinkTarget && !showDeleteConfirm && !isEditing,
    20
  );

  if (!isOpen || (!entry && !rawTransaction)) return null;

  const isNativeTxn = Boolean(rawTransaction);
  const isTransferCategory =
    (rawTransaction && (rawTransaction.type === 'DEPOSIT' || rawTransaction.type === 'WITHDRAWAL' || rawTransaction.type === 'TRANSFER')) ||
    (entry && entry.type === 'CONTRA');

  const isDirectCategory =
    (rawTransaction && (rawTransaction.type === 'ADD_MONEY' || rawTransaction.type === 'REDUCE_MONEY')) ||
    (entry && (entry.type === 'DIRECT_IN' || entry.type === 'DIRECT_OUT'));

  const isInflow =
    rawTransaction?.type === 'ADD_MONEY' ||
    rawTransaction?.type === 'DEPOSIT' ||
    (entry?.flow === 'IN' && entry?.type !== 'CONTRA');

  const isOutflow =
    rawTransaction?.type === 'REDUCE_MONEY' ||
    rawTransaction?.type === 'WITHDRAWAL' ||
    (entry?.flow === 'OUT' && entry?.type !== 'CONTRA');

  const isReversed = Boolean(linkedVoucher?.isReversed);
  const isCancelled = Boolean(linkedVoucher?.isCancelled);

  const activeAmount = rawTransaction?.amount ?? entry?.amount ?? 0;
  const activeDate = rawTransaction?.date || entry?.date || '';
  const activeRef = rawTransaction?.referenceNo || entry?.referenceNo;
  const activeDesc = rawTransaction?.description || entry?.description;

  // Account name resolutions
  const fromAcc = allAccounts.find((a) => a.id === (rawTransaction?.fromAccountId || entry?.fromAccountId));
  const toAcc = allAccounts.find((a) => a.id === (rawTransaction?.toAccountId || entry?.toAccountId));

  const resolvedFromName =
    fromAcc?.accountName ||
    entry?.fromAccountName ||
    (entry?.flow === 'OUT' ? entry.accountName : 'Cash in Hand');

  const resolvedToName =
    toAcc?.accountName ||
    entry?.toAccountName ||
    (entry?.flow === 'IN' ? entry.accountName : (defaultBank?.accountName || 'Bank Account'));

  const handleShareWhatsApp = () => {
    const heading = isTransferCategory
      ? 'Cash / Bank Transfer'
      : isInflow
      ? 'Payment Received'
      : 'Payment Made';

    const text = buildPaymentVoucherWhatsAppMessage(rawTransaction || entry, linkedParty, company, undefined, {
      heading,
      docNumber: rawTransaction?.txnNumber,
      date: activeDate ? formatDate(activeDate) : undefined,
      amount: activeAmount,
      type: rawTransaction?.type || entry?.type,
      isContra: Boolean(isTransferCategory),
      fromAccountName: resolvedFromName,
      toAccountName: resolvedToName,
      accountName:
        entry?.accountName ||
        (rawTransaction?.type === 'ADD_MONEY' ? toAcc?.accountName : fromAcc?.accountName),
      paymentMode: entry?.mode,
      reference: activeRef,
      counterpartyOrTitle: entry?.counterpartyOrTitle,
      notes: activeDesc,
    });

    safeOpenExternalUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  const handleTransferTypeSwitch = (newType: CashBankTxnType) => {
    setEditType(newType);
    setFormError(null);
    if (newType === 'DEPOSIT') {
      setEditFromAccountId('ACC_CASH');
      setEditToAccountId(defaultBank?.id || '');
    } else if (newType === 'WITHDRAWAL') {
      setEditFromAccountId(defaultBank?.id || '');
      setEditToAccountId('ACC_CASH');
    } else if (newType === 'TRANSFER') {
      if (bankAccounts.length >= 2) {
        setEditFromAccountId(bankAccounts[0].id);
        setEditToAccountId(bankAccounts[1].id);
      } else {
        setEditFromAccountId(defaultBank?.id || '');
        setEditToAccountId(defaultBank?.id || '');
      }
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawTransaction || !onSaveTransaction) return;

    const numAmount = parseFloat(editAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid amount greater than zero.');
      return;
    }

    if (!editDate) {
      setFormError('Please select a valid transaction date.');
      return;
    }

    let finalFromId: string | undefined = undefined;
    let finalToId: string | undefined = undefined;

    if (editType === 'DEPOSIT') {
      finalFromId = 'ACC_CASH';
      finalToId = editToAccountId;
      if (!finalToId || finalToId === 'ACC_CASH') {
        setFormError('Please choose a valid destination bank account.');
        return;
      }
    } else if (editType === 'WITHDRAWAL') {
      finalFromId = editFromAccountId;
      finalToId = 'ACC_CASH';
      if (!finalFromId || finalFromId === 'ACC_CASH') {
        setFormError('Please choose a valid source bank account.');
        return;
      }
    } else if (editType === 'TRANSFER') {
      finalFromId = editFromAccountId;
      finalToId = editToAccountId;
      if (!finalFromId || !finalToId) {
        setFormError('Please select both source and destination accounts.');
        return;
      }
      if (finalFromId === finalToId) {
        setFormError('Source and destination accounts must be different.');
        return;
      }
    } else if (editType === 'ADD_MONEY') {
      finalToId = editToAccountId || editFromAccountId;
      if (!finalToId) {
        setFormError('Please choose the destination account.');
        return;
      }
    } else if (editType === 'REDUCE_MONEY') {
      finalFromId = editFromAccountId || editToAccountId;
      if (!finalFromId) {
        setFormError('Please choose the deduction account.');
        return;
      }
    }

    const updatedTxn: CashBankTransaction = {
      ...rawTransaction,
      type: editType,
      date: editDate,
      amount: numAmount,
      fromAccountId: finalFromId,
      toAccountId: finalToId,
      referenceNo: editReferenceNo.trim() || undefined,
      description: editDescription.trim(),
    };

    onSaveTransaction(updatedTxn);
    setIsEditing(false);
    onClose();
  };

  const handleDelete = () => {
    if (!rawTransaction || !onDeleteTransaction) return;
    onDeleteTransaction(rawTransaction.id);
    onClose();
  };

  // Navigating to document source
  const handleNavigateSource = () => {
    if (!entry || !onNavigateTab) return;
    if (entry.type === 'SALE') {
      onNavigateTab('sales');
      onClose();
    } else if (entry.type === 'PURCHASE') {
      onNavigateTab('purchases');
      onClose();
    } else if (entry.type === 'EXPENSE') {
      onNavigateTab('expenses');
      onClose();
    } else if (entry.type === 'PARTY_RECEIPT' || entry.type === 'PARTY_PAYMENT' || entry.type === 'CONTRA') {
      onNavigateTab('accounting');
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-on-surface/50 backdrop-blur-xs animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-lg shadow-2xl border border-outline-variant/30 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between gap-2 bg-surface-container-low/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isTransferCategory
                  ? 'bg-blue-500/10 text-blue-600'
                  : isInflow
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-rose-500/10 text-rose-600'
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">
                {isEditing
                  ? 'edit'
                  : isTransferCategory
                  ? 'swap_horiz'
                  : isInflow
                  ? 'arrow_downward'
                  : 'arrow_upward'}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-on-surface truncate">
                  {isEditing ? 'Edit Transaction' : 'Transaction Details'}
                </h3>
                {rawTransaction?.txnNumber && (
                  <span className="text-[10px] font-mono font-bold bg-surface-container px-2 py-0.5 rounded text-on-surface-variant flex-shrink-0">
                    {rawTransaction.txnNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-on-surface-variant">
                {isEditing ? 'Modify transaction fields below' : `${entry?.category === 'CASH' ? 'Cash Register' : 'Bank Ledger'} Entry`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* View Mode */}
          {!isEditing && (
            <div className="space-y-4">
              {/* Amount & Type Hero Card */}
              <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 text-center flex flex-col items-center justify-center">
                <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Transaction Amount
                </span>
                <span
                  className={`text-2xl sm:text-3xl font-black font-tabular-data ${
                    isTransferCategory
                      ? 'text-blue-700 dark:text-blue-400'
                      : isInflow
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {isInflow ? '+' : isOutflow ? '-' : '⇄'} {formatINR(activeAmount)}
                </span>

                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap justify-center">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide bg-surface-container text-on-surface border border-outline-variant/30">
                    {rawTransaction?.type || entry?.type}
                  </span>
                  {entry?.mode && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-container-highest text-on-surface-variant">
                      Mode: {entry.mode}
                    </span>
                  )}
                  {isNativeTxn ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                      Editable Native Txn
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25">
                      Auto-Linked Entry
                    </span>
                  )}
                </div>
              </div>

              {/* Route Card for Contra / Transfers */}
              {isTransferCategory && (
                <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 block">
                    Transfer Route
                  </span>
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-surface-container-lowest rounded-lg border border-blue-100 dark:border-blue-900/40">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">
                        Debited From
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-on-surface truncate">
                        {resolvedFromName}
                      </span>
                    </div>

                    <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </div>

                    <div className="flex flex-col items-end min-w-0 text-right">
                      <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
                        Credited To
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-on-surface truncate">
                        {resolvedToName}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Single Account Detail for Direct In/Out or Other Entries */}
              {!isTransferCategory && entry && (
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                      {entry.category === 'CASH' ? 'payments' : 'account_balance'}
                    </span>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold text-on-surface-variant block">
                        Affected Account
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-on-surface truncate">
                        {entry.accountName}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                      isInflow
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {isInflow ? 'Inflow (+)' : 'Outflow (-)'}
                  </span>
                </div>
              )}

              {/* Transaction Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant">Transaction Date</span>
                  <span className="font-semibold text-on-surface">{formatDate(activeDate)}</span>
                </div>

                <div className="p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant">Reference / UTR No</span>
                  <span className="font-mono font-semibold text-on-surface">{activeRef || 'None'}</span>
                </div>

                {entry?.counterpartyOrTitle && (
                  <div className="sm:col-span-2 p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase font-bold text-on-surface-variant">Party / Counterparty</span>
                    <span className="font-semibold text-on-surface">{entry.counterpartyOrTitle}</span>
                  </div>
                )}

                <div className="sm:col-span-2 p-3 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-bold text-on-surface-variant">Narration / Description</span>
                  <span className="text-on-surface italic">{activeDesc || 'No narration provided'}</span>
                </div>
              </div>

              {/* Linked Documents for Vouchers */}
              {linkedVoucher?.paymentAllocations && linkedVoucher.paymentAllocations.length > 0 && (
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-on-surface">
                    <span className="material-symbols-outlined text-[16px] text-secondary">link</span>
                    <span>Linked Documents ({linkedVoucher.paymentAllocations.length})</span>
                  </div>
                  <div className="flex flex-col gap-1.5 divide-y divide-outline-variant/15 text-xs">
                    {linkedVoucher.paymentAllocations.map((alloc) => (
                      <div key={alloc.documentId} className="pt-1.5 flex items-center justify-between gap-2">
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
                        <div className="flex items-center gap-1.5 shrink-0">
                          {alloc.documentType === 'INVOICE' && onViewInvoice && (
                            <button
                              type="button"
                              onClick={() => {
                                const allInvs = invoices && invoices.length > 0 ? invoices : db.getInvoices();
                                const inv = allInvs.find((i) => i.id === alloc.documentId || i.invoiceNumber === alloc.documentNumber);
                                if (inv) {
                                  onClose();
                                  onViewInvoice(inv);
                                }
                              }}
                              className="px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer active:scale-95"
                            >
                              <span className="material-symbols-outlined text-[13px]">visibility</span>
                              <span>View</span>
                            </button>
                          )}
                          {alloc.documentType === 'PURCHASE' && onViewPurchase && (
                            <button
                              type="button"
                              onClick={() => {
                                const allPurs = purchases && purchases.length > 0 ? purchases : db.getPurchases();
                                const pur = allPurs.find((p) => p.id === alloc.documentId || p.billNumber === alloc.documentNumber);
                                if (pur) {
                                  onClose();
                                  onViewPurchase(pur);
                                }
                              }}
                              className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer active:scale-95"
                            >
                              <span className="material-symbols-outlined text-[13px]">visibility</span>
                              <span>View</span>
                            </button>
                          )}
                          {onUnlinkAllocation && linkedVoucher && !linkedVoucher.isReversed && !linkedVoucher.isCancelled && (
                            <button
                              type="button"
                              onClick={() => {
                                setUnlinkTarget({
                                  voucherId: linkedVoucher.id,
                                  documentType: alloc.documentType,
                                  documentId: alloc.documentId,
                                  documentNumber: alloc.documentNumber,
                                });
                              }}
                              className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer active:scale-95"
                            >
                              <span className="material-symbols-outlined text-[13px]">link_off</span>
                              <span>Unlink</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Informational Box for Non-Direct Linked Entries */}
              {!isNativeTxn && entry && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[18px] shrink-0 mt-0.5">
                      info
                    </span>
                    <div className="text-xs text-amber-900 dark:text-amber-200">
                      <p className="font-bold">Linked Source Document</p>
                      <p className="mt-0.5">
                        This entry is automatically synchronized with your {entry.type.toLowerCase().replace('_', ' ')} records.
                        To update the amount, payment mode, or party details, please edit the source record.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {onNavigateTab && (
                      <button
                        type="button"
                        onClick={handleNavigateSource}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <span>Open Source Document</span>
                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </button>
                    )}
                    {linkedVoucher && (linkedVoucher.voucherType === 'RECEIPT' || linkedVoucher.voucherType === 'PAYMENT') && !isReversed && !isCancelled && onEditVoucher && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onEditVoucher(linkedVoucher);
                        }}
                        className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-on-primary rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[14px]">edit</span>
                        <span>Edit Payment</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Unlink Confirmation Modal */}
              {unlinkTarget && (
                <ConfirmDeleteModal
                  isOpen={!!unlinkTarget}
                  title="Unlink Payment Allocation"
                  recordName={`${unlinkTarget.documentType === 'INVOICE' ? 'Invoice' : 'Bill'} #${unlinkTarget.documentNumber}`}
                  description={`Are you sure you want to unlink this payment? The ${unlinkTarget.documentType === 'INVOICE' ? 'invoice' : 'bill'} balance will be restored, and the payment voucher will remain as an unallocated advance.`}
                  confirmText="Yes, Unlink"
                  cancelText="Cancel"
                  confirmButtonClass="bg-amber-600 hover:bg-amber-700 text-white"
                  icon="link_off"
                  iconBgClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  onConfirm={() => {
                    if (onUnlinkAllocation && unlinkTarget) {
                      onUnlinkAllocation(unlinkTarget.voucherId, unlinkTarget.documentType, unlinkTarget.documentId);
                    }
                    setUnlinkTarget(null);
                    onClose();
                  }}
                  onClose={() => setUnlinkTarget(null)}
                />
              )}

              {/* Delete Confirmation Modal */}
              {showDeleteConfirm && (
                <ConfirmDeleteModal
                  isOpen={showDeleteConfirm}
                  title="Confirm Transaction Deletion"
                  recordName={rawTransaction ? `${rawTransaction.type}: ₹${rawTransaction.amount.toFixed(2)}` : undefined}
                  description="Are you sure you want to delete this transaction? This will reverse the account balance adjustment."
                  confirmText="Yes, Delete"
                  cancelText="Cancel"
                  onConfirm={handleDelete}
                  onClose={() => setShowDeleteConfirm(false)}
                />
              )}
            </div>
          )}

          {/* Edit Mode */}
          {isEditing && (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <span>{formError}</span>
                </div>
              )}

              {/* Transfer Type Selector (for transfer transactions) */}
              {isTransferCategory && (
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                    Transfer Direction
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleTransferTypeSwitch('DEPOSIT')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                        editType === 'DEPOSIT'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-outline-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                      <span>Deposit (Cash➔Bank)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTransferTypeSwitch('WITHDRAWAL')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                        editType === 'WITHDRAWAL'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-outline-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                      <span>Withdraw (Bank➔Cash)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTransferTypeSwitch('TRANSFER')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                        editType === 'TRANSFER'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-outline-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                      <span>Bank to Bank</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Direct In/Out Selector (for direct adjustments) */}
              {isDirectCategory && (
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                    Flow Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditType('ADD_MONEY');
                        setFormError(null);
                      }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        editType === 'ADD_MONEY'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-outline-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">add_circle</span>
                      <span>Money In (+)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditType('REDUCE_MONEY');
                        setFormError(null);
                      }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        editType === 'REDUCE_MONEY'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-outline-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">remove_circle</span>
                      <span>Money Out (-)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Amount & Date Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Amount (₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-on-surface-variant text-sm">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2 text-sm font-bold bg-surface-container-lowest border border-outline-variant/40 rounded-xl focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-surface-container-lowest border border-outline-variant/40 rounded-xl focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Source & Destination Account Pickers */}
              {isTransferCategory && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* From Account */}
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      From (Deducted) *
                    </label>
                    {editType === 'DEPOSIT' ? (
                      <div className="px-3 py-2 text-sm bg-surface-container rounded-xl text-on-surface font-semibold border border-outline-variant/30">
                        Cash in Hand
                      </div>
                    ) : (
                      <select
                        value={editFromAccountId}
                        onChange={(e) => setEditFromAccountId(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-surface-container-lowest border border-outline-variant/40 rounded-xl focus:border-primary focus:outline-none"
                      >
                        {bankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.accountName} ({b.accountNumber ? `...${b.accountNumber.slice(-4)}` : 'Bank'})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* To Account */}
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                      To (Credited) *
                    </label>
                    {editType === 'WITHDRAWAL' ? (
                      <div className="px-3 py-2 text-sm bg-surface-container rounded-xl text-on-surface font-semibold border border-outline-variant/30">
                        Cash in Hand
                      </div>
                    ) : (
                      <select
                        value={editToAccountId}
                        onChange={(e) => setEditToAccountId(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-surface-container-lowest border border-outline-variant/40 rounded-xl focus:border-primary focus:outline-none"
                      >
                        {bankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.accountName} ({b.accountNumber ? `...${b.accountNumber.slice(-4)}` : 'Bank'})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}

              {/* Single Account Picker for Direct In/Out */}
              {isDirectCategory && (
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    {editType === 'ADD_MONEY' ? 'Target Account (Credited)' : 'Source Account (Debited)'} *
                  </label>
                  <select
                    value={editType === 'ADD_MONEY' ? editToAccountId : editFromAccountId}
                    onChange={(e) => {
                      if (editType === 'ADD_MONEY') {
                        setEditToAccountId(e.target.value);
                      } else {
                        setEditFromAccountId(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-surface-container-lowest border border-outline-variant/40 rounded-xl focus:border-primary focus:outline-none"
                  >
                    {allAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} ({a.accountType === 'CASH' ? 'Cash' : 'Bank'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Reference No */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Reference / Cheque / UTR No (Optional)
                </label>
                <input
                  type="text"
                  value={editReferenceNo}
                  onChange={(e) => setEditReferenceNo(e.target.value)}
                  placeholder="e.g. UTR12345678, CHQ-9908"
                  className="w-full px-3 py-2 text-sm bg-surface-container-lowest border border-outline-variant/40 rounded-xl focus:border-primary focus:outline-none"
                />
              </div>

              {/* Narration */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Narration / Notes
                </label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Reason or description for this transfer"
                  className="w-full px-3 py-2 text-sm bg-surface-container-lowest border border-outline-variant/40 rounded-xl focus:border-primary focus:outline-none"
                />
              </div>

              {/* Form Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary text-on-primary rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer for View Mode */}
        {!isEditing && (
          <div className="px-5 py-3.5 border-t border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between gap-2">
            <div>
              {isNativeTxn && onDeleteTransaction && !showDeleteConfirm && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-1.5 text-rose-600 hover:bg-rose-500/10 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  <span className="hidden sm:inline">Delete</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
              >
                Close
              </button>

              {!showDeleteConfirm && (
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  data-testid="cash-bank-share-whatsapp"
                  aria-label="Share transaction on WhatsApp"
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">share</span>
                  <span className="hidden sm:inline">WhatsApp</span>
                  <span className="sm:hidden">Share</span>
                </button>
              )}

              {isNativeTxn && onSaveTransaction && !showDeleteConfirm && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  <span>Edit Transaction</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
