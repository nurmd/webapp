import { useMemo, useState } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { printPartyLedgerStatement } from '../../core/utils/ledgerStatementPrinter.ts';

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

export type TxnFilterType = 'ALL' | 'BILLS' | 'PAYMENTS';
export type DateFilterType = 'ALL' | 'THIS_MONTH' | 'LAST_30_DAYS';
export type TxnSortOrderType = 'NEWEST' | 'OLDEST';

export interface UsePartyPassbookParams {
  party: Party;
  company: CompanyProfile;
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  vouchers?: Voucher[];
}

export function usePartyPassbook({
  party,
  company,
  invoices = [],
  purchases = [],
  vouchers = [],
}: UsePartyPassbookParams) {
  const [txnFilter, setTxnFilter] = useState<TxnFilterType>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('ALL');
  const [txnSortOrder, setTxnSortOrder] = useState<TxnSortOrderType>('NEWEST');
  const [searchTxn, setSearchTxn] = useState('');

  const isCustomer = party.type === 'CUSTOMER';

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
        (e) => e.accountId === party.id || (e.accountName && e.accountName.toLowerCase() === party.name.toLowerCase())
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

    // Genuine explicit opening balance
    const hasExplicitOpening = typeof party.openingBalance === 'number' && party.openingBalance !== 0;
    const openingDate = party.openingBalanceDate || (party.createdAt ? party.createdAt.split('T')[0] : '2026-01-01');

    if (hasExplicitOpening) {
      const absAmt = Math.abs(party.openingBalance!);
      const opType = party.openingBalanceType || (party.openingBalance! > 0 ? (isCustomer ? 'TO_RECEIVE' : 'TO_PAY') : (isCustomer ? 'TO_PAY' : 'TO_RECEIVE'));
      const isRec = opType === 'TO_RECEIVE';
      rawEntries.push({
        id: `opening-${party.id}`,
        rawId: party.id,
        date: openingDate,
        docNumber: 'OPENING',
        type: 'OPENING',
        description: `Opening Balance (${isRec ? "You'll Get" : "You'll Give"})`,
        debit: isRec ? absAmt : 0,
        credit: isRec ? 0 : absAmt,
        status: 'OPENING',
        isOpening: true,
      });
    }

    rawEntries.sort((a, b) => {
      // Opening balance must always be the baseline transaction of the passbook / ledger statement
      if (a.type === 'OPENING' && b.type === 'OPENING') return 0;
      if (a.type === 'OPENING') return -1;
      if (b.type === 'OPENING') return 1;
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      const timeDiff = (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
      if (timeDiff !== 0) return timeDiff;
      if ((a.type === 'SALE' || a.type === 'PURCHASE') && (b.type === 'PAYMENT_IN' || b.type === 'PAYMENT_OUT')) return -1;
      if ((b.type === 'SALE' || b.type === 'PURCHASE') && (a.type === 'PAYMENT_IN' || a.type === 'PAYMENT_OUT')) return 1;
      return 0;
    });

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
      if (typeof party.openingBalance === 'number' && party.openingBalance !== 0) {
        const absAmt = Math.abs(party.openingBalance);
        const opType = party.openingBalanceType || (party.openingBalance > 0 ? (isCustomer ? 'TO_RECEIVE' : 'TO_PAY') : (isCustomer ? 'TO_PAY' : 'TO_RECEIVE'));
        return opType === 'TO_RECEIVE' ? absAmt : -absAmt;
      }
      return party.currentBalance || 0;
    }
    const lastRunning = passbook[passbook.length - 1].runningBalance;
    return isCustomer ? lastRunning : -lastRunning;
  }, [passbook, party.openingBalance, party.openingBalanceType, party.currentBalance, isCustomer]);

  const isReceivable = liveNetBalance > 0;
  const isPayable = liveNetBalance < 0;

  // Filtered passbook list
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

  return {
    isCustomer,
    partyInvoices,
    partyPurchases,
    totalBilled,
    totalPaid,
    passbook,
    liveNetBalance,
    isReceivable,
    isPayable,
    txnFilter,
    setTxnFilter,
    dateFilter,
    setDateFilter,
    txnSortOrder,
    setTxnSortOrder,
    searchTxn,
    setSearchTxn,
    filteredPassbook,
    handlePrintStatement,
    handleWhatsAppReminder,
  };
}
