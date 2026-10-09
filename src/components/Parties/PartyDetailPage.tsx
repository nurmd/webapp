import React, { useState, useMemo } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice, PaymentMode, PaymentSplit } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Voucher, JournalEntryLine } from '../../core/accounting/voucherTypes.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { printPartyLedgerStatement } from '../../core/utils/ledgerStatementPrinter.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { db } from '../../services/db.ts';
import { SimplifiedPurchaseModal } from '../Purchases/SimplifiedPurchaseModal.tsx';
import { SimplifiedInvoiceModal } from '../Invoicing/SimplifiedInvoiceModal.tsx';

export interface PartyDetailPageProps {
  party: Party;
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseBill[];
  vouchers?: Voucher[];
  onBack: () => void;
  onEditParty: (party: Party) => void;
  onDeleteParty?: (id: string) => void;
  onRecordPayment: (
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string,
    paymentType?: 'IN' | 'OUT',
    paymentSplits?: PaymentSplit[]
  ) => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onEditPurchase?: (bill: PurchaseBill) => void;
  onCreateInvoice?: (party: Party) => void;
  onCreatePurchase?: (party: Party) => void;
  onRefresh?: () => void;
}

export interface PassbookEntry {
  id: string;
  rawId?: string;
  date: string;
  docNumber: string;
  type: 'SALE' | 'PURCHASE' | 'PAYMENT_IN' | 'PAYMENT_OUT' | 'OPENING';
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  paymentMode?: string;
  status?: string;
  rawInvoice?: Invoice;
  rawPurchase?: PurchaseBill;
  rawVoucher?: Voucher;
  isOpening?: boolean;
  billAmount?: number;
}

export const PartyDetailPage: React.FC<PartyDetailPageProps> = ({
  party,
  company,
  invoices = [],
  purchases = [],
  vouchers = [],
  onBack,
  onEditParty,
  onDeleteParty,
  onRecordPayment,
  onViewInvoice,
  onEditInvoice,
  onEditPurchase,
  onCreateInvoice,
  onCreatePurchase,
  onRefresh,
}) => {
  const [txnFilter, setTxnFilter] = useState<'ALL' | 'BILLS' | 'PAYMENTS'>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'THIS_MONTH' | 'LAST_30_DAYS'>('ALL');
  const [txnSortOrder, setTxnSortOrder] = useState<'NEWEST' | 'OLDEST'>('NEWEST');
  const [searchTxn, setSearchTxn] = useState('');
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [showPartyDetails, setShowPartyDetails] = useState(false);

  // Edit Ledger Item Modal state
  const [editingLedgerEntry, setEditingLedgerEntry] = useState<PassbookEntry | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editMode, setEditMode] = useState('UPI');
  const [editSplitCash, setEditSplitCash] = useState('');
  const [editSplitUPI, setEditSplitUPI] = useState('');
  const [editSplitBank, setEditSplitBank] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editType, setEditType] = useState<'IN' | 'OUT'>('IN');
  const [editOpeningType, setEditOpeningType] = useState<'RECEIVABLE' | 'PAYABLE'>('RECEIVABLE');

  // Simplified Purchase View Modal state
  const [selectedPurchaseBill, setSelectedPurchaseBill] = useState<PurchaseBill | null>(null);

  // Simplified Invoice View Modal state
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<Invoice | null>(null);

  const isCustomer = party.type === 'CUSTOMER';

  // System back navigation handling
  useBackNavigation(() => {
    if (selectedInvoiceForView) {
      setSelectedInvoiceForView(null);
      return true;
    }
    if (selectedPurchaseBill) {
      setSelectedPurchaseBill(null);
      return true;
    }
    if (editingLedgerEntry) {
      setEditingLedgerEntry(null);
      return true;
    }
    if (isPaymentOpen) {
      setIsPaymentOpen(false);
      return true;
    }
    if (showPartyDetails) {
      setShowPartyDetails(false);
      return true;
    }
    onBack();
    return true;
  }, true, 15);

  // Payment Form State
  const [paymentType, setPaymentType] = useState<'IN' | 'OUT'>(isCustomer ? 'IN' : 'OUT');
  const [paymentAmount, setPaymentAmount] = useState<string>(
    party.currentBalance !== 0 ? Math.abs(party.currentBalance).toString() : ''
  );
  const [paymentMode, setPaymentMode] = useState<string>('UPI');
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitUPI, setSplitUPI] = useState<string>('');
  const [splitBank, setSplitBank] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  // Filter party's sales and purchases
  const partyInvoices = useMemo(() => {
    return invoices.filter(
      (inv) => inv.partyId === party.id || inv.partyName.toLowerCase() === party.name.toLowerCase()
    );
  }, [invoices, party]);

  const partyPurchases = useMemo(() => {
    return purchases.filter(
      (pur) => pur.supplierId === party.id || pur.supplierName.toLowerCase() === party.name.toLowerCase()
    );
  }, [purchases, party]);

  // Aggregate totals
  const totalBilled = useMemo(() => {
    return isCustomer
      ? partyInvoices.reduce((s, inv) => s + inv.grandTotal, 0)
      : partyPurchases.reduce((s, pur) => s + pur.grandTotal, 0);
  }, [isCustomer, partyInvoices, partyPurchases]);

  const totalPaid = useMemo(() => {
    return isCustomer
      ? partyInvoices.reduce((s, inv) => s + inv.paidAmount, 0)
      : partyPurchases.reduce((s, pur) => s + pur.paidAmount, 0);
  }, [isCustomer, partyInvoices, partyPurchases]);

  // Build Chronological Passbook with Running Balance
  const passbook: PassbookEntry[] = useMemo(() => {
    const rawEntries: Omit<PassbookEntry, 'runningBalance'>[] = [];

    // Sales Invoices (Debit the full billed amount)
    partyInvoices.forEach((inv) => {
      rawEntries.push({
        id: `sale-${inv.id}`,
        rawId: inv.id,
        date: inv.date,
        docNumber: inv.invoiceNumber,
        type: 'SALE',
        description: inv.items && inv.items.length > 0
          ? `${inv.items.length} items (${inv.items.map((i) => i.name).slice(0, 2).join(', ')})`
          : `Sale #${inv.invoiceNumber}`,
        debit: inv.grandTotal,
        credit: 0,
        billAmount: inv.grandTotal,
        status: inv.paymentStatus,
        paymentMode: inv.paymentMode,
        rawInvoice: inv,
      });
    });

    // Purchase Bills (Credit the full billed amount)
    partyPurchases.forEach((pur) => {
      rawEntries.push({
        id: `pur-${pur.id}`,
        rawId: pur.id,
        date: pur.date,
        docNumber: pur.billNumber,
        type: 'PURCHASE',
        description: pur.items && pur.items.length > 0
          ? `${pur.items.length} items (${pur.items.map((i) => i.name).slice(0, 2).join(', ')})`
          : `Purchase Bill #${pur.billNumber}`,
        debit: 0,
        credit: pur.grandTotal,
        billAmount: pur.grandTotal,
        status: pur.paymentStatus,
        paymentMode: pur.paymentMode,
        rawPurchase: pur,
      });
    });

    // Accounting Vouchers (Receipts / Payments)
    let totalVoucherReceipts = 0;
    let totalVoucherPayments = 0;

    vouchers.forEach((v) => {
      const isPartyVoucher = v.entries.some(
        (e) => e.accountId === party.id || e.accountName.toLowerCase() === party.name.toLowerCase()
      );

      if (isPartyVoucher) {
        const isDupe = rawEntries.some(
          (e) => e.docNumber === v.voucherNumber || (v.referenceNo && e.docNumber.includes(v.referenceNo))
        );
        if (!isDupe) {
          const cashLines = v.entries.filter((e) => e.accountId === 'ACC_CASH' && (e.debit > 0 || e.credit > 0));
          const bankLines = v.entries.filter((e) => e.accountId === 'ACC_BANK' && (e.debit > 0 || e.credit > 0));
          const isSplitVoucher = cashLines.length > 0 && bankLines.length > 0;
          const vMode = isSplitVoucher
            ? 'SPLIT'
            : cashLines.length > 0
            ? 'CASH'
            : bankLines.length > 0
            ? (v.narration?.toUpperCase().includes('BANK') ? 'BANK' : 'UPI')
            : 'UPI';

          if (v.voucherType === 'RECEIPT') {
            totalVoucherReceipts += v.totalAmount;
            rawEntries.push({
              id: `vchr-${v.id}`,
              rawId: v.id,
              date: v.date,
              docNumber: v.voucherNumber,
              type: 'PAYMENT_IN',
              description: v.narration || (isSplitVoucher ? 'Split Payment received' : 'Payment received'),
              debit: 0,
              credit: v.totalAmount,
              status: 'PAID',
              paymentMode: vMode,
              rawVoucher: v,
            });
          } else if (v.voucherType === 'PAYMENT') {
            totalVoucherPayments += v.totalAmount;
            rawEntries.push({
              id: `vchr-${v.id}`,
              rawId: v.id,
              date: v.date,
              docNumber: v.voucherNumber,
              type: 'PAYMENT_OUT',
              description: v.narration || (isSplitVoucher ? 'Split Payment disbursed' : 'Payment made'),
              debit: v.totalAmount,
              credit: 0,
              status: 'PAID',
              paymentMode: vMode,
              rawVoucher: v,
            });
          }
        }
      }
    });

    // Account for upfront payments made directly on invoices/bills without separate vouchers
    if (isCustomer) {
      const totalPaidOnInvoices = partyInvoices.reduce((s, inv) => s + (inv.paidAmount || 0), 0);
      let unvoucheredPaid = Math.max(0, totalPaidOnInvoices - totalVoucherReceipts);

      if (unvoucheredPaid > 0) {
        const sortedInvs = [...partyInvoices]
          .filter((inv) => (inv.paidAmount || 0) > 0)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        for (const inv of sortedInvs) {
          if (unvoucheredPaid <= 0) break;
          const amt = Math.min(unvoucheredPaid, inv.paidAmount || 0);
          const hasSplits = inv.paymentSplits && inv.paymentSplits.filter((s) => s.mode !== 'CREDIT').length > 1;
          const invMode = hasSplits ? 'SPLIT' : (inv.paymentMode || 'Cash');
          rawEntries.push({
            id: `pay-inv-${inv.id}`,
            rawId: inv.id,
            date: inv.date,
            docNumber: `PAY-${inv.invoiceNumber}`,
            type: 'PAYMENT_IN',
            description: hasSplits
              ? `Payment (Split on #${inv.invoiceNumber})`
              : `Payment (${inv.paymentMode || 'Cash'} on #${inv.invoiceNumber})`,
            debit: 0,
            credit: amt,
            status: 'PAID',
            paymentMode: invMode,
            rawInvoice: inv,
          });
          unvoucheredPaid -= amt;
        }
      }
    } else {
      const totalPaidOnPurchases = partyPurchases.reduce((s, pur) => s + (pur.paidAmount || 0), 0);
      let unvoucheredPaid = Math.max(0, totalPaidOnPurchases - totalVoucherPayments);

      if (unvoucheredPaid > 0) {
        const sortedPurs = [...partyPurchases]
          .filter((pur) => (pur.paidAmount || 0) > 0)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        for (const pur of sortedPurs) {
          if (unvoucheredPaid <= 0) break;
          const amt = Math.min(unvoucheredPaid, pur.paidAmount || 0);
          const hasSplits = pur.paymentSplits && pur.paymentSplits.filter((s) => s.mode !== 'CREDIT').length > 1;
          const purMode = hasSplits ? 'SPLIT' : (pur.paymentMode || 'Cash');
          rawEntries.push({
            id: `pay-pur-${pur.id}`,
            rawId: pur.id,
            date: pur.date,
            docNumber: `PAY-${pur.billNumber}`,
            type: 'PAYMENT_OUT',
            description: hasSplits
              ? `Payment (Split on #${pur.billNumber})`
              : `Payment (${pur.paymentMode || 'Cash'} on #${pur.billNumber})`,
            debit: amt,
            credit: 0,
            status: 'PAID',
            paymentMode: purMode,
            rawPurchase: pur,
          });
          unvoucheredPaid -= amt;
        }
      }
    }

    // Only genuine, explicit opening balance (no fake synthesized opening balances)
    const hasExplicitOpening = typeof party.openingBalance === 'number' && party.openingBalance > 0;
    const openingDate = party.openingBalanceDate || (party.createdAt ? party.createdAt.split('T')[0] : '2026-01-01');

    if (hasExplicitOpening) {
      const amt = party.openingBalance!;
      const opType = party.openingBalanceType || (isCustomer ? 'TO_RECEIVE' : 'TO_PAY');
      const isRec = opType === 'TO_RECEIVE';
      rawEntries.push({
        id: `opening-${party.id}`,
        rawId: party.id,
        date: openingDate,
        docNumber: 'OPENING',
        type: 'OPENING',
        description: `Opening Balance (${isRec ? "You'll Get" : "You'll Give"})`,
        debit: isRec ? amt : 0,
        credit: isRec ? 0 : amt,
        status: 'OPENING',
        isOpening: true,
      });
    }

    rawEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    return rawEntries.map((entry) => {
      if (isCustomer) {
        running += entry.debit - entry.credit;
      } else {
        running += entry.credit - entry.debit;
      }
      return { ...entry, runningBalance: Math.round(running * 100) / 100 };
    });
  }, [party, partyInvoices, partyPurchases, vouchers, isCustomer]);

  // Derived current net balance directly from passbook running balance
  const liveNetBalance = useMemo(() => {
    if (passbook.length === 0) {
      if (typeof party.openingBalance === 'number' && party.openingBalance > 0) {
        const opType = party.openingBalanceType || (isCustomer ? 'TO_RECEIVE' : 'TO_PAY');
        return opType === 'TO_RECEIVE' ? party.openingBalance : -party.openingBalance;
      }
      return party.currentBalance || 0;
    }
    const lastRunning = passbook[passbook.length - 1].runningBalance;
    return isCustomer ? lastRunning : -lastRunning;
  }, [passbook, party.openingBalance, party.openingBalanceType, party.currentBalance, isCustomer]);

  const isReceivable = liveNetBalance > 0;
  const isPayable = liveNetBalance < 0;

  // Filtered passbook list - defaults to NEWEST first
  const filteredPassbook = useMemo(() => {
    const now = new Date();
    const currentMonthPrefix = now.toISOString().slice(0, 7);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const matches = passbook.filter((entry) => {
      if (txnFilter === 'BILLS' && entry.type !== 'SALE' && entry.type !== 'PURCHASE') return false;
      if (txnFilter === 'PAYMENTS' && entry.type !== 'PAYMENT_IN' && entry.type !== 'PAYMENT_OUT') return false;

      if (dateFilter === 'THIS_MONTH') {
        if (!entry.date.startsWith(currentMonthPrefix)) return false;
      } else if (dateFilter === 'LAST_30_DAYS') {
        if (new Date(entry.date) < thirtyDaysAgo) return false;
      }

      if (searchTxn.trim()) {
        const q = searchTxn.toLowerCase();
        const m =
          entry.docNumber.toLowerCase().includes(q) ||
          entry.description.toLowerCase().includes(q) ||
          (entry.paymentMode && entry.paymentMode.toLowerCase().includes(q)) ||
          entry.debit.toString().includes(q) ||
          entry.credit.toString().includes(q);
        if (!m) return false;
      }

      return true;
    });

    if (txnSortOrder === 'NEWEST') {
      return [...matches].reverse();
    }
    return matches;
  }, [passbook, txnFilter, dateFilter, searchTxn, txnSortOrder]);

  const handlePrintStatement = () => {
    const printable = filteredPassbook.map((e) => ({
      date: e.date,
      docNumber: e.docNumber,
      type: e.type,
      description: e.description,
      debit: e.debit,
      credit: e.credit,
      runningBalance: e.runningBalance,
    }));
    const periodLabel =
      dateFilter === 'THIS_MONTH'
        ? 'Current Month'
        : dateFilter === 'LAST_30_DAYS'
        ? 'Last 30 Days'
        : 'All Time Passbook';
    printPartyLedgerStatement(party, company, printable, periodLabel);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let amt = parseFloat(paymentAmount);
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
      splits = [
        ...(c > 0 ? [{ id: 's-cash', mode: 'CASH' as const, amount: c }] : []),
        ...(u > 0 ? [{ id: 's-upi', mode: 'UPI' as const, amount: u }] : []),
        ...(b > 0 ? [{ id: 's-bank', mode: 'BANK' as const, amount: b }] : []),
      ];
    }

    if (!amt || amt <= 0) return;

    let splitDesc = '';
    if (splits && splits.length > 0) {
      splitDesc = splits.map((s) => `${s.mode}: ₹${s.amount.toFixed(2)}`).join(', ');
    }

    const fullNotes = [
      paymentRef ? `Ref: ${paymentRef}` : '',
      splitDesc ? `Split (${splitDesc})` : '',
      paymentNotes,
    ].filter(Boolean).join(' • ');

    onRecordPayment(
      party,
      amt,
      paymentMode,
      fullNotes || `${paymentType === 'IN' ? 'Payment In' : 'Payment Out'} of ${formatINR(amt)} on ${paymentDate}`,
      paymentType,
      splits
    );
    setIsPaymentOpen(false);
    setSplitCash('');
    setSplitUPI('');
    setSplitBank('');
    onRefresh?.();
  };

  const handleWhatsAppReminder = () => {
    const bizName = company.tradeName || company.businessName || 'Vyapar Books';
    const upiLink = company.upiId
      ? `upi://pay?pa=${encodeURIComponent(company.upiId)}&pn=${encodeURIComponent(bizName)}&am=${Math.abs(
          liveNetBalance
        )}&cu=INR`
      : '';

    const text =
      `*LEDGER STATEMENT - ${bizName}*\n` +
      `Party: *${party.name}*\n` +
      `Date: ${new Date().toLocaleDateString('en-IN')}\n\n` +
      `Total Bills: ${formatINR(totalBilled)}\n` +
      `Total Paid: ${formatINR(totalPaid)}\n` +
      `*Net Balance Due: ${formatINR(Math.abs(liveNetBalance))} ${
        isReceivable ? '(To Collect)' : isPayable ? '(To Pay)' : '(Settled)'
      }*\n\n` +
      (upiLink ? `*Instant UPI Payment Link:*\n${upiLink}\n\n` : '') +
      `Thank you for doing business with us!`;

    const clean = party.phone.replace(/\D/g, '');
    const phone = clean.length === 10 ? `91${clean}` : clean;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleDelete = () => {
    if (window.confirm(`Delete party "${party.name}"? This removes them from your active contacts list.`)) {
      onDeleteParty?.(party.id);
    }
  };

  // Open Edit Ledger Item Modal
  const handleOpenEditLedgerItem = (entry: PassbookEntry) => {
    setEditingLedgerEntry(entry);
    setEditDate(entry.date);
    const amtVal = entry.credit > 0 ? entry.credit : entry.debit;
    setEditAmount(amtVal.toString());
    setEditMode(entry.paymentMode || 'UPI');
    setEditNotes(entry.description || '');
    setEditType(entry.type === 'PAYMENT_IN' ? 'IN' : 'OUT');

    if (entry.rawVoucher) {
      const v = entry.rawVoucher;
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
    } else if (entry.rawInvoice?.paymentSplits && entry.rawInvoice.paymentSplits.length > 1) {
      setEditMode('SPLIT');
      const c = entry.rawInvoice.paymentSplits.find((s) => s.mode === 'CASH')?.amount || 0;
      const u = entry.rawInvoice.paymentSplits.find((s) => s.mode === 'UPI')?.amount || 0;
      const b = entry.rawInvoice.paymentSplits.find((s) => s.mode === 'BANK' || s.mode === 'NET_BANKING')?.amount || 0;
      setEditSplitCash(c > 0 ? c.toString() : '');
      setEditSplitUPI(u > 0 ? u.toString() : '');
      setEditSplitBank(b > 0 ? b.toString() : '');
    } else if (entry.rawPurchase?.paymentSplits && entry.rawPurchase.paymentSplits.length > 1) {
      setEditMode('SPLIT');
      const c = entry.rawPurchase.paymentSplits.find((s) => s.mode === 'CASH')?.amount || 0;
      const u = entry.rawPurchase.paymentSplits.find((s) => s.mode === 'UPI')?.amount || 0;
      const b = entry.rawPurchase.paymentSplits.find((s) => s.mode === 'BANK' || s.mode === 'NET_BANKING')?.amount || 0;
      setEditSplitCash(c > 0 ? c.toString() : '');
      setEditSplitUPI(u > 0 ? u.toString() : '');
      setEditSplitBank(b > 0 ? b.toString() : '');
    } else {
      setEditSplitCash('');
      setEditSplitUPI('');
      setEditSplitBank('');
    }

    if (entry.isOpening) {
      const isRec = party.openingBalanceType
        ? party.openingBalanceType === 'TO_RECEIVE'
        : entry.debit > 0;
      setEditOpeningType(isRec ? 'RECEIVABLE' : 'PAYABLE');
    } else {
      setEditOpeningType(entry.debit > 0 ? 'RECEIVABLE' : 'PAYABLE');
    }
  };

  // Click handler for any transaction item
  const handleTransactionClick = (entry: PassbookEntry) => {
    if (entry.type === 'SALE' && entry.rawInvoice) {
      setSelectedInvoiceForView(entry.rawInvoice);
    } else if (entry.type === 'PURCHASE' && entry.rawPurchase) {
      setSelectedPurchaseBill(entry.rawPurchase);
    } else {
      handleOpenEditLedgerItem(entry);
    }
  };

  // Delete invoice from simplified invoice view
  const handleDeleteInvoiceBill = (inv: Invoice) => {
    if (!window.confirm(`Delete Invoice #${inv.invoiceNumber}? This will restore inventory stock.`)) return;

    // Restore stock
    const allItems = db.getItems();
    for (const line of inv.items) {
      if (line.itemId) {
        const itm = allItems.find((i) => i.id === line.itemId);
        if (itm) {
          itm.currentStock += line.quantity;
          db.saveItem(itm);
        }
      }
    }

    // Rollback party balance: when deleted, receivable is reduced by unpaid balance
    const unpaidBal = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : (inv.grandTotal - (inv.paidAmount || 0));
    db.saveParty({
      ...party,
      currentBalance: party.currentBalance - unpaidBal,
      updatedAt: new Date().toISOString(),
    });

    db.deleteInvoice(inv.id);
    setSelectedInvoiceForView(null);
    onRefresh?.();
  };

  // Delete purchase bill from simplified purchase view
  const handleDeletePurchaseBill = (bill: PurchaseBill) => {
    if (!window.confirm(`Delete Purchase Bill #${bill.billNumber}? This will revert any stock added by this bill.`)) return;

    // Rollback stock
    const allItems = db.getItems();
    for (const line of bill.items) {
      if (line.itemId) {
        const itm = allItems.find((i) => i.id === line.itemId);
        if (itm) {
          itm.currentStock = Math.max(0, itm.currentStock - line.quantity);
          db.saveItem(itm);
        }
      }
    }

    // Rollback party balance: when deleted, liability is reduced by the unpaid balance
    const unpaidBal = typeof bill.balanceAmount === 'number' ? bill.balanceAmount : (bill.grandTotal - (bill.paidAmount || 0));
    db.saveParty({
      ...party,
      currentBalance: party.currentBalance + unpaidBal,
      updatedAt: new Date().toISOString(),
    });

    db.deletePurchase(bill.id);
    setSelectedPurchaseBill(null);
    onRefresh?.();
  };

  // Save changes to ledger item
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

    setEditingLedgerEntry(null);
    onRefresh?.();
  };

  // Delete ledger entry (vouchers)
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
      const hasOldExplicit = typeof party.openingBalance === 'number';
      const oldRawOpening = hasOldExplicit ? party.openingBalance! : 0;
      const oldType = party.openingBalanceType || (party.type === 'CUSTOMER' ? 'TO_RECEIVE' : 'TO_PAY');
      const oldSignedOpening = oldRawOpening > 0 ? (oldType === 'TO_RECEIVE' ? oldRawOpening : -oldRawOpening) : 0;

      const updatedParty: Party = {
        ...party,
        openingBalance: undefined,
        openingBalanceType: undefined,
        openingBalanceDate: undefined,
        currentBalance: party.currentBalance - oldSignedOpening,
        updatedAt: new Date().toISOString(),
      };
      db.saveParty(updatedParty);
      db.recalculatePartyBalance(party.id);
    }

    setEditingLedgerEntry(null);
    onRefresh?.();
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col animate-fade-in pb-8">
      {/* 1. Mobile-Optimized Sticky Top Navigation */}
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-outline-variant/20 px-3 py-2 sm:px-6 sm:py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Back button & Party Identity */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 -ml-1 rounded-xl text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer flex items-center gap-1"
              title="Back to Parties"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>

            <div
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                isCustomer ? 'bg-secondary/15 text-secondary' : 'bg-primary/15 text-primary'
              }`}
            >
              {party.name.charAt(0).toUpperCase()}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface truncate">
                  {party.name}
                </h1>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full flex-shrink-0 ${
                    isCustomer ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'
                  }`}
                >
                  {isCustomer ? 'Buyer' : 'Vendor'}
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant truncate">
                <a href={`tel:${party.phone}`} className="text-secondary font-medium hover:underline">
                  {party.phone}
                </a>
              </p>
            </div>
          </div>

          {/* Quick Header Tools (Call, WhatsApp, Edit) */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <a
              href={`tel:${party.phone}`}
              className="w-8 h-8 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-secondary flex items-center justify-center transition-colors"
              title="Call"
            >
              <span className="material-symbols-outlined text-[17px]">call</span>
            </a>

            <button
              type="button"
              onClick={handleWhatsAppReminder}
              className="w-8 h-8 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] flex items-center justify-center cursor-pointer transition-colors"
              title="WhatsApp"
            >
              <span className="material-symbols-outlined text-[17px]">chat</span>
            </button>

            <button
              type="button"
              onClick={() => onEditParty(party)}
              className="w-8 h-8 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
              title="Edit Profile"
            >
              <span className="material-symbols-outlined text-[17px]">edit</span>
            </button>

            {onDeleteParty && (
              <button
                type="button"
                onClick={handleDelete}
                className="w-8 h-8 rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 flex items-center justify-center transition-colors cursor-pointer"
                title="Delete Party"
              >
                <span className="material-symbols-outlined text-[17px]">delete</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. Simplified Mobile & Tablet Content Container */}
      <main className="max-w-7xl w-full mx-auto p-2.5 sm:p-4 md:p-6 flex-1 flex flex-col gap-2.5 sm:gap-3.5">
        {/* Streamlined Passbook Balance Card */}
        <section className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/20 shadow-xs flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-wider text-outline">
                {isReceivable ? "You'll Receive" : isPayable ? "You'll Pay" : 'Net Balance'}
              </span>
              <span
                className={`font-currency-display-mobile text-xl sm:text-2xl font-black mt-0.5 ${
                  isReceivable
                    ? 'text-error'
                    : isPayable
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-secondary'
                }`}
              >
                {liveNetBalance === 0 ? '₹0 (Settled)' : formatINR(Math.abs(liveNetBalance))}
              </span>
            </div>

            <div className="flex flex-col items-end gap-1">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isReceivable
                    ? 'bg-error/10 text-error'
                    : isPayable
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-secondary/10 text-secondary'
                }`}
              >
                {isReceivable ? 'Pending Due' : isPayable ? 'To Pay' : 'All Clear'}
              </span>

              <button
                type="button"
                onClick={() => setShowPartyDetails(!showPartyDetails)}
                className="text-secondary text-[11px] font-semibold hover:underline flex items-center gap-0.5 cursor-pointer mt-1"
              >
                <span>{showPartyDetails ? 'Hide Info' : 'Party Info'}</span>
                <span className="material-symbols-outlined text-[14px]">
                  {showPartyDetails ? 'expand_less' : 'expand_more'}
                </span>
              </button>
            </div>
          </div>

          {/* Quick Sub-Metrics Bar */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/20 text-xs">
            <div className="flex items-center justify-between pr-2">
              <span className="text-on-surface-variant text-[11px]">Total Bills:</span>
              <span className="font-bold text-on-surface">{formatINR(totalBilled)}</span>
            </div>
            <div className="flex items-center justify-between pl-2 border-l border-outline-variant/20">
              <span className="text-on-surface-variant text-[11px]">Total Paid:</span>
              <span className="font-bold text-secondary">{formatINR(totalPaid)}</span>
            </div>
          </div>

          {/* Opening Balance info chip if set */}
          {((typeof party.openingBalance === 'number' && party.openingBalance > 0) || party.openingBalanceDate) && (
            <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-xl bg-surface-container-low text-on-surface-variant">
              <span className="flex items-center gap-1 font-medium">
                <span className="material-symbols-outlined text-[14px] text-secondary">account_balance_wallet</span>
                <span>Opening Balance:</span>
              </span>
              <div className="flex items-center gap-1.5 font-bold">
                <span className={party.openingBalanceType === 'TO_PAY' ? 'text-error' : 'text-secondary'}>
                  {formatINR(party.openingBalance || 0)} ({party.openingBalanceType === 'TO_PAY' ? 'To Pay' : 'To Receive'})
                </span>
                {party.openingBalanceDate && (
                  <span className="text-[10px] text-outline font-normal">
                    • {party.openingBalanceDate}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onEditParty(party)}
                  className="p-0.5 text-on-surface-variant hover:text-secondary rounded cursor-pointer ml-1"
                  title="Edit Opening Balance"
                >
                  <span className="material-symbols-outlined text-[13px]">edit</span>
                </button>
              </div>
            </div>
          )}

          {/* Collapsible Info Drawer */}
          {showPartyDetails && (
            <div className="pt-2.5 border-t border-outline-variant/20 text-xs text-on-surface space-y-1.5 animate-in fade-in">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {company.isGstEnabled !== false && (
                  <div>
                    <span className="text-outline block">GSTIN</span>
                    <span className="font-mono font-bold text-on-surface truncate block">
                      {party.gstin || 'Unregistered'}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-outline block">PAN</span>
                  <span className="font-mono font-bold text-on-surface truncate block">
                    {party.pan || 'N/A'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-outline block">Billing Address</span>
                  <span className="font-medium text-on-surface truncate block">
                    {party.billingAddress || 'Local Counter'}
                  </span>
                </div>
                <div className="col-span-2 pt-1 border-t border-outline-variant/15 flex items-center justify-between">
                  <span className="text-outline">Opening Balance</span>
                  <div className="flex items-center gap-1.5">
                    {party.openingBalance ? (
                      <span className="font-bold">
                        {formatINR(party.openingBalance)} ({party.openingBalanceType === 'TO_PAY' ? 'To Pay' : 'To Receive'})
                      </span>
                    ) : (
                      <span className="text-outline italic">Not set</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onEditParty(party)}
                      className="text-secondary font-semibold hover:underline cursor-pointer text-[10px] flex items-center gap-0.5"
                    >
                      <span className="material-symbols-outlined text-[12px]">edit</span>
                      <span>{party.openingBalance ? 'Edit' : 'Set'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {party.creditLimit && party.creditLimit > 0 && (
                <div className="pt-1">
                  <div className="flex justify-between text-[10px] text-on-surface-variant font-semibold mb-0.5">
                    <span>Credit Line: {formatINR(Math.abs(liveNetBalance))} / {formatINR(party.creditLimit)}</span>
                    <span className={liveNetBalance > party.creditLimit ? 'text-error font-bold' : ''}>
                      {Math.round((Math.max(0, liveNetBalance) / party.creditLimit) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        liveNetBalance > party.creditLimit ? 'bg-error' : 'bg-secondary'
                      }`}
                      style={{
                        width: `${Math.min(100, (Math.max(0, liveNetBalance) / party.creditLimit) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Quick Actions Bar */}
        <section className="flex items-center gap-2">
          {/* Record Payment */}
          <button
            type="button"
            onClick={() => setIsPaymentOpen(!isPaymentOpen)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs ${
              isPaymentOpen
                ? 'bg-secondary text-on-secondary'
                : 'bg-secondary/10 text-secondary border border-secondary/25 hover:bg-secondary/20'
            }`}
          >
            <span className="material-symbols-outlined text-[17px]">
              {isPaymentOpen ? 'close' : 'payments'}
            </span>
            <span>{isPaymentOpen ? 'Close Payment' : 'Record Payment'}</span>
          </button>

          {/* Single Action: New Invoice for Customer, New Bill for Supplier */}
          {isCustomer ? (
            onCreateInvoice && (
              <button
                type="button"
                onClick={() => onCreateInvoice(party)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs hover:opacity-90"
                title="Create new sales invoice for this customer"
              >
                <span className="material-symbols-outlined text-[17px]">receipt_long</span>
                <span>New Invoice</span>
              </button>
            )
          ) : (
            onCreatePurchase ? (
              <button
                type="button"
                onClick={() => onCreatePurchase(party)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs hover:opacity-90"
                title="Create new purchase bill from this supplier"
              >
                <span className="material-symbols-outlined text-[17px]">shopping_bag</span>
                <span>New Bill</span>
              </button>
            ) : onCreateInvoice && (
              <button
                type="button"
                onClick={() => onCreateInvoice(party)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs hover:opacity-90"
                title="Create new sales invoice"
              >
                <span className="material-symbols-outlined text-[17px]">receipt_long</span>
                <span>New Invoice</span>
              </button>
            )
          )}

          {/* Print Statement */}
          <button
            type="button"
            onClick={handlePrintStatement}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer flex-shrink-0"
            title="Print Ledger Statement"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
          </button>
        </section>

        {/* Collapsible Record Payment Drawer */}
        {isPaymentOpen && (
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
                <span>{paymentType === 'IN' ? 'Record Payment In' : 'Record Payment Out'}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsPaymentOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-0.5 cursor-pointer"
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

            {/* Quick Chips */}
            {liveNetBalance !== 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPaymentAmount(Math.abs(liveNetBalance).toString())}
                  className="px-2 py-0.5 rounded-lg bg-secondary/15 text-secondary text-[11px] font-bold cursor-pointer hover:bg-secondary/25"
                >
                  Full Due ({formatINR(Math.abs(liveNetBalance))})
                </button>
                {Math.abs(liveNetBalance) > 100 && (
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(Math.round(Math.abs(liveNetBalance) / 2).toString())}
                    className="px-2 py-0.5 rounded-lg bg-surface text-on-surface text-[11px] font-medium cursor-pointer"
                  >
                    50%
                  </button>
                )}
              </div>
            )}

            {/* Amount & Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative flex items-center">
                <span className="absolute left-2.5 text-xs font-bold text-on-surface-variant">₹</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full pl-6 pr-2 py-1.5 bg-surface rounded-xl text-xs font-bold text-on-surface border border-outline-variant/30 focus:border-secondary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-4 gap-1">
                {['UPI', 'CASH', 'BANK', 'SPLIT'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setPaymentMode(m);
                      if (m === 'SPLIT') {
                        const total = parseFloat(paymentAmount) || 0;
                        if (total > 0 && !splitCash && !splitUPI && !splitBank) {
                          if (paymentMode === 'CASH') setSplitCash(total.toString());
                          else if (paymentMode === 'BANK') setSplitBank(total.toString());
                          else setSplitUPI(total.toString());
                        }
                      }
                    }}
                    className={`py-1.5 rounded-xl text-[10px] font-bold cursor-pointer transition-all ${
                      paymentMode === m
                        ? paymentType === 'IN'
                          ? 'bg-secondary text-on-secondary shadow-xs'
                          : 'bg-amber-600 text-white shadow-xs'
                        : 'bg-surface text-on-surface-variant'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Split Tender Allocation Box when SPLIT is selected */}
            {paymentMode === 'SPLIT' && (() => {
              const target = parseFloat(paymentAmount) || 0;
              const c = parseFloat(splitCash) || 0;
              const u = parseFloat(splitUPI) || 0;
              const b = parseFloat(splitBank) || 0;
              const allocated = Number((c + u + b).toFixed(2));
              const remaining = target > 0 ? Number(Math.max(0, target - allocated).toFixed(2)) : 0;

              return (
                <div className="p-2.5 bg-surface rounded-xl border border-secondary/20 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-on-surface flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px] text-secondary">call_split</span>
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Cash */}
                    <div className="flex flex-col gap-1 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-on-surface flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[12px] text-emerald-600">payments</span>
                          Cash
                        </span>
                        {remaining > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = (c + remaining).toFixed(2);
                              setSplitCash(parseFloat(next).toString());
                            }}
                            className="text-[9px] font-bold text-secondary hover:underline cursor-pointer"
                          >
                            + Fill
                          </button>
                        )}
                      </div>
                      <div className="relative flex items-center">
                        <span className="absolute left-1.5 text-[10px] text-on-surface-variant font-bold">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={splitCash}
                          onChange={(e) => setSplitCash(e.target.value)}
                          className="w-full pl-4 pr-1 py-1 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                        />
                      </div>
                    </div>

                    {/* UPI */}
                    <div className="flex flex-col gap-1 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-on-surface flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[12px] text-blue-600">qr_code_2</span>
                          UPI
                        </span>
                        {remaining > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = (u + remaining).toFixed(2);
                              setSplitUPI(parseFloat(next).toString());
                            }}
                            className="text-[9px] font-bold text-secondary hover:underline cursor-pointer"
                          >
                            + Fill
                          </button>
                        )}
                      </div>
                      <div className="relative flex items-center">
                        <span className="absolute left-1.5 text-[10px] text-on-surface-variant font-bold">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={splitUPI}
                          onChange={(e) => setSplitUPI(e.target.value)}
                          className="w-full pl-4 pr-1 py-1 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                        />
                      </div>
                    </div>

                    {/* Bank */}
                    <div className="flex flex-col gap-1 p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-on-surface flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[12px] text-purple-600">account_balance</span>
                          Bank / Cheque
                        </span>
                        {remaining > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = (b + remaining).toFixed(2);
                              setSplitBank(parseFloat(next).toString());
                            }}
                            className="text-[9px] font-bold text-secondary hover:underline cursor-pointer"
                          >
                            + Fill
                          </button>
                        )}
                      </div>
                      <div className="relative flex items-center">
                        <span className="absolute left-1.5 text-[10px] text-on-surface-variant font-bold">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={splitBank}
                          onChange={(e) => setSplitBank(e.target.value)}
                          className="w-full pl-4 pr-1 py-1 bg-surface rounded-lg text-xs font-bold text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

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
                className={`px-4 py-1.5 text-white text-xs font-bold rounded-xl shadow-xs active:scale-95 cursor-pointer whitespace-nowrap ${
                  paymentType === 'IN' ? 'bg-secondary' : 'bg-amber-600'
                }`}
              >
                Save {paymentType === 'IN' ? 'In' : 'Out'}
              </button>
            </div>
          </form>
        )}

        {/* 3. Passbook Ledger Section (Mobile First) */}
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-3 sm:p-4 shadow-xs flex flex-col gap-2.5">
          {/* Header & Filter Controls */}
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-on-surface">Transactions</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-container font-bold text-on-surface-variant">
                {filteredPassbook.length}
              </span>
            </div>

            {/* Segmented Filter Pills & Sort Toggle */}
            <div className="flex items-center gap-1.5">
              <div className="inline-flex rounded-lg bg-surface-container p-0.5 text-[11px] font-semibold">
                {(['ALL', 'BILLS', 'PAYMENTS'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setTxnFilter(tab)}
                    className={`px-2 py-0.5 rounded-md transition-all cursor-pointer capitalize ${
                      txnFilter === tab
                        ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {tab === 'ALL' ? 'All' : tab.toLowerCase()}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setTxnSortOrder(txnSortOrder === 'NEWEST' ? 'OLDEST' : 'NEWEST')}
                className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-bold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors"
                title={txnSortOrder === 'NEWEST' ? 'Sorted: Newest First (Click for Oldest)' : 'Sorted: Oldest First (Click for Newest)'}
              >
                <span className="material-symbols-outlined text-[13px] text-primary">
                  {txnSortOrder === 'NEWEST' ? 'south' : 'north'}
                </span>
                <span>{txnSortOrder === 'NEWEST' ? 'Newest' : 'Oldest'}</span>
              </button>
            </div>
          </div>

          {/* Search bar inside ledger */}
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-2.5 text-on-surface-variant text-[15px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search by invoice #, note, amount..."
              value={searchTxn}
              onChange={(e) => setSearchTxn(e.target.value)}
              className="w-full bg-surface-container-low pl-8 pr-7 py-1 rounded-xl text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none border border-outline-variant/20"
            />
            {searchTxn && (
              <button
                type="button"
                onClick={() => setSearchTxn('')}
                className="absolute right-2 text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            )}
          </div>

          {/* Passbook Item Cards Feed */}
          <div className="space-y-1.5">
            {filteredPassbook.length === 0 ? (
              <div className="py-8 text-center text-on-surface-variant flex flex-col items-center gap-1">
                <span className="material-symbols-outlined text-[24px] text-outline">receipt_long</span>
                <p className="text-xs">No transactions in this filter</p>
              </div>
            ) : (
              filteredPassbook.map((entry) => {
                const isCredit = entry.credit > 0;
                const isDebit = entry.debit > 0;

                return (
                  <div
                    key={entry.id}
                    onClick={() => handleTransactionClick(entry)}
                    className="p-2.5 rounded-xl bg-surface-container-low/60 hover:bg-surface-container-low active:scale-[0.99] transition-all flex items-center justify-between gap-2 cursor-pointer"
                  >
                    {/* Left Icon and Details */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          entry.type === 'PAYMENT_IN'
                            ? 'bg-secondary/15 text-secondary'
                            : entry.type === 'PAYMENT_OUT'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : entry.type === 'SALE'
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                            : entry.type === 'PURCHASE'
                            ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
                            : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          {entry.type === 'PAYMENT_IN'
                            ? 'arrow_downward'
                            : entry.type === 'PAYMENT_OUT'
                            ? 'arrow_upward'
                            : entry.type === 'SALE'
                            ? 'point_of_sale'
                            : entry.type === 'PURCHASE'
                            ? 'shopping_bag'
                            : 'account_balance'}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-on-surface truncate text-xs">
                            {entry.type === 'SALE'
                              ? `Sale #${entry.docNumber}`
                              : entry.type === 'PURCHASE'
                              ? `Bill #${entry.docNumber}`
                              : entry.type === 'PAYMENT_IN'
                              ? `Payment In (${entry.paymentMode || 'UPI'})`
                              : entry.type === 'PAYMENT_OUT'
                              ? `Payment Out (${entry.paymentMode || 'Cash'})`
                              : 'Opening Balance'}
                          </span>
                          {entry.status && entry.status !== 'OPENING' && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                                entry.status === 'PAID'
                                  ? 'bg-secondary/10 text-secondary'
                                  : entry.status === 'PARTIAL'
                                  ? 'bg-amber-500/10 text-amber-600'
                                  : 'bg-error/10 text-error'
                              }`}
                            >
                              {entry.status}
                            </span>
                          )}
                        </div>

                        <p className="text-[10px] text-on-surface-variant truncate">
                          {entry.type === 'SALE' && entry.rawInvoice ? (
                            <>
                              {entry.date} • {entry.rawInvoice.paymentStatus === 'PAID'
                                ? `Fully Paid (${entry.rawInvoice.paymentMode || 'Cash'})`
                                : entry.rawInvoice.paidAmount > 0
                                ? `Paid: ${formatINR(entry.rawInvoice.paidAmount)} • Due: ${formatINR(entry.rawInvoice.balanceAmount)}`
                                : `Unpaid: ${formatINR(entry.rawInvoice.balanceAmount)}`}
                            </>
                          ) : entry.type === 'PURCHASE' && entry.rawPurchase ? (
                            <>
                              {entry.date} • {entry.rawPurchase.paymentStatus === 'PAID'
                                ? `Fully Paid (${entry.rawPurchase.paymentMode || 'Cash'})`
                                : entry.rawPurchase.paidAmount > 0
                                ? `Paid: ${formatINR(entry.rawPurchase.paidAmount)} • Due: ${formatINR(entry.rawPurchase.balanceAmount)}`
                                : `Unpaid: ${formatINR(entry.rawPurchase.balanceAmount)}`}
                            </>
                          ) : (
                            <>{entry.date} {entry.description ? `• ${entry.description}` : ''}</>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Right Amount & Chevron */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 text-right">
                      <div>
                        <span
                          className={`font-currency-display-mobile text-xs font-black block ${
                            entry.type === 'PURCHASE'
                              ? 'text-orange-600 dark:text-orange-400'
                              : entry.type === 'SALE'
                              ? 'text-blue-600 dark:text-blue-400'
                              : isCredit
                              ? 'text-secondary'
                              : isDebit
                              ? 'text-error'
                              : 'text-on-surface'
                          }`}
                        >
                          {entry.type === 'PURCHASE'
                            ? `- ${formatINR(entry.billAmount || entry.credit)}`
                            : entry.type === 'SALE'
                            ? `+ ${formatINR(entry.billAmount || entry.debit)}`
                            : isCredit
                            ? `+ ${formatINR(entry.credit)}`
                            : isDebit
                            ? `- ${formatINR(entry.debit)}`
                            : '₹0'}
                        </span>
                        <span className="text-[9px] font-mono text-outline block">
                          Bal: {formatINR(Math.abs(entry.runningBalance))}
                        </span>
                      </div>

                      <span className="material-symbols-outlined text-[16px] text-outline ml-0.5">
                        chevron_right
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* 4. Edit Ledger Item Modal */}
      {editingLedgerEntry && (
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
                onClick={() => setEditingLedgerEntry(null)}
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
                          setEditingLedgerEntry(null);
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
                          setEditingLedgerEntry(null);
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
                    <button
                      type="button"
                      onClick={() => {
                        const bill = editingLedgerEntry.rawPurchase!;
                        setEditingLedgerEntry(null);
                        setSelectedPurchaseBill(bill);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-orange-600 text-white font-bold text-[11px] shadow-xs cursor-pointer flex items-center gap-1 active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[14px]">visibility</span>
                      <span>View</span>
                    </button>
                    {onEditPurchase && (
                      <button
                        type="button"
                        onClick={() => {
                          const bill = editingLedgerEntry.rawPurchase!;
                          setEditingLedgerEntry(null);
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
                    onClick={() => setEditingLedgerEntry(null)}
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
      )}

      {/* 5. Simplified Purchase View Modal */}
      {selectedPurchaseBill && (
        <SimplifiedPurchaseModal
          bill={selectedPurchaseBill}
          company={company}
          onClose={() => setSelectedPurchaseBill(null)}
          onEditPurchase={(bill) => {
            setSelectedPurchaseBill(null);
            if (onEditPurchase) onEditPurchase(bill);
          }}
          onDeletePurchase={() => handleDeletePurchaseBill(selectedPurchaseBill)}
        />
      )}

      {/* 6. Simplified Invoice View Modal */}
      {selectedInvoiceForView && (
        <SimplifiedInvoiceModal
          invoice={selectedInvoiceForView}
          company={company}
          onClose={() => setSelectedInvoiceForView(null)}
          onEditInvoice={(inv) => {
            setSelectedInvoiceForView(null);
            if (onEditInvoice) onEditInvoice(inv);
          }}
          onDeleteInvoice={() => handleDeleteInvoiceBill(selectedInvoiceForView)}
          onOpenFullA4Preview={(inv) => {
            setSelectedInvoiceForView(null);
            if (onViewInvoice) onViewInvoice(inv);
          }}
        />
      )}
    </div>
  );
};
