import React, { useState, useMemo } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice, PaymentMode } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { printPartyLedgerStatement } from '../../core/utils/ledgerStatementPrinter.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { db } from '../../services/db.ts';

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
    paymentType?: 'IN' | 'OUT'
  ) => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onEditInvoice?: (invoice: Invoice) => void;
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
  onCreateInvoice,
  onCreatePurchase,
  onRefresh,
}) => {
  const [txnFilter, setTxnFilter] = useState<'ALL' | 'BILLS' | 'PAYMENTS'>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'THIS_MONTH' | 'LAST_30_DAYS'>('ALL');
  const [searchTxn, setSearchTxn] = useState('');
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [showPartyDetails, setShowPartyDetails] = useState(false);

  // Edit Ledger Item Modal state
  const [editingLedgerEntry, setEditingLedgerEntry] = useState<PassbookEntry | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editMode, setEditMode] = useState('UPI');
  const [editNotes, setEditNotes] = useState('');
  const [editType, setEditType] = useState<'IN' | 'OUT'>('IN');
  const [editOpeningType, setEditOpeningType] = useState<'RECEIVABLE' | 'PAYABLE'>('RECEIVABLE');

  // Simplified Purchase View Modal state
  const [selectedPurchaseBill, setSelectedPurchaseBill] = useState<PurchaseBill | null>(null);

  // Simplified Invoice View Modal state
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<Invoice | null>(null);

  const isCustomer = party.type === 'CUSTOMER';
  const isReceivable = party.currentBalance > 0;
  const isPayable = party.currentBalance < 0;

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
  }, true);

  // Payment Form State
  const [paymentType, setPaymentType] = useState<'IN' | 'OUT'>(isCustomer ? 'IN' : 'OUT');
  const [paymentAmount, setPaymentAmount] = useState<string>(
    party.currentBalance !== 0 ? Math.abs(party.currentBalance).toString() : ''
  );
  const [paymentMode, setPaymentMode] = useState<string>('UPI');
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

    // Sales Invoices
    partyInvoices.forEach((inv) => {
      const balance = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : Math.max(0, inv.grandTotal - (inv.paidAmount || 0));
      rawEntries.push({
        id: `sale-${inv.id}`,
        rawId: inv.id,
        date: inv.date,
        docNumber: inv.invoiceNumber,
        type: 'SALE',
        description: inv.items && inv.items.length > 0
          ? `${inv.items.length} items (${inv.items.map((i) => i.name).slice(0, 2).join(', ')})`
          : `Sale #${inv.invoiceNumber}`,
        debit: balance,
        credit: 0,
        billAmount: inv.grandTotal,
        status: inv.paymentStatus,
        paymentMode: inv.paymentMode,
        rawInvoice: inv,
      });
      // NOTE: Payment in is handled within the sales invoice; no extra pay-inv transaction is generated.
    });

    // Purchase Bills
    partyPurchases.forEach((pur) => {
      const balance = typeof pur.balanceAmount === 'number' ? pur.balanceAmount : Math.max(0, pur.grandTotal - (pur.paidAmount || 0));
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
        credit: balance,
        billAmount: pur.grandTotal,
        status: pur.paymentStatus,
        paymentMode: pur.paymentMode,
        rawPurchase: pur,
      });
      // NOTE: Payment out is handled within the purchase bill; no extra pay-pur transaction is generated.
    });

    // Accounting Vouchers (Receipts / Payments)
    vouchers.forEach((v) => {
      const isPartyVoucher = v.entries.some(
        (e) => e.accountId === party.id || e.accountName.toLowerCase() === party.name.toLowerCase()
      );

      if (isPartyVoucher) {
        const isDupe = rawEntries.some(
          (e) => e.docNumber === v.voucherNumber || (v.referenceNo && e.docNumber.includes(v.referenceNo))
        );
        if (!isDupe) {
          if (v.voucherType === 'RECEIPT') {
            rawEntries.push({
              id: `vchr-${v.id}`,
              rawId: v.id,
              date: v.date,
              docNumber: v.voucherNumber,
              type: 'PAYMENT_IN',
              description: v.narration || 'Payment received',
              debit: 0,
              credit: v.totalAmount,
              status: 'PAID',
              rawVoucher: v,
            });
          } else if (v.voucherType === 'PAYMENT') {
            rawEntries.push({
              id: `vchr-${v.id}`,
              rawId: v.id,
              date: v.date,
              docNumber: v.voucherNumber,
              type: 'PAYMENT_OUT',
              description: v.narration || 'Payment made',
              debit: v.totalAmount,
              credit: 0,
              status: 'PAID',
              rawVoucher: v,
            });
          }
        }
      }
    });

    // Opening Balance
    const totalDebits = rawEntries.reduce((s, e) => s + e.debit, 0);
    const totalCredits = rawEntries.reduce((s, e) => s + e.credit, 0);
    const calculatedNet = isCustomer ? totalDebits - totalCredits : totalCredits - totalDebits;
    const openingDifference = party.currentBalance - calculatedNet;

    if (Math.abs(openingDifference) >= 1) {
      const openingDate = party.createdAt ? party.createdAt.split('T')[0] : '2026-01-01';
      rawEntries.push({
        id: `opening-${party.id}`,
        rawId: party.id,
        date: openingDate,
        docNumber: 'OPENING',
        type: 'OPENING',
        description: 'Opening Balance',
        debit: openingDifference > 0 ? openingDifference : 0,
        credit: openingDifference < 0 ? Math.abs(openingDifference) : 0,
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
      return { ...entry, runningBalance: running };
    });
  }, [party, partyInvoices, partyPurchases, vouchers, isCustomer]);

  // Filtered passbook list
  const filteredPassbook = useMemo(() => {
    const now = new Date();
    const currentMonthPrefix = now.toISOString().slice(0, 7);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return passbook.filter((entry) => {
      if (txnFilter === 'BILLS' && entry.type !== 'SALE' && entry.type !== 'PURCHASE') return false;
      if (txnFilter === 'PAYMENTS' && entry.type !== 'PAYMENT_IN' && entry.type !== 'PAYMENT_OUT') return false;

      if (dateFilter === 'THIS_MONTH') {
        if (!entry.date.startsWith(currentMonthPrefix)) return false;
      } else if (dateFilter === 'LAST_30_DAYS') {
        if (new Date(entry.date) < thirtyDaysAgo) return false;
      }

      if (searchTxn.trim()) {
        const q = searchTxn.toLowerCase();
        const matches =
          entry.docNumber.toLowerCase().includes(q) ||
          entry.description.toLowerCase().includes(q) ||
          (entry.paymentMode && entry.paymentMode.toLowerCase().includes(q)) ||
          entry.debit.toString().includes(q) ||
          entry.credit.toString().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [passbook, txnFilter, dateFilter, searchTxn]);

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
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) return;

    const fullNotes = [paymentRef ? `Ref: ${paymentRef}` : '', paymentNotes].filter(Boolean).join(' • ');
    onRecordPayment(
      party,
      amt,
      paymentMode,
      fullNotes || `${paymentType === 'IN' ? 'Payment In' : 'Payment Out'} of ${formatINR(amt)} on ${paymentDate}`,
      paymentType
    );
    setIsPaymentOpen(false);
    onRefresh?.();
  };

  const handleWhatsAppReminder = () => {
    const bizName = company.tradeName || company.businessName || 'Vyapar Books';
    const upiLink = company.upiId
      ? `upi://pay?pa=${encodeURIComponent(company.upiId)}&pn=${encodeURIComponent(bizName)}&am=${Math.abs(
          party.currentBalance
        )}&cu=INR`
      : '';

    const text =
      `*LEDGER STATEMENT - ${bizName}*\n` +
      `Party: *${party.name}*\n` +
      `Date: ${new Date().toLocaleDateString('en-IN')}\n\n` +
      `Total Bills: ${formatINR(totalBilled)}\n` +
      `Total Paid: ${formatINR(totalPaid)}\n` +
      `*Net Balance Due: ${formatINR(Math.abs(party.currentBalance))} ${
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
    setEditAmount((entry.credit > 0 ? entry.credit : entry.debit).toString());
    setEditMode(entry.paymentMode || 'UPI');
    setEditNotes(entry.description || '');
    setEditType(entry.type === 'PAYMENT_IN' ? 'IN' : 'OUT');
    setEditOpeningType(entry.debit > 0 ? 'RECEIVABLE' : 'PAYABLE');
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

    const newAmt = parseFloat(editAmount);
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

      const updatedVoucher: Voucher = {
        ...v,
        date: editDate,
        voucherType: newVoucherType,
        totalAmount: newAmt,
        narration: editNotes || v.narration,
        entries: v.entries.map((entry) => {
          if (entry.accountId === 'ACC_CASH' || entry.accountId === 'ACC_BANK') {
            return {
              ...entry,
              accountId: editMode === 'CASH' ? 'ACC_CASH' : 'ACC_BANK',
              accountName: editMode === 'CASH' ? 'Cash-in-hand' : 'Bank Account',
              debit: isReceipt ? newAmt : 0,
              credit: isReceipt ? 0 : newAmt,
            };
          }
          return {
            ...entry,
            debit: isReceipt ? 0 : newAmt,
            credit: isReceipt ? newAmt : 0,
            narration: editNotes || entry.narration,
          };
        }),
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
      const safePaymentMode: PaymentMode = editMode === 'BANK' ? 'NET_BANKING' : (editMode as PaymentMode);

      const updatedInv: Invoice = {
        ...inv,
        paidAmount: newPaid,
        balanceAmount: newBalInv,
        paymentStatus: newBalInv <= 0.01 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID',
        paymentMode: safePaymentMode,
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
      const safePaymentMode: PaymentMode = editMode === 'BANK' ? 'NET_BANKING' : (editMode as PaymentMode);

      const updatedPur: PurchaseBill = {
        ...pur,
        paidAmount: newPaid,
        balanceAmount: newBalPur,
        paymentStatus: newBalPur <= 0.01 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID',
        paymentMode: safePaymentMode,
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
      const finalBal = editOpeningType === 'RECEIVABLE' ? newAmt : -newAmt;
      db.saveParty({
        ...party,
        currentBalance: finalBal,
        updatedAt: new Date().toISOString(),
      });
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
    }

    setEditingLedgerEntry(null);
    onRefresh?.();
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col animate-fade-in pb-8">
      {/* 1. Mobile-Optimized Sticky Top Navigation */}
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-outline-variant/20 px-3 py-2 sm:px-6 sm:py-3 shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
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

      {/* 2. Simplified Mobile Content Container */}
      <main className="max-w-4xl w-full mx-auto p-2.5 sm:p-4 flex-1 flex flex-col gap-2.5 sm:gap-3.5">
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
                {party.currentBalance === 0 ? '₹0 (Settled)' : formatINR(Math.abs(party.currentBalance))}
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

          {/* Collapsible Info Drawer */}
          {showPartyDetails && (
            <div className="pt-2.5 border-t border-outline-variant/20 text-xs text-on-surface space-y-1.5 animate-in fade-in">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-outline block">GSTIN</span>
                  <span className="font-mono font-bold text-on-surface truncate block">
                    {party.gstin || 'Unregistered'}
                  </span>
                </div>
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
              </div>

              {party.creditLimit && party.creditLimit > 0 && (
                <div className="pt-1">
                  <div className="flex justify-between text-[10px] text-on-surface-variant font-semibold mb-0.5">
                    <span>Credit Line: {formatINR(Math.abs(party.currentBalance))} / {formatINR(party.creditLimit)}</span>
                    <span className={party.currentBalance > party.creditLimit ? 'text-error font-bold' : ''}>
                      {Math.round((Math.max(0, party.currentBalance) / party.creditLimit) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        party.currentBalance > party.creditLimit ? 'bg-error' : 'bg-secondary'
                      }`}
                      style={{
                        width: `${Math.min(100, (Math.max(0, party.currentBalance) / party.creditLimit) * 100)}%`,
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
            {party.currentBalance !== 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPaymentAmount(Math.abs(party.currentBalance).toString())}
                  className="px-2 py-0.5 rounded-lg bg-secondary/15 text-secondary text-[11px] font-bold cursor-pointer hover:bg-secondary/25"
                >
                  Full Due ({formatINR(Math.abs(party.currentBalance))})
                </button>
                {Math.abs(party.currentBalance) > 100 && (
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(Math.round(Math.abs(party.currentBalance) / 2).toString())}
                    className="px-2 py-0.5 rounded-lg bg-surface text-on-surface text-[11px] font-medium cursor-pointer"
                  >
                    50%
                  </button>
                )}
              </div>
            )}

            {/* Amount & Mode */}
            <div className="grid grid-cols-2 gap-2">
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

              <div className="grid grid-cols-3 gap-1">
                {['UPI', 'CASH', 'BANK'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMode(m)}
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

            {/* Segmented Filter Pills */}
            <div className="flex items-center gap-1">
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
                <div className="grid grid-cols-4 gap-1">
                  {['UPI', 'CASH', 'BANK', 'CHEQUE'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEditMode(m)}
                      className={`py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                        editMode === m
                          ? 'bg-secondary text-on-secondary shadow-xs'
                          : 'bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
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

              {/* Actions */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/20">
                {(editingLedgerEntry.rawVoucher || editingLedgerEntry.id.startsWith('pay-inv-') || editingLedgerEntry.id.startsWith('pay-pur-')) ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteLedgerItem(editingLedgerEntry)}
                    className="px-2.5 py-1.5 rounded-xl bg-error/10 hover:bg-error/20 text-error font-bold text-xs cursor-pointer flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">delete</span>
                    <span>Delete</span>
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-2xl p-3.5 sm:p-4 w-full max-w-md shadow-2xl border border-outline-variant/30 flex flex-col gap-2.5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-sm text-on-surface truncate">
                      Bill #{selectedPurchaseBill.billNumber}
                    </h3>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                        selectedPurchaseBill.paymentStatus === 'PAID'
                          ? 'bg-secondary/10 text-secondary'
                          : selectedPurchaseBill.paymentStatus === 'PARTIAL'
                          ? 'bg-amber-500/10 text-amber-600'
                          : 'bg-error/10 text-error'
                      }`}
                    >
                      {selectedPurchaseBill.paymentStatus}
                    </span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant truncate block">
                    {selectedPurchaseBill.supplierName} • {selectedPurchaseBill.date}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPurchaseBill(null)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Compact Supplier Details */}
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant bg-surface-container-low/70 py-1.5 px-2.5 rounded-xl">
              <span>GSTIN: <strong className="font-mono text-on-surface">{selectedPurchaseBill.supplierGstin || 'Unregistered'}</strong></span>
              <span>ITC: <strong className="text-on-surface">{selectedPurchaseBill.itcEligibility === 'INELIGIBLE_17_5' ? 'Blocked' : 'Eligible'}</strong></span>
            </div>

            {/* Purchased Items Table View */}
            <div className="rounded-xl border border-outline-variant/30 overflow-hidden bg-surface-container-lowest">
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="sticky top-0 bg-surface-container-low text-on-surface-variant font-bold border-b border-outline-variant/20 z-10">
                    <tr>
                      <th className="py-1.5 px-2.5 font-semibold">Item</th>
                      <th className="py-1.5 px-1.5 text-center font-semibold">Qty</th>
                      <th className="py-1.5 px-1.5 text-right font-semibold">Rate</th>
                      <th className="py-1.5 px-1.5 text-center font-semibold">Tax</th>
                      <th className="py-1.5 px-2.5 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/15 text-on-surface">
                    {selectedPurchaseBill.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-surface-container-low/40">
                        <td className="py-1.5 px-2.5 font-medium max-w-[140px]">
                          <div className="truncate font-bold text-on-surface">{item.name}</div>
                          {item.hsnSacCode && <span className="text-[9px] text-outline block font-mono">HSN: {item.hsnSacCode}</span>}
                        </td>
                        <td className="py-1.5 px-1.5 text-center font-mono">
                          {item.quantity} <span className="text-[9px] text-on-surface-variant">{item.unit || 'PCS'}</span>
                        </td>
                        <td className="py-1.5 px-1.5 text-right font-mono">{formatINR(item.unitPrice)}</td>
                        <td className="py-1.5 px-1.5 text-center">
                          <span className="text-[9px] px-1 py-0.2 rounded bg-surface-container font-mono">{item.gstRate || 0}%</span>
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-bold">{formatINR(item.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="p-2 rounded-xl bg-surface-container-low space-y-1 text-xs">
              <div className="flex justify-between text-on-surface-variant text-[11px]">
                <span>Taxable Amount</span>
                <span className="font-bold text-on-surface">{formatINR(selectedPurchaseBill.totalTaxableAmount)}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant text-[11px]">
                <span>Total Tax (GST)</span>
                <span className="font-bold text-orange-600 dark:text-orange-400">
                  {formatINR(selectedPurchaseBill.totalTax)}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-outline-variant/20 font-bold text-sm text-on-surface">
                <span>Total Bill Value</span>
                <span className="font-black text-on-surface font-currency-display-mobile">
                  {formatINR(selectedPurchaseBill.grandTotal)}
                </span>
              </div>
            </div>

            {/* Compact Payment Status Bar */}
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-surface-container text-xs">
              <span className="text-[11px] text-on-surface-variant font-medium">Payment ({selectedPurchaseBill.paymentMode || 'Cash'}):</span>
              <span className="text-[11px] font-bold">
                {selectedPurchaseBill.balanceAmount <= 0.01 ? (
                  <span className="text-secondary flex items-center gap-1 font-bold">
                    <span className="material-symbols-outlined text-[15px]">check_circle</span>
                    Fully Settled
                  </span>
                ) : (
                  <span className="text-on-surface">
                    Paid: <span className="text-secondary">{formatINR(selectedPurchaseBill.paidAmount)}</span> • Due: <span className="text-error">{formatINR(selectedPurchaseBill.balanceAmount)}</span>
                  </span>
                )}
              </span>
            </div>

            {/* Bottom Actions Bar */}
            <div className="flex items-center justify-between pt-1 border-t border-outline-variant/20 gap-2">
              <button
                type="button"
                onClick={() => handleDeletePurchaseBill(selectedPurchaseBill)}
                className="px-3 py-1.5 rounded-xl text-error hover:bg-error/10 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors active:scale-95"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>Delete Bill</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPurchaseBill(null)}
                className="px-4 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-xs cursor-pointer active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Simplified Invoice View Modal */}
      {selectedInvoiceForView && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-2xl p-3.5 sm:p-4 w-full max-w-md shadow-2xl border border-outline-variant/30 flex flex-col gap-2.5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-sm text-on-surface truncate">
                      Invoice #{selectedInvoiceForView.invoiceNumber}
                    </h3>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                        selectedInvoiceForView.paymentStatus === 'PAID'
                          ? 'bg-secondary/10 text-secondary'
                          : selectedInvoiceForView.paymentStatus === 'PARTIAL'
                          ? 'bg-amber-500/10 text-amber-600'
                          : 'bg-error/10 text-error'
                      }`}
                    >
                      {selectedInvoiceForView.paymentStatus}
                    </span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant truncate block">
                    {selectedInvoiceForView.partyName} • {selectedInvoiceForView.date}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedInvoiceForView(null)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Compact Customer Details */}
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant bg-surface-container-low/70 py-1.5 px-2.5 rounded-xl">
              <span>GSTIN: <strong className="font-mono text-on-surface">{selectedInvoiceForView.partyGstin || 'Unregistered'}</strong></span>
              <span>POS: <strong className="text-on-surface">State {selectedInvoiceForView.placeOfSupplyStateCode || company.stateCode}</strong></span>
            </div>

            {/* Purchased Items Table View */}
            <div className="rounded-xl border border-outline-variant/30 overflow-hidden bg-surface-container-lowest">
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="sticky top-0 bg-surface-container-low text-on-surface-variant font-bold border-b border-outline-variant/20 z-10">
                    <tr>
                      <th className="py-1.5 px-2.5 font-semibold">Item</th>
                      <th className="py-1.5 px-1.5 text-center font-semibold">Qty</th>
                      <th className="py-1.5 px-1.5 text-right font-semibold">Rate</th>
                      <th className="py-1.5 px-1.5 text-center font-semibold">Tax</th>
                      <th className="py-1.5 px-2.5 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/15 text-on-surface">
                    {selectedInvoiceForView.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-surface-container-low/40">
                        <td className="py-1.5 px-2.5 font-medium max-w-[140px]">
                          <div className="truncate font-bold text-on-surface">{item.name}</div>
                          {item.hsnSacCode && <span className="text-[9px] text-outline block font-mono">HSN: {item.hsnSacCode}</span>}
                        </td>
                        <td className="py-1.5 px-1.5 text-center font-mono">
                          {item.quantity} <span className="text-[9px] text-on-surface-variant">{item.unit || 'PCS'}</span>
                        </td>
                        <td className="py-1.5 px-1.5 text-right font-mono">{formatINR(item.unitPrice)}</td>
                        <td className="py-1.5 px-1.5 text-center">
                          <span className="text-[9px] px-1 py-0.2 rounded bg-surface-container font-mono">{item.gstRate || 0}%</span>
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono font-bold">{formatINR(item.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="p-2 rounded-xl bg-surface-container-low space-y-1 text-xs">
              <div className="flex justify-between text-on-surface-variant text-[11px]">
                <span>Taxable Amount</span>
                <span className="font-bold text-on-surface">{formatINR(selectedInvoiceForView.totalTaxableAmount)}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant text-[11px]">
                <span>Total Tax (GST)</span>
                <span className="font-bold text-secondary">
                  {formatINR(selectedInvoiceForView.totalTax)}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-outline-variant/20 font-bold text-sm text-on-surface">
                <span>Total Invoice Value</span>
                <span className="font-black text-on-surface font-currency-display-mobile">
                  {formatINR(selectedInvoiceForView.grandTotal)}
                </span>
              </div>
            </div>

            {/* Compact Payment Status Bar */}
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-surface-container text-xs">
              <span className="text-[11px] text-on-surface-variant font-medium">Payment ({selectedInvoiceForView.paymentMode || 'Cash'}):</span>
              <span className="text-[11px] font-bold">
                {selectedInvoiceForView.balanceAmount <= 0.01 ? (
                  <span className="text-secondary flex items-center gap-1 font-bold">
                    <span className="material-symbols-outlined text-[15px]">check_circle</span>
                    Fully Settled
                  </span>
                ) : (
                  <span className="text-on-surface">
                    Paid: <span className="text-secondary">{formatINR(selectedInvoiceForView.paidAmount)}</span> • Due: <span className="text-error">{formatINR(selectedInvoiceForView.balanceAmount)}</span>
                  </span>
                )}
              </span>
            </div>

            {/* Bottom Actions Bar */}
            <div className="flex items-center gap-2 pt-1 border-t border-outline-variant/20 flex-wrap sm:flex-nowrap">
              {/* Separate PDF A4 Bill Preview Button */}
              {onViewInvoice && (
                <button
                  type="button"
                  onClick={() => {
                    const inv = selectedInvoiceForView;
                    setSelectedInvoiceForView(null);
                    onViewInvoice(inv);
                  }}
                  className="flex-1 min-w-[120px] py-2 px-3 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-xs active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 hover:opacity-90 transition-all"
                  title="Open full A4 / PDF print preview"
                >
                  <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                  <span>Preview A4 / PDF</span>
                </button>
              )}

              {/* Edit in Grid Button */}
              {onEditInvoice && (
                <button
                  type="button"
                  onClick={() => {
                    const inv = selectedInvoiceForView;
                    setSelectedInvoiceForView(null);
                    onEditInvoice(inv);
                  }}
                  className="py-2 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95 transition-all"
                  title="Edit Invoice in Grid Workstation"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  <span>Edit Grid</span>
                </button>
              )}

              {/* Delete Invoice Button */}
              <button
                type="button"
                onClick={() => handleDeleteInvoiceBill(selectedInvoiceForView)}
                className="w-9 h-9 rounded-xl text-error hover:bg-error/10 flex items-center justify-center cursor-pointer transition-colors active:scale-95 flex-shrink-0"
                title="Delete Invoice"
              >
                <span className="material-symbols-outlined text-[17px]">delete</span>
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setSelectedInvoiceForView(null)}
                className="py-2 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
