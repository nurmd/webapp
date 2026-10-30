import React, { useState, useMemo, useEffect } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice, PaymentSplit } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { BankAccount } from '../../models/bankAccount.ts';
import { PaymentAllocation } from '../../core/accounting/voucherTypes.ts';
import {
  getOutstandingDocuments,
  allocateOldestFirst,
  validateAllocations,
  OutstandingDocument,
} from '../../core/accounting/paymentAllocation.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { db } from '../../services/db.ts';
import { PaymentEntryForm } from '../Common/PaymentEntryForm.tsx';

export interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  party?: Party;
  parties?: Party[];
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  liveNetBalance?: number;
  isCustomer?: boolean;
  bankAccounts?: BankAccount[];
  initialPaymentType?: 'IN' | 'OUT';
  asDialog?: boolean;
  onRecordPayment: (
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string,
    paymentType?: 'IN' | 'OUT',
    paymentSplits?: PaymentSplit[],
    discount?: number,
    bankAccountId?: string,
    allocations?: PaymentAllocation[],
    allocationMode?: 'MANUAL' | 'AUTO_FIFO' | 'UNALLOCATED' | 'SOURCE_DOCUMENT',
    paymentDate?: string
  ) => boolean | void;
  onRefresh?: () => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  party,
  parties,
  invoices,
  purchases,
  liveNetBalance: _liveNetBalance,
  isCustomer,
  bankAccounts,
  initialPaymentType,
  asDialog,
  onRecordPayment,
  onRefresh,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 20);

  const [paymentType, setPaymentType] = useState<'IN' | 'OUT'>(
    initialPaymentType || (isCustomer !== undefined ? (isCustomer ? 'IN' : 'OUT') : party?.type === 'SUPPLIER' ? 'OUT' : 'IN')
  );

  const allParties = useMemo(() => {
    return parties && parties.length > 0 ? parties : db.getParties();
  }, [parties]);

  const [selectedPartyId, setSelectedPartyId] = useState<string>(party?.id || '');

  const activeParty = useMemo(() => {
    if (party) return party;
    return allParties.find((p) => p.id === selectedPartyId) || null;
  }, [party, allParties, selectedPartyId]);

  const [paymentAmount, setPaymentAmount] = useState<string>(() => {
    if (party && party.currentBalance !== 0) {
      return Math.abs(party.currentBalance).toString();
    }
    return '';
  });

  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('UPI');
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitUPI, setSplitUPI] = useState<string>('');
  const [splitBank, setSplitBank] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  // Allocation state
  const [allocationsMap, setAllocationsMap] = useState<Record<string, number>>({});
  const [isManualAllocation, setIsManualAllocation] = useState<boolean>(false);

  const availableBankAccounts = useMemo(() => {
    const all = (bankAccounts && bankAccounts.length > 0 ? bankAccounts : db.getBankAccounts()) || [];
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
  }, [bankAccounts]);

  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>(() => {
    const all = (bankAccounts && bankAccounts.length > 0 ? bankAccounts : db.getBankAccounts()) || [];
    const banks = all.filter((a) => a.accountType === 'BANK');
    const def = banks.find((a) => a.isDefault) || banks[0];
    return def?.id || 'ACC_BANK';
  });

  useEffect(() => {
    if (availableBankAccounts.length > 0 && !availableBankAccounts.some((a) => a.id === selectedBankAccountId)) {
      const def = availableBankAccounts.find((a) => a.isDefault) || availableBankAccounts[0];
      if (def) setSelectedBankAccountId(def.id);
    }
  }, [availableBankAccounts, selectedBankAccountId]);

  // Update payment amount when switching party if empty
  useEffect(() => {
    if (!party && activeParty && !paymentAmount && activeParty.currentBalance !== 0) {
      setPaymentAmount(Math.abs(activeParty.currentBalance).toString());
    }
  }, [party, activeParty, paymentAmount]);

  // Reset allocations if paymentType or activeParty changes
  useEffect(() => {
    setAllocationsMap({});
    setIsManualAllocation(false);
  }, [paymentType, activeParty?.id]);

  // Outstanding documents for selected party
  const outstandingDocs: OutstandingDocument[] = useMemo(() => {
    if (!activeParty) return [];
    return getOutstandingDocuments({
      partyId: activeParty.id,
      partyName: activeParty.name,
      documentType: paymentType === 'IN' ? 'INVOICE' : 'PURCHASE',
      invoices: invoices || db.getInvoices(),
      purchases: purchases || db.getPurchases(),
    });
  }, [activeParty, paymentType, invoices, purchases]);

  // Calculate settlement totals
  const numPayAmount = parseFloat(paymentAmount) || 0;
  const numDiscount = parseFloat(discountAmount) || 0;
  const totalSettled = Number((numPayAmount + numDiscount).toFixed(2));

  // Auto-allocate FIFO when amount changes, unless user manually edited allocations
  useEffect(() => {
    if (isManualAllocation) return;
    if (totalSettled <= 0 || outstandingDocs.length === 0) {
      setAllocationsMap({});
      return;
    }
    const auto = allocateOldestFirst(outstandingDocs, totalSettled);
    const map: Record<string, number> = {};
    for (const a of auto) {
      map[a.documentId] = a.amount;
    }
    setAllocationsMap(map);
  }, [totalSettled, outstandingDocs, isManualAllocation]);

  const totalAllocated = useMemo(() => {
    let sum = 0;
    for (const val of Object.values(allocationsMap)) {
      sum += Number(val) || 0;
    }
    return Number(sum.toFixed(2));
  }, [allocationsMap]);

  const unallocatedAmount = useMemo(() => {
    return Math.max(0, Number((totalSettled - totalAllocated).toFixed(2)));
  }, [totalSettled, totalAllocated]);

  const isOverAllocated = totalAllocated > totalSettled + 0.01;

  if (!isOpen) return null;

  const handleAutoAllocate = () => {
    if (totalSettled <= 0) return;
    const auto = allocateOldestFirst(outstandingDocs, totalSettled);
    const map: Record<string, number> = {};
    for (const a of auto) {
      map[a.documentId] = a.amount;
    }
    setAllocationsMap(map);
    setIsManualAllocation(false);
  };

  const handleSelectAll = () => {
    let remaining = totalSettled;
    const map: Record<string, number> = {};
    for (const doc of outstandingDocs) {
      if (remaining <= 0) break;
      const allocAmt = Math.min(doc.balanceAmount, remaining);
      map[doc.id] = Number(allocAmt.toFixed(2));
      remaining = Number((remaining - allocAmt).toFixed(2));
    }
    setAllocationsMap(map);
    setIsManualAllocation(true);
  };

  const handleClearAllocations = () => {
    setAllocationsMap({});
    setIsManualAllocation(true);
  };

  const handleToggleDoc = (doc: OutstandingDocument) => {
    const currentAlloc = allocationsMap[doc.id] || 0;
    if (currentAlloc > 0) {
      setAllocationsMap((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
      setIsManualAllocation(true);
    } else {
      const alreadyAllocated = Object.entries(allocationsMap).reduce(
        (sum, [id, val]) => (id === doc.id ? sum : sum + (Number(val) || 0)),
        0
      );
      const remaining = Math.max(0, Number((totalSettled - alreadyAllocated).toFixed(2)));
      if (remaining <= 0) {
        alert('All payment funds have already been allocated. Increase payment amount or reduce other allocations first.');
        return;
      }
      const allocAmt = Math.min(doc.balanceAmount, remaining);
      setAllocationsMap((prev) => ({
        ...prev,
        [doc.id]: Number(allocAmt.toFixed(2)),
      }));
      setIsManualAllocation(true);
    }
  };

  const handleAllocationValueChange = (docId: string, valStr: string) => {
    const val = parseFloat(valStr) || 0;
    setAllocationsMap((prev) => ({
      ...prev,
      [docId]: val,
    }));
    setIsManualAllocation(true);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeParty) {
      alert('Please select a party.');
      return;
    }

    let amt = parseFloat(paymentAmount);
    const disc = parseFloat(discountAmount) || 0;
    let splits: PaymentSplit[] | undefined = undefined;

    if (paymentMode === 'SPLIT') {
      const c = parseFloat(splitCash) || 0;
      const u = parseFloat(splitUPI) || 0;
      const b = parseFloat(splitBank) || 0;
      const totalSplit = Number((c + u + b).toFixed(2));

      if (totalSplit <= 0) {
        alert('Please enter at least one split tender amount (Cash, UPI, or Bank).');
        return;
      }
      amt = totalSplit;
      const selectedBank = availableBankAccounts.find((a) => a.id === selectedBankAccountId) || availableBankAccounts[0];
      splits = [
        ...(c > 0 ? [{ id: 's-cash', mode: 'CASH' as const, amount: c, accountId: 'ACC_CASH', accountName: 'Cash-in-hand' }] : []),
        ...(u > 0 ? [{ id: 's-upi', mode: 'UPI' as const, amount: u, accountId: selectedBank?.id, accountName: selectedBank?.accountName }] : []),
        ...(b > 0 ? [{ id: 's-bank', mode: 'BANK' as const, amount: b, accountId: selectedBank?.id, accountName: selectedBank?.accountName }] : []),
      ];
    }

    if (!amt || amt <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }

    // Build resolved allocations
    const builtAllocations: PaymentAllocation[] = [];
    for (const doc of outstandingDocs) {
      const allocAmt = allocationsMap[doc.id];
      if (allocAmt && allocAmt > 0) {
        builtAllocations.push({
          documentType: doc.documentType,
          documentId: doc.id,
          documentNumber: doc.documentNumber,
          amount: Number(allocAmt.toFixed(2)),
          date: doc.date,
        });
      }
    }

    // Validate allocations
    const valResult = validateAllocations({
      allocations: builtAllocations,
      documents: outstandingDocs,
      totalSettled: Number((amt + disc).toFixed(2)),
      partyId: activeParty.id,
      partyName: activeParty.name,
    });

    if (!valResult.valid) {
      alert(valResult.error || 'Invalid payment allocations.');
      return;
    }

    let splitDesc = '';
    if (splits && splits.length > 0) {
      splitDesc = splits.map((s) => `${s.mode}: ₹${s.amount.toFixed(2)}`).join(', ');
    }

    const selectedBank = availableBankAccounts.find((a) => a.id === selectedBankAccountId) || availableBankAccounts[0];
    const bankDesc = paymentMode === 'BANK' && selectedBank ? `Bank: ${selectedBank.accountName}` : '';

    const fullNotes = [
      paymentRef ? `Ref: ${paymentRef}` : '',
      bankDesc,
      splitDesc ? `Split (${splitDesc})` : '',
      disc > 0 ? `Discount: ₹${disc.toFixed(2)}` : '',
      paymentNotes,
    ].filter(Boolean).join(' • ');

    const allocationMode = isManualAllocation
      ? (builtAllocations.length > 0 ? 'MANUAL' : 'UNALLOCATED')
      : (builtAllocations.length > 0 ? 'AUTO_FIFO' : 'UNALLOCATED');

    const resolvedBankId =
      paymentMode === 'BANK' || (paymentMode === 'SPLIT' && (splits?.some((s) => s.mode === 'BANK') ?? false))
        ? selectedBankAccountId
        : undefined;

    const resolvedNotes =
      fullNotes || `${paymentType === 'IN' ? 'Payment In' : 'Payment Out'} of ${formatINR(amt)} on ${paymentDate}${disc > 0 ? ` (Discount: ${formatINR(disc)})` : ''}`;

    const result = onRecordPayment(
      activeParty,
      amt,
      paymentMode,
      resolvedNotes,
      paymentType,
      splits,
      disc,
      resolvedBankId,
      builtAllocations,
      allocationMode,
      paymentDate
    );

    if (result === false) {
      return;
    }

    onClose();
    setDiscountAmount('');
    setSplitCash('');
    setSplitUPI('');
    setSplitBank('');
    setAllocationsMap({});
    setIsManualAllocation(false);
    onRefresh?.();
  };

  const modalForm = (
    <form
      onSubmit={handlePaymentSubmit}
      className="p-3 bg-surface-container rounded-2xl border border-secondary/30 flex flex-col gap-2.5 animate-in fade-in shadow-xs"
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-bold flex items-center gap-1 ${
            paymentType === 'IN' ? 'text-secondary' : 'text-amber-600 dark:text-amber-400'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {paymentType === 'IN' ? 'call_received' : 'call_made'}
          </span>
          <span>
            {paymentType === 'IN' ? 'Record Payment In (Receipt)' : 'Record Payment Out'}
            {activeParty ? ` • ${activeParty.name}` : ''}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-on-surface-variant hover:text-on-surface p-0.5 cursor-pointer"
          title="Close"
          aria-label="Close payment modal"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {/* In vs Out Toggle */}
      <div className="grid grid-cols-2 gap-1 p-0.5 bg-surface rounded-xl border border-outline-variant/20 text-xs">
        <button
          type="button"
          onClick={() => setPaymentType('IN')}
          className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            paymentType === 'IN'
              ? 'bg-secondary text-on-secondary shadow-xs'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">call_received</span>
          <span>Payment In</span>
        </button>
        <button
          type="button"
          onClick={() => setPaymentType('OUT')}
          className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
            paymentType === 'OUT'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">call_made</span>
          <span>Payment Out</span>
        </button>
      </div>

      {/* Party Selector (if not opened from dedicated Party page) */}
      {!party && (
        <div className="flex flex-col gap-1">
          <label htmlFor="party-select" className="text-[10px] font-bold text-on-surface-variant">
            Select {paymentType === 'IN' ? 'Customer' : 'Supplier / Vendor'} *
          </label>
          <select
            id="party-select"
            required
            value={selectedPartyId}
            onChange={(e) => setSelectedPartyId(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none min-h-[36px] cursor-pointer"
          >
            <option value="">-- Choose Party --</option>
            {allParties
              .filter((p) => (paymentType === 'IN' ? p.type !== 'SUPPLIER' : p.type !== 'CUSTOMER'))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.currentBalance !== 0 ? `(Bal: ${formatINR(p.currentBalance)})` : ''}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Payment Entry Form (Date, Amount, Discount, Mode, Bank, Split Tender) */}
      <PaymentEntryForm
        date={paymentDate}
        onChangeDate={setPaymentDate}
        amount={paymentAmount}
        onChangeAmount={setPaymentAmount}
        paymentType={paymentType}
        discount={discountAmount}
        onChangeDiscount={setDiscountAmount}
        mode={paymentMode}
        onChangeMode={setPaymentMode}
        bankAccountId={selectedBankAccountId}
        onChangeBankAccountId={setSelectedBankAccountId}
        bankAccounts={availableBankAccounts}
        splitCash={splitCash}
        onChangeSplitCash={setSplitCash}
        splitUPI={splitUPI}
        onChangeSplitUPI={setSplitUPI}
        splitBank={splitBank}
        onChangeSplitBank={setSplitBank}
        showNotes={false}
      />

      {/* ── INVOICE / BILL LINK SECTION ── */}
      {activeParty && (
        <div className="p-2.5 bg-surface rounded-xl border border-outline-variant/25 flex flex-col gap-2">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-secondary">link</span>
              <span className="text-xs font-bold text-on-surface">
                Link {paymentType === 'IN' ? 'Invoices' : 'Bills'} ({outstandingDocs.length} outstanding)
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleAutoAllocate}
                className="px-2 py-0.5 bg-secondary/10 hover:bg-secondary/20 text-secondary rounded text-[10px] font-bold transition-colors cursor-pointer"
                title="Auto-allocate FIFO oldest first"
              >
                Auto FIFO
              </button>
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2 py-0.5 bg-surface-container hover:bg-surface-container-high text-on-surface rounded text-[10px] font-bold transition-colors cursor-pointer"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleClearAllocations}
                className="px-2 py-0.5 bg-surface-container hover:bg-surface-container-high text-on-surface-variant rounded text-[10px] font-bold transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {outstandingDocs.length === 0 ? (
            <p className="text-[11px] text-on-surface-variant italic py-1">
              No outstanding {paymentType === 'IN' ? 'invoices' : 'bills'} found for this party. Payment will be saved as an unallocated on-account advance.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1 divide-y divide-outline-variant/15">
              {outstandingDocs.map((doc) => {
                const allocVal = allocationsMap[doc.id] || 0;
                const isChecked = allocVal > 0;
                const isExceedsDocBal = allocVal > doc.balanceAmount + 0.01;

                return (
                  <div
                    key={doc.id}
                    className={`pt-1 pb-1 flex items-center justify-between gap-2 text-xs transition-colors ${
                      isChecked ? 'bg-secondary/5 -mx-1 px-1 rounded' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleDoc(doc)}
                        className="rounded accent-secondary cursor-pointer"
                      />
                      <div className="min-w-0 flex flex-col">
                        <span className="font-bold text-on-surface truncate text-[11px]">
                          #{doc.documentNumber}
                        </span>
                        <span className="text-[10px] text-on-surface-variant">
                          {formatDate(doc.date)} • Bal: {formatINR(doc.balanceAmount)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div className="relative flex items-center">
                        <span className="absolute left-1.5 text-[10px] text-on-surface-variant font-bold">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={doc.balanceAmount}
                          value={allocVal > 0 ? allocVal : ''}
                          placeholder="0.00"
                          onChange={(e) => handleAllocationValueChange(doc.id, e.target.value)}
                          className={`w-20 pl-4 pr-1 py-0.5 bg-surface rounded text-right font-bold text-xs border ${
                            isExceedsDocBal
                              ? 'border-error text-error'
                              : isChecked
                              ? 'border-secondary text-secondary'
                              : 'border-outline-variant/30 text-on-surface'
                          } focus:outline-none`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Allocation summary strip */}
          <div className="pt-1.5 border-t border-outline-variant/20 flex items-center justify-between text-[11px] font-bold">
            <span className={isOverAllocated ? 'text-error' : 'text-secondary'}>
              Allocated: {formatINR(totalAllocated)}
            </span>
            <span className="text-on-surface-variant">
              Unallocated / Advance: {formatINR(unallocatedAmount)}
            </span>
          </div>

          {isOverAllocated && (
            <p className="text-[10px] font-bold text-error">
              Allocated sum ({formatINR(totalAllocated)}) exceeds payment total ({formatINR(totalSettled)}). Please adjust amounts.
            </p>
          )}
        </div>
      )}

      {/* Note & Save */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Reference / Note"
          value={paymentRef}
          onChange={(e) => setPaymentRef(e.target.value)}
          className="flex-1 px-2.5 py-1.5 bg-surface rounded-xl text-xs text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none"
        />
        <button
          type="submit"
          disabled={isOverAllocated}
          className={`px-4 py-1.5 text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 cursor-pointer whitespace-nowrap disabled:opacity-50 ${
            paymentType === 'IN' ? 'bg-secondary' : 'bg-amber-600'
          }`}
        >
          Save {paymentType === 'IN' ? 'Payment In' : 'Payment Out'}
        </button>
      </div>
    </form>
  );

  if (asDialog) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-on-surface/50 backdrop-blur-xs animate-fade-in"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-surface-container rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto border border-outline-variant/30 shadow-2xl p-3 sm:p-4">
          {modalForm}
        </div>
      </div>
    );
  }

  return modalForm;
};
