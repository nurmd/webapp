import React, { useState, useMemo } from 'react';
import { Invoice, PaymentSplit } from '../../models/invoice.ts';
import { InventoryItem } from '../../models/item.ts';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Expense } from '../../models/expense.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getWhatsAppShareUrl, safeOpenExternalUrl } from '../../core/utils/upiAndShare.ts';
import { AppTab } from '../Shell/Drawer.tsx';
import { SimplifiedPurchaseModal } from '../Purchases/SimplifiedPurchaseModal.tsx';
import { DashboardVoucherModal } from './DashboardVoucherModal.tsx';
import { DashboardExpenseModal } from './DashboardExpenseModal.tsx';
import {
  DashboardRecordPaymentModal,
  DashboardPaymentTarget,
} from './DashboardRecordPaymentModal.tsx';
import { db } from '../../services/db.ts';

export type ActivityType = 'SALE' | 'PURCHASE' | 'VOUCHER' | 'EXPENSE';
export type CashFlowDirection = 'IN' | 'OUT';
export type TxTypeFilter = 'ALL' | 'SALES' | 'PURCHASES' | 'VOUCHERS' | 'EXPENSES' | 'VOUCHERS_EXPENSES';
export type TxStatusFilter = 'ALL' | 'UNPAID' | 'PAID';

export interface ActivityTransaction {
  id: string;
  rawId: string;
  type: ActivityType;
  typeLabel: string;
  flow: CashFlowDirection;
  partyName: string;
  partyId?: string;
  identifier: string;
  date: string;
  timestamp: number;
  amount: number;
  paidAmount?: number;
  balanceAmount?: number;
  paymentMode?: string;
  paymentStatus: 'PAID' | 'UNPAID' | 'PARTIAL';
  description?: string;
  rawInvoice?: Invoice;
  rawPurchase?: PurchaseBill;
  rawVoucher?: Voucher;
  rawExpense?: Expense;
}

export interface DashboardViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  items: InventoryItem[];
  parties: Party[];
  purchases?: PurchaseBill[];
  vouchers?: Voucher[];
  expenses?: Expense[];
  onNewInvoice: () => void;
  onQuickPos: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onPrintInvoice?: (invoice: Invoice) => void;
  onViewPurchase?: (purchase: PurchaseBill) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onEditPurchase?: (purchase: PurchaseBill) => void;
  onRecordPartyPayment?: (
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string,
    paymentType?: 'IN' | 'OUT',
    paymentSplits?: PaymentSplit[]
  ) => void;
  onRefresh?: () => void;
  onNavigateTab: (tab: AppTab) => void;
  onNavigateToParties?: (segment: 'CUSTOMERS' | 'SUPPLIERS', filter?: 'ALL' | 'OVERDUE' | 'SETTLED') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  company,
  invoices,
  items,
  parties,
  purchases: propPurchases,
  vouchers: propVouchers,
  expenses: propExpenses,
  onNewInvoice,
  onQuickPos,
  onViewInvoice,
  onPrintInvoice,
  onViewPurchase,
  onEditInvoice: _onEditInvoice,
  onEditPurchase,
  onRecordPartyPayment,
  onRefresh,
  onNavigateTab,
  onNavigateToParties,
}) => {
  // Resolve data sources with graceful fallback to DB if props are omitted or undefined
  const activeInvoices = invoices || [];
  const activeParties = parties || [];
  const activeItems = items || [];
  const activePurchases = (propPurchases !== undefined && propPurchases !== null ? propPurchases : db.getPurchases()) || [];
  const activeVouchers = (propVouchers !== undefined && propVouchers !== null ? propVouchers : db.getVouchers()) || [];
  const activeExpenses = (propExpenses !== undefined && propExpenses !== null ? propExpenses : db.getExpenses()) || [];

  // Filters & Search State
  const [txTypeFilter, setTxTypeFilter] = useState<TxTypeFilter>('ALL');
  const [txStatusFilter, setTxStatusFilter] = useState<TxStatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals for Contextual In-Dashboard Actions
  const [selectedPurchaseForModal, setSelectedPurchaseForModal] = useState<PurchaseBill | null>(null);
  const [selectedVoucherForModal, setSelectedVoucherForModal] = useState<Voucher | null>(null);
  const [selectedExpenseForModal, setSelectedExpenseForModal] = useState<Expense | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<DashboardPaymentTarget | null>(null);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);

  // Financial Overview Aggregates
  const totalSales = activeInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);

  const totalReceivables = activeParties
    .filter((p) => p.currentBalance > 0)
    .reduce((sum, p) => sum + p.currentBalance, 0);

  const totalPayables = activeParties
    .filter((p) => p.currentBalance < 0)
    .reduce((sum, p) => sum + Math.abs(p.currentBalance), 0);

  const debtorParties = activeParties.filter((p) => p.currentBalance > 0);
  const creditorParties = activeParties.filter((p) => p.currentBalance < 0);
  const lowStockItems = activeItems.filter((i) => i.currentStock <= i.minStockAlert);

  // 1. Build Consolidated Multi-Entity Activity Timeline (R1)
  const allActivities = useMemo(() => {
    const feed: ActivityTransaction[] = [];

    // Helper to reliably parse ISO, DD/MM/YYYY, or createdAt into a numeric timestamp
    const parseDateToTimestamp = (dateStr?: string, createdAt?: string): number => {
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d.getTime();
        if (typeof dateStr === 'string' && dateStr.includes('/')) {
          const parts = dateStr.trim().split('/');
          if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            const parsed = new Date(year, month, day);
            if (!isNaN(parsed.getTime())) return parsed.getTime();
          }
        }
      }
      if (createdAt) {
        const c = new Date(createdAt);
        if (!isNaN(c.getTime())) return c.getTime();
      }
      return 0;
    };

    // A. Sales Invoices (Money In - Emerald)
    activeInvoices.forEach((inv) => {
      if (!inv) return;
      const isPaid = inv.paymentStatus === 'PAID' || (inv.balanceAmount || 0) <= 0.01;
      const isPartial = !isPaid && (inv.paidAmount || 0) > 0;
      const status: 'PAID' | 'UNPAID' | 'PARTIAL' = isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'UNPAID';
      const invItems = inv.items || [];

      feed.push({
        id: `sale-${inv.id}`,
        rawId: inv.id,
        type: 'SALE',
        typeLabel: 'Sale Invoice',
        flow: 'IN',
        partyName: inv.partyName || 'Cash Customer',
        partyId: inv.partyId,
        identifier: inv.invoiceNumber || '',
        date: inv.date || '',
        timestamp: parseDateToTimestamp(inv.date, inv.createdAt),
        amount: inv.grandTotal || 0,
        paidAmount: inv.paidAmount,
        balanceAmount: inv.balanceAmount,
        paymentMode: inv.paymentMode || 'CASH',
        paymentStatus: status,
        description: invItems.length > 0
          ? `${invItems.length} item${invItems.length > 1 ? 's' : ''} (${invItems.map((i) => i.name).slice(0, 2).join(', ')})`
          : 'Sales Invoice',
        rawInvoice: inv,
      });
    });

    // B. Purchase Bills (Money Out - Rose)
    activePurchases.forEach((pur) => {
      if (!pur) return;
      const isPaid = pur.paymentStatus === 'PAID' || (pur.balanceAmount || 0) <= 0.01;
      const isPartial = !isPaid && (pur.paidAmount || 0) > 0;
      const status: 'PAID' | 'UNPAID' | 'PARTIAL' = isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'UNPAID';
      const purItems = pur.items || [];

      feed.push({
        id: `pur-${pur.id}`,
        rawId: pur.id,
        type: 'PURCHASE',
        typeLabel: 'Purchase Bill',
        flow: 'OUT',
        partyName: pur.supplierName || 'Unknown Supplier',
        partyId: pur.supplierId,
        identifier: pur.billNumber || '',
        date: pur.date || '',
        timestamp: parseDateToTimestamp(pur.date, pur.createdAt),
        amount: pur.grandTotal || 0,
        paidAmount: pur.paidAmount,
        balanceAmount: pur.balanceAmount,
        paymentMode: pur.paymentMode || 'CASH',
        paymentStatus: status,
        description: purItems.length > 0
          ? `${purItems.length} item${purItems.length > 1 ? 's' : ''} (${purItems.map((i) => i.name).slice(0, 2).join(', ')})`
          : 'Purchase Bill',
        rawPurchase: pur,
      });
    });

    // C. Accounting Vouchers (Receipts = Money In, Payments = Money Out)
    activeVouchers.forEach((v, vIdx) => {
      if (!v) return;
      // Exclude auto-generated SALES and PURCHASE vouchers that mirror primary invoices/purchases
      if (v.voucherType === 'SALES' || v.voucherType === 'PURCHASE') {
        return;
      }
      const vNum = v.voucherNumber || '';
      if (vNum.startsWith('VCH-SAL-') || vNum.startsWith('VCH-PUR-')) {
        return;
      }

      const isReceipt = v.voucherType === 'RECEIPT';
      const flow: CashFlowDirection = isReceipt ? 'IN' : 'OUT';

      // Determine party name from entries safely
      const entries = v.entries || [];
      const nonCashBankEntry = entries.find(
        (e) => e.accountId !== 'ACC_CASH' && e.accountId !== 'ACC_BANK' && e.accountId !== 'ACC_ROUND_OFF'
      );
      const fallbackPartyName =
        v.voucherType === 'CONTRA'
          ? 'Cash & Bank Transfer'
          : v.voucherType === 'JOURNAL'
          ? 'Journal Adjustment'
          : isReceipt
          ? 'Receipt Party'
          : 'Payment Party';
      const partyName = nonCashBankEntry?.accountName || fallbackPartyName;
      const partyId = nonCashBankEntry?.accountId;

      // Extract payment mode from entries
      const cashLines = entries.filter((e) => e.accountId === 'ACC_CASH' && (e.debit > 0 || e.credit > 0));
      const bankLines = entries.filter((e) => e.accountId === 'ACC_BANK' && (e.debit > 0 || e.credit > 0));
      const isSplit = cashLines.length > 0 && bankLines.length > 0;
      const vMode = isSplit
        ? 'SPLIT'
        : cashLines.length > 0
        ? 'CASH'
        : bankLines.length > 0
        ? (v.narration?.toUpperCase().includes('UPI') ? 'UPI' : 'BANK')
        : 'UPI';

      const typeLabel = isReceipt
        ? 'Receipt Voucher'
        : v.voucherType === 'PAYMENT'
        ? 'Payment Voucher'
        : v.voucherType === 'CONTRA'
        ? 'Contra Voucher'
        : v.voucherType === 'JOURNAL'
        ? 'Journal Voucher'
        : v.voucherType === 'DEBIT_NOTE'
        ? 'Debit Note'
        : v.voucherType === 'CREDIT_NOTE'
        ? 'Credit Note'
        : `${v.voucherType || 'Voucher'} Voucher`;

      const totalAmt = v.totalAmount || 0;
      feed.push({
        id: `vchr-${v.id || vNum || `${v.date || 'v'}-${totalAmt}-${vIdx}`}`,
        rawId: v.id || '',
        type: 'VOUCHER',
        typeLabel,
        flow,
        partyName,
        partyId,
        identifier: vNum || 'VOUCHER',
        date: v.date || '',
        timestamp: parseDateToTimestamp(v.date, v.createdAt),
        amount: totalAmt,
        paidAmount: totalAmt,
        balanceAmount: 0,
        paymentMode: vMode,
        paymentStatus: 'PAID',
        description: v.narration || (isReceipt ? 'Payment Received' : 'Payment Disbursed'),
        rawVoucher: v,
      });
    });

    // D. Business Expenses (Money Out - Rose/Amber)
    activeExpenses.forEach((exp, expIdx) => {
      if (!exp) return;
      const expAmt = exp.amount || 0;
      feed.push({
        id: `exp-${exp.id || exp.voucherNumber || `${exp.date || 'e'}-${expAmt}-${expIdx}`}`,
        rawId: exp.id || '',
        type: 'EXPENSE',
        typeLabel: 'Expense',
        flow: 'OUT',
        partyName: exp.vendorName || exp.title || exp.category || 'Business Expense',
        identifier: exp.voucherNumber || (exp.id ? `EXP-${String(exp.id).slice(-6)}` : 'EXPENSE'),
        date: exp.date || '',
        timestamp: parseDateToTimestamp(exp.date, exp.createdAt),
        amount: expAmt,
        paidAmount: expAmt,
        balanceAmount: 0,
        paymentMode: exp.paymentMode || 'CASH',
        paymentStatus: 'PAID',
        description: `${exp.category || 'Expense'}${exp.title && exp.title !== exp.category ? ` • ${exp.title}` : ''}`,
        rawExpense: exp,
      });
    });

    // Chronological Sort: Descending (Newest first) with stable multi-field tiebreaker
    return feed.sort((a, b) => {
      if (b.timestamp !== a.timestamp) {
        return b.timestamp - a.timestamp;
      }
      const cmp = (b.identifier || '').localeCompare(a.identifier || '');
      if (cmp !== 0) return cmp;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [activeInvoices, activePurchases, activeVouchers, activeExpenses]);

  // Metric counts across types (single-pass linear computation for large datasets)
  const { salesCount, purchasesCount, vouchersCount, expensesCount, vouchersAndExpensesCount, unpaidCount, paidCount } = useMemo(() => {
    let sales = 0;
    let purchases = 0;
    let vouchers = 0;
    let expenses = 0;
    let unpaid = 0;
    let paid = 0;

    for (const a of allActivities) {
      if (a.type === 'SALE') sales++;
      else if (a.type === 'PURCHASE') purchases++;
      else if (a.type === 'VOUCHER') vouchers++;
      else if (a.type === 'EXPENSE') expenses++;

      const isPaid = a.paymentStatus === 'PAID' && (a.balanceAmount || 0) <= 0.01;
      const isUnpaidOrPartial = a.paymentStatus === 'UNPAID' || a.paymentStatus === 'PARTIAL' || (a.balanceAmount || 0) > 0;

      if (isPaid) paid++;
      if (isUnpaidOrPartial) unpaid++;
    }

    return {
      salesCount: sales,
      purchasesCount: purchases,
      vouchersCount: vouchers,
      expensesCount: expenses,
      vouchersAndExpensesCount: vouchers + expenses,
      unpaidCount: unpaid,
      paidCount: paid,
    };
  }, [allActivities]);

  // 2. Real-Time Search & Type / Status Filtering (R2)
  const filteredActivities = useMemo(() => {
    return allActivities.filter((item) => {
      // A. Type Filter
      if (txTypeFilter === 'SALES' && item.type !== 'SALE') return false;
      if (txTypeFilter === 'PURCHASES' && item.type !== 'PURCHASE') return false;
      if (txTypeFilter === 'VOUCHERS' && item.type !== 'VOUCHER') return false;
      if (txTypeFilter === 'EXPENSES' && item.type !== 'EXPENSE') return false;
      if (txTypeFilter === 'VOUCHERS_EXPENSES' && item.type !== 'VOUCHER' && item.type !== 'EXPENSE') return false;

      // B. Settlement Status Filter
      if (txStatusFilter === 'UNPAID') {
        const isUnpaidOrPartial =
          item.paymentStatus === 'UNPAID' ||
          item.paymentStatus === 'PARTIAL' ||
          (item.balanceAmount || 0) > 0;
        if (!isUnpaidOrPartial) return false;
      }
      if (txStatusFilter === 'PAID') {
        const isPaid = item.paymentStatus === 'PAID' && (item.balanceAmount || 0) <= 0.01;
        if (!isPaid) return false;
      }

      // C. Live Real-Time Search (Reference Number, Party Name, Amount, Date, Status, Mode, Flow)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();

        const matchToken = (token: string): boolean => {
          const matchDoc = (item.identifier || '').toLowerCase().includes(token);
          const matchParty = (item.partyName || '').toLowerCase().includes(token);
          const matchDesc = (item.description || '').toLowerCase().includes(token);
          const matchMode = (item.paymentMode || '').toLowerCase().includes(token);
          const matchType = (item.typeLabel || '').toLowerCase().includes(token);
          const matchStatus = (item.paymentStatus || '').toLowerCase().includes(token);
          const matchDate = (item.date || '').toLowerCase().includes(token) || formatDate(item.date).toLowerCase().includes(token);
          const matchFlow = (item.flow === 'IN' ? 'money in' : 'money out').includes(token);

          // Normalized amount search: handles raw numbers, currency formatted with/without commas, decimals, and symbols
          const qDigits = token.replace(/[^0-9.]/g, '');
          const hasDigits = /[0-9]/.test(qDigits);
          const amtStr = item.amount.toString();
          const amtFixed = item.amount.toFixed(2);
          const amtFormatted = formatINR(item.amount).toLowerCase();
          const amtFormattedNoSpace = amtFormatted.replace(/\s+/g, '');

          let matchAmt = false;
          if (hasDigits || token.includes('₹')) {
            matchAmt =
              amtStr.includes(token) ||
              amtFixed.includes(token) ||
              amtFormatted.includes(token) ||
              amtFormattedNoSpace.includes(token);

            if (!matchAmt && hasDigits) {
              matchAmt = amtStr.includes(qDigits) || amtFixed.includes(qDigits);
            }

            // Also match balance due amount if present
            if (!matchAmt && (item.balanceAmount || 0) > 0) {
              const bal = item.balanceAmount!;
              const balStr = bal.toString();
              const balFixed = bal.toFixed(2);
              const balFormatted = formatINR(bal).toLowerCase();
              const balFormattedNoSpace = balFormatted.replace(/\s+/g, '');
              matchAmt =
                balStr.includes(token) ||
                balFixed.includes(token) ||
                balFormatted.includes(token) ||
                balFormattedNoSpace.includes(token) ||
                (hasDigits && (balStr.includes(qDigits) || balFixed.includes(qDigits)));
            }
          }

          return (
            matchDoc ||
            matchParty ||
            matchDesc ||
            matchMode ||
            matchType ||
            matchStatus ||
            matchDate ||
            matchFlow ||
            matchAmt
          );
        };

        // Match full query first
        if (matchToken(q)) return true;

        // If multi-word search, match if all tokens match some field
        const words = q.split(/\s+/).filter(Boolean);
        if (words.length > 1) {
          return words.every((word) => matchToken(word));
        }

        return false;
      }

      return true;
    });
  }, [allActivities, txTypeFilter, txStatusFilter, searchQuery]);

  // Progressive batching for large datasets (preserves visual containment and prevents UI lag)
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Expand / collapse action icons on smaller screens
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());

  const toggleExpandCard = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, txTypeFilter, txStatusFilter]);

  const visibleActivities = useMemo(() => {
    return filteredActivities.slice(0, visibleCount);
  }, [filteredActivities, visibleCount]);

  // 3. Inline Fast Action Controls (R3)
  const handleCardClick = (item: ActivityTransaction) => {
    if (item.type === 'SALE' && item.rawInvoice) {
      if (onViewInvoice) {
        onViewInvoice(item.rawInvoice);
      }
    } else if (item.type === 'PURCHASE' && item.rawPurchase) {
      if (onViewPurchase) {
        onViewPurchase(item.rawPurchase);
      } else {
        setSelectedPurchaseForModal(item.rawPurchase);
      }
    } else if (item.type === 'VOUCHER' && item.rawVoucher) {
      setSelectedVoucherForModal(item.rawVoucher);
    } else if (item.type === 'EXPENSE' && item.rawExpense) {
      setSelectedExpenseForModal(item.rawExpense);
    }
  };

  const handleShareClick = (e: React.MouseEvent, item: ActivityTransaction) => {
    e.stopPropagation();
    if (item.type === 'SALE' && item.rawInvoice) {
      const party = item.partyId ? activeParties.find((p) => p.id === item.partyId) : undefined;
      const url = getWhatsAppShareUrl(item.rawInvoice, company, party?.phone);
      safeOpenExternalUrl(url);
    } else if (item.type === 'PURCHASE' && item.rawPurchase) {
      const pur = item.rawPurchase;
      const supplier = item.partyId ? activeParties.find((p) => p.id === item.partyId) : undefined;
      const cleanPhone = (supplier?.phone || '').replace(/\D/g, '');
      const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      const text = `*Purchase Bill Summary - ${company.tradeName || company.businessName}*\n` +
        `--------------------------------\n` +
        `*Bill No:* ${pur.billNumber}\n` +
        `*Supplier:* ${pur.supplierName}\n` +
        `*Date:* ${pur.date}\n` +
        `*Amount:* ${formatINR(pur.grandTotal)}\n` +
        `*Balance Due:* ${formatINR(pur.balanceAmount)}\n` +
        `*Status:* ${pur.paymentStatus}`;
      const url = `https://wa.me/${phoneParam}?text=${encodeURIComponent(text)}`;
      safeOpenExternalUrl(url);
    } else if (item.type === 'VOUCHER' && item.rawVoucher) {
      const v = item.rawVoucher;
      const text = `*Voucher Summary - ${company.tradeName || company.businessName}*\n` +
        `--------------------------------\n` +
        `*Voucher No:* ${v.voucherNumber}\n` +
        `*Type:* ${v.voucherType}\n` +
        `*Date:* ${v.date}\n` +
        `*Amount:* ${formatINR(v.totalAmount)}\n` +
        (v.narration ? `*Narration:* ${v.narration}\n` : '') +
        `--------------------------------\n` +
        `Recorded in GST Billing App`;
      safeOpenExternalUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
    } else if (item.type === 'EXPENSE' && item.rawExpense) {
      const exp = item.rawExpense;
      const text = `*Expense Voucher - ${company.tradeName || company.businessName}*\n` +
        `--------------------------------\n` +
        `*Expense:* ${exp.title}\n` +
        `*Category:* ${exp.category}\n` +
        `*Date:* ${exp.date}\n` +
        `*Amount:* ${formatINR(exp.amount)}\n` +
        `*Payment Mode:* ${exp.paymentMode}\n` +
        (exp.vendorName ? `*Vendor:* ${exp.vendorName}\n` : '') +
        (exp.voucherNumber ? `*Voucher No:* ${exp.voucherNumber}\n` : '') +
        `--------------------------------\n` +
        `Recorded in GST Billing App`;
      safeOpenExternalUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
    }
  };

  const handlePrintClick = (e: React.MouseEvent, item: ActivityTransaction) => {
    e.stopPropagation();
    if (item.type === 'SALE' && item.rawInvoice) {
      if (onPrintInvoice) {
        onPrintInvoice(item.rawInvoice);
      } else if (onViewInvoice) {
        onViewInvoice(item.rawInvoice);
      }
    } else if (item.type === 'PURCHASE' && item.rawPurchase) {
      if (onViewPurchase) {
        onViewPurchase(item.rawPurchase);
      } else {
        setSelectedPurchaseForModal(item.rawPurchase);
      }
    } else if (item.type === 'VOUCHER' && item.rawVoucher) {
      setSelectedVoucherForModal(item.rawVoucher);
    } else if (item.type === 'EXPENSE' && item.rawExpense) {
      setSelectedExpenseForModal(item.rawExpense);
    }
  };

  const handleOpenRecordPayment = (e: React.MouseEvent, item: ActivityTransaction) => {
    e.stopPropagation();
    setPaymentTarget({
      type: item.type === 'SALE' ? 'SALE' : 'PURCHASE',
      rawId: item.rawId,
      docNumber: item.identifier,
      partyName: item.partyName,
      partyId: item.partyId,
      balanceAmount: item.balanceAmount || item.amount,
      grandTotal: item.amount,
      rawInvoice: item.rawInvoice,
      rawPurchase: item.rawPurchase,
    });
    setIsRecordPaymentOpen(true);
  };

  return (
    <div className="flex flex-col w-full px-3 sm:px-4 md:px-6 gap-3 sm:gap-4 py-3 max-w-7xl mx-auto">
      {/* 1. Low Stock Notice (Only visible when items are low on stock) */}
      {lowStockItems.length > 0 && (
        <div
          onClick={() => onNavigateTab('inventory')}
          className="bg-amber-500/10 border border-amber-500/25 rounded-2xl px-3.5 py-2.5 flex items-center justify-between cursor-pointer active:scale-98 transition-all text-xs"
        >
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium min-w-0">
            <span className="material-symbols-outlined text-[18px] text-amber-600 flex-shrink-0">warning</span>
            <span className="truncate">
              <strong>{lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''}</strong> running low on stock
            </span>
          </div>
          <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-0.5 flex-shrink-0 ml-2">
            <span>View Stock</span>
            <span className="material-symbols-outlined text-[15px]">chevron_right</span>
          </span>
        </div>
      )}

      {/* 2 & 3. Unified Financial Snapshot & Quick Actions (Responsive Tablet Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-stretch">
        {/* Left: Financial Overview Card */}
        <section className="md:col-span-8 bg-surface-container-lowest rounded-2xl p-3.5 sm:p-4 shadow-sm border border-outline-variant/30 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
            <span className="font-bold text-xs uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-secondary"></span>
              Financial Overview
            </span>

            <button
              type="button"
              onClick={() => onNavigateTab('reports')}
              className="text-secondary text-xs font-bold flex items-center gap-0.5 hover:underline cursor-pointer"
            >
              <span>Reports</span>
              <span className="material-symbols-outlined text-[15px]">chevron_right</span>
            </button>
          </div>

          {/* Primary Metric: Total Sales Hero Banner */}
          <div
            onClick={() => onNavigateTab('sales')}
            className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-surface-container-low/60 hover:bg-surface-container-low transition-colors cursor-pointer group"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] sm:text-xs text-on-surface-variant uppercase font-bold tracking-wider">
                Total Sales
              </span>
              <span className="font-tabular-data text-xl sm:text-2xl font-black text-on-surface tracking-tight mt-0.5 group-hover:text-secondary transition-colors">
                {formatINR(totalSales)}
              </span>
              <span className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                {activeInvoices.length} bill{activeInvoices.length === 1 ? '' : 's'} recorded
              </span>
            </div>

            <div className="flex items-center gap-1 text-secondary text-xs font-bold bg-secondary/10 px-2.5 py-1.5 rounded-xl group-hover:bg-secondary group-hover:text-on-secondary transition-all flex-shrink-0 ml-2">
              <span>Sales Hub</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>

          {/* Cash Flow Balance: 2-Column Split (To Collect vs To Pay) */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {/* To Collect (Receivables) */}
            <div
              onClick={() => {
                if (onNavigateToParties) {
                  onNavigateToParties('CUSTOMERS', debtorParties.length > 0 ? 'OVERDUE' : 'ALL');
                } else {
                  onNavigateTab('parties');
                }
              }}
              className="p-3 sm:p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/30 flex flex-col cursor-pointer active:scale-98 transition-all group min-w-0"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-xs text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1 truncate">
                  <span className="material-symbols-outlined text-[14px] flex-shrink-0">south_west</span>
                  <span className="truncate">To Collect</span>
                </span>
                <span className="text-[10px] font-bold text-secondary bg-emerald-100/80 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded-md flex-shrink-0">
                  {debtorParties.length}
                </span>
              </div>

              <span className="font-tabular-data text-sm sm:text-base md:text-lg font-black text-emerald-700 dark:text-emerald-400 mt-1.5 truncate">
                {formatINR(totalReceivables)}
              </span>
              <span className="text-[10px] sm:text-[11px] text-on-surface-variant font-medium mt-0.5 truncate">
                from {debtorParties.length} {debtorParties.length === 1 ? 'party' : 'parties'}
              </span>
            </div>

            {/* To Pay (Payables) */}
            <div
              onClick={() => {
                if (onNavigateToParties) {
                  onNavigateToParties('SUPPLIERS', creditorParties.length > 0 ? 'OVERDUE' : 'ALL');
                } else {
                  onNavigateTab('parties');
                }
              }}
              className="p-3 sm:p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/50 dark:border-rose-800/30 flex flex-col cursor-pointer active:scale-98 transition-all group min-w-0"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-xs text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1 truncate">
                  <span className="material-symbols-outlined text-[14px] flex-shrink-0">north_east</span>
                  <span className="truncate">To Pay</span>
                </span>
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-900/60 px-1.5 py-0.5 rounded-md flex-shrink-0">
                  {creditorParties.length}
                </span>
              </div>

              <span className="font-tabular-data text-sm sm:text-base md:text-lg font-black text-rose-600 dark:text-rose-400 mt-1.5 truncate">
                {formatINR(totalPayables)}
              </span>
              <span className="text-[10px] sm:text-[11px] text-on-surface-variant font-medium mt-0.5 truncate">
                to {creditorParties.length} supplier{creditorParties.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {/* Cash & Bank Quick Strip */}
          <div
            onClick={() => onNavigateTab('cash_bank')}
            className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low/70 hover:bg-surface-container transition-colors cursor-pointer group border border-outline-variant/20"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-700 dark:text-emerald-400 flex-shrink-0">
                <span className="material-symbols-outlined text-[17px]">account_balance</span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-on-surface truncate">Cash & Bank Balance</span>
                <span className="text-[11px] text-on-surface-variant font-medium hidden sm:inline">
                  • Cash in hand & bank accounts
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0 text-secondary font-bold text-xs group-hover:underline">
              <span>Passbook</span>
              <span className="material-symbols-outlined text-[15px]">chevron_right</span>
            </div>
          </div>
        </section>

        {/* Right: Quick Action Buttons (4-Col on mobile, 2x2 on tablet) */}
        <section className="md:col-span-4 bg-surface-container-lowest rounded-2xl p-3.5 sm:p-4 shadow-sm border border-outline-variant/30 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
            <span className="font-bold text-xs uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-secondary"></span>
              Quick Actions
            </span>
            <span className="text-[10px] text-outline font-semibold">Fast Shortcuts</span>
          </div>

          <div className="grid grid-cols-4 md:grid-cols-2 gap-2 sm:gap-3">
            {/* Sale Bill */}
            <button
              onClick={() => onNavigateTab('sales')}
              type="button"
              className="flex flex-col items-center justify-center gap-1.5 h-[72px] sm:h-20 px-1 rounded-2xl bg-secondary text-on-secondary shadow-sm active:scale-95 transition-all cursor-pointer"
              title="Open Sales Ledger"
            >
              <span className="material-symbols-outlined text-[22px]">receipt_long</span>
              <span className="font-bold text-[11px] sm:text-xs truncate w-full text-center">Sale Bill</span>
            </button>

            {/* POS Counter */}
            <button
              onClick={onQuickPos}
              type="button"
              className="flex flex-col items-center justify-center gap-1.5 h-[72px] sm:h-20 px-1 rounded-2xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 shadow-xs active:scale-95 transition-all cursor-pointer hover:border-secondary"
            >
              <span className="material-symbols-outlined text-[22px] text-secondary">point_of_sale</span>
              <span className="font-bold text-[11px] sm:text-xs truncate w-full text-center">Quick POS</span>
            </button>

            {/* Purchase */}
            <button
              onClick={() => onNavigateTab('purchases')}
              type="button"
              className="flex flex-col items-center justify-center gap-1.5 h-[72px] sm:h-20 px-1 rounded-2xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 shadow-xs active:scale-95 transition-all cursor-pointer hover:border-orange-500/50"
              title="Open Purchase Ledger"
            >
              <span className="material-symbols-outlined text-[22px] text-orange-600 dark:text-orange-400">shopping_bag</span>
              <span className="font-bold text-[11px] sm:text-xs truncate w-full text-center">Purchase</span>
            </button>

            {/* Add Party */}
            <button
              onClick={() => onNavigateTab('parties')}
              type="button"
              className="flex flex-col items-center justify-center gap-1.5 h-[72px] sm:h-20 px-1 rounded-2xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 shadow-xs active:scale-95 transition-all cursor-pointer hover:border-secondary"
            >
              <span className="material-symbols-outlined text-[22px] text-on-surface-variant">person_add</span>
              <span className="font-bold text-[11px] sm:text-xs truncate w-full text-center">Add Party</span>
            </button>
          </div>
        </section>
      </div>

      {/* 4. Unified Multi-Entity Business Activity Timeline (R1, R2, R3) */}
      <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden flex flex-col">
        {/* Header Bar */}
        <div className="p-3.5 sm:p-4 border-b border-outline-variant/20 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-secondary">history</span>
              <span className="font-bold text-sm sm:text-base text-on-surface">
                Business Activity Timeline
              </span>
              <span className="text-xs bg-surface-container-low px-2 py-0.5 rounded-full text-on-surface-variant font-bold">
                {filteredActivities.length} of {allActivities.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateTab('sales')}
                className="hidden sm:inline-flex text-secondary text-xs font-bold items-center gap-0.5 hover:underline cursor-pointer"
              >
                <span>Sales Hub</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
          </div>

          {/* Real-Time Live Search Input (R2) */}
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/70">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference #, party / vendor name, or amount..."
              className="w-full pl-9 pr-9 min-h-[44px] rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-hidden focus:border-secondary focus:bg-surface-container-lowest transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Filter Pills Bar: Type Filters & Payment Status Filters (R2) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
            {/* Entity Type Filter Pills */}
            <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-[11px] sm:text-xs font-bold">
              <button
                onClick={() => setTxTypeFilter('ALL')}
                type="button"
                className={`h-7 sm:h-7.5 px-2.5 sm:px-3 rounded-full whitespace-nowrap transition-all cursor-pointer flex items-center justify-center active:scale-95 text-[11px] sm:text-xs font-bold ${
                  txTypeFilter === 'ALL'
                    ? 'bg-surface-container-lowest text-on-surface shadow-xs border border-outline-variant/40'
                    : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                }`}
              >
                All ({allActivities.length})
              </button>

              <button
                onClick={() => setTxTypeFilter('SALES')}
                type="button"
                className={`h-7 sm:h-7.5 px-2.5 sm:px-3 rounded-full whitespace-nowrap transition-all cursor-pointer flex items-center justify-center active:scale-95 text-[11px] sm:text-xs font-bold ${
                  txTypeFilter === 'SALES'
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Sales ({salesCount})
              </button>

              <button
                onClick={() => setTxTypeFilter('PURCHASES')}
                type="button"
                className={`h-7 sm:h-7.5 px-2.5 sm:px-3 rounded-full whitespace-nowrap transition-all cursor-pointer flex items-center justify-center active:scale-95 text-[11px] sm:text-xs font-bold ${
                  txTypeFilter === 'PURCHASES'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Purchases ({purchasesCount})
              </button>

              <button
                onClick={() => setTxTypeFilter('VOUCHERS')}
                type="button"
                className={`h-7 sm:h-7.5 px-2.5 sm:px-3 rounded-full whitespace-nowrap transition-all cursor-pointer flex items-center justify-center active:scale-95 text-[11px] sm:text-xs font-bold ${
                  txTypeFilter === 'VOUCHERS'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Vouchers ({vouchersCount})
              </button>

              <button
                onClick={() => setTxTypeFilter('EXPENSES')}
                type="button"
                className={`h-7 sm:h-7.5 px-2.5 sm:px-3 rounded-full whitespace-nowrap transition-all cursor-pointer flex items-center justify-center active:scale-95 text-[11px] sm:text-xs font-bold ${
                  txTypeFilter === 'EXPENSES'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Expenses ({expensesCount})
              </button>

              <button
                onClick={() => setTxTypeFilter('VOUCHERS_EXPENSES')}
                type="button"
                className={`h-7 sm:h-7.5 px-2.5 sm:px-3 rounded-full whitespace-nowrap transition-all cursor-pointer flex items-center justify-center active:scale-95 text-[11px] sm:text-xs font-bold ${
                  txTypeFilter === 'VOUCHERS_EXPENSES'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Vouchers/Expenses ({vouchersAndExpensesCount})
              </button>
            </div>

            {/* Payment Settlement Status Filter Pills */}
            <div className="flex items-center gap-0.5 bg-surface-container-low rounded-full p-0.5 border border-outline-variant/30 text-[11px] font-bold flex-shrink-0 self-start sm:self-auto">
              <button
                onClick={() => setTxStatusFilter('ALL')}
                type="button"
                className={`h-6.5 sm:h-7 px-2.5 rounded-full text-center transition-colors cursor-pointer flex items-center justify-center ${
                  txStatusFilter === 'ALL'
                    ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setTxStatusFilter('UNPAID')}
                type="button"
                className={`h-6.5 sm:h-7 px-2.5 rounded-full text-center transition-colors cursor-pointer flex items-center justify-center ${
                  txStatusFilter === 'UNPAID'
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Unpaid ({unpaidCount})
              </button>
              <button
                onClick={() => setTxStatusFilter('PAID')}
                type="button"
                className={`h-6.5 sm:h-7 px-2.5 rounded-full text-center transition-colors cursor-pointer flex items-center justify-center ${
                  txStatusFilter === 'PAID'
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Paid ({paidCount})
              </button>
            </div>
          </div>
        </div>

        {/* Transactions Feed List (R1, R2, R3) */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:gap-3 md:p-3.5">
          {filteredActivities.length === 0 ? (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2 md:col-span-2">
              <div className="w-12 h-12 rounded-2xl bg-surface-container-low flex items-center justify-center text-outline">
                <span className="material-symbols-outlined text-[24px]">receipt_long</span>
              </div>
              <span className="text-sm font-bold text-on-surface">No transactions found</span>
              <span className="text-xs text-on-surface-variant max-w-[280px]">
                {allActivities.length === 0
                  ? 'Record your first sale invoice, purchase bill, voucher, or expense to see live activity.'
                  : searchQuery
                  ? `No matching records found for "${searchQuery}". Try a different term or clear the search.`
                  : 'No transactions match the selected filter combination.'}
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    type="button"
                    className="min-h-[44px] px-4 rounded-xl bg-surface-container-low text-secondary font-bold text-xs cursor-pointer hover:bg-surface-container flex items-center justify-center active:scale-95"
                  >
                    Clear Search Filter
                  </button>
                )}
                {allActivities.length > 0 && (txTypeFilter !== 'ALL' || txStatusFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setTxTypeFilter('ALL');
                      setTxStatusFilter('ALL');
                    }}
                    type="button"
                    className="min-h-[44px] px-4 rounded-xl bg-surface-container-low text-secondary font-bold text-xs cursor-pointer hover:bg-surface-container flex items-center justify-center active:scale-95"
                  >
                    Reset Filters
                  </button>
                )}
                {allActivities.length === 0 && (
                  <button
                    onClick={onNewInvoice}
                    type="button"
                    className="min-h-[44px] px-5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs cursor-pointer active:scale-95 flex items-center justify-center"
                  >
                    + Create First Bill
                  </button>
                )}
              </div>
            </div>
          ) : (
            visibleActivities.map((item) => {
              const isMoneyIn = item.flow === 'IN';
              const isPaid = item.paymentStatus === 'PAID';
              const isPartial = item.paymentStatus === 'PARTIAL';
              const hasBalance = (item.balanceAmount || 0) > 0;

              // Type Badge Colors
              const typeBadgeClass =
                item.type === 'SALE'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                  : item.type === 'PURCHASE'
                  ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                  : item.type === 'VOUCHER'
                  ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';

              const isExpanded = expandedCardIds.has(item.id);

              return (
                <div
                  key={item.id}
                  onClick={() => handleCardClick(item)}
                  style={{
                    contentVisibility: 'auto',
                    containIntrinsicSize: isExpanded ? '1px 115px' : '1px 68px',
                  }}
                  className="p-2.5 sm:p-3 md:p-3.5 flex flex-col justify-between gap-2 sm:gap-2.5 hover:bg-surface-container-low/40 active:bg-surface-container-low cursor-pointer transition-all md:rounded-2xl md:border md:border-outline-variant/20 md:hover:border-secondary/40 shadow-xs group"
                >
                  {/* Top Header: Entity Type Badge & Date + Expand Chevron */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {/* Entity Type Badge */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeBadgeClass}`}>
                        {item.typeLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[11px] text-on-surface-variant font-medium">
                        {formatDate(item.date) || '—'}
                      </span>

                      {/* Expand / Collapse Chevron Toggle for smaller screens (hidden on md+) */}
                      <button
                        type="button"
                        onClick={(e) => toggleExpandCard(e, item.id)}
                        data-testid={`expand-actions-${item.id}`}
                        className={`md:hidden min-w-[32px] min-h-[32px] w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                          isExpanded
                            ? 'bg-secondary/15 text-secondary'
                            : 'bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface'
                        }`}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Collapse action icons' : 'Expand action icons'}
                        title={isExpanded ? 'Collapse action icons' : 'Expand action icons'}
                      >
                        <span
                          className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 text-secondary font-bold' : ''
                          }`}
                        >
                          expand_more
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Main Details Row */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    {/* Left: Icon & Title/Party/Doc info */}
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                          isMoneyIn
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                            : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]">
                          {item.type === 'SALE'
                            ? 'receipt_long'
                            : item.type === 'PURCHASE'
                            ? 'shopping_bag'
                            : item.type === 'EXPENSE'
                            ? 'payments'
                            : isMoneyIn
                            ? 'account_balance_wallet'
                            : 'send_money'}
                        </span>
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-xs sm:text-sm text-on-surface truncate group-hover:text-secondary transition-colors">
                          {item.partyName}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant truncate mt-0.5">
                          <span className="font-mono font-bold text-on-surface">{item.identifier}</span>
                          {item.paymentMode && (
                            <>
                              <span>•</span>
                              <span className="uppercase text-[10px] font-semibold">{item.paymentMode}</span>
                            </>
                          )}
                          {item.description && (
                            <>
                              <span className="hidden sm:inline">•</span>
                              <span className="truncate hidden sm:inline">{item.description}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Amount & Settlement Status Pill */}
                    <div className="flex flex-col items-end flex-shrink-0 text-right">
                      <span
                        className={`font-tabular-data text-xs sm:text-sm font-black whitespace-nowrap ${
                          isMoneyIn
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {isMoneyIn ? '+' : '-'} {formatINR(item.amount)}
                      </span>

                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap justify-end">
                        {/* Cash-Flow Indicator Badge (R1) - Left */}
                        <span
                          className={`h-5 px-1.5 rounded-full inline-flex items-center gap-0.5 text-[10px] font-bold leading-none whitespace-nowrap ${
                            isMoneyIn
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[11px] leading-none">
                            {isMoneyIn ? 'south_west' : 'north_east'}
                          </span>
                          <span className="leading-none">{isMoneyIn ? 'Money In' : 'Money Out'}</span>
                        </span>

                        {/* Settlement Status Pill - Right */}
                        <span
                          className={`h-5 px-1.5 rounded-full inline-flex items-center justify-center text-[10px] font-bold leading-none whitespace-nowrap ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : isPartial
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          <span className="leading-none">{item.paymentStatus}</span>
                        </span>

                        {hasBalance && item.balanceAmount && (
                          <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap leading-none">
                            Due: {formatINR(item.balanceAmount)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom: 1-Tap Inline Fast Action Controls (R3) - Collapsible on smaller screens */}
                  <div
                    className={`${
                      isExpanded ? 'flex' : 'hidden md:flex'
                    } items-center justify-between pt-2 border-t border-outline-variant/15 text-xs transition-all gap-1.5 flex-wrap sm:flex-nowrap`}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {/* 1-Tap View Details */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCardClick(item);
                        }}
                        className="min-h-[44px] px-2.5 sm:px-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer text-xs"
                        title="View Details"
                      >
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                        <span>View</span>
                      </button>

                      {/* 1-Tap Share / Print */}
                      <button
                        type="button"
                        onClick={(e) => handleShareClick(e, item)}
                        className="min-h-[44px] px-2.5 sm:px-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer text-xs"
                        title="Share Receipt"
                      >
                        <span className="material-symbols-outlined text-[16px]">share</span>
                        <span className="hidden sm:inline">Share</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handlePrintClick(e, item)}
                        className="min-h-[44px] px-2.5 sm:px-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer text-xs"
                        title="Print Receipt"
                      >
                        <span className="material-symbols-outlined text-[16px]">print</span>
                        <span className="hidden sm:inline">Print</span>
                      </button>
                    </div>

                    {/* 1-Tap Fast Record Payment Action (for Unpaid / Partial items) */}
                    <div>
                      {hasBalance && (item.type === 'SALE' || item.type === 'PURCHASE') ? (
                        <button
                          type="button"
                          onClick={(e) => handleOpenRecordPayment(e, item)}
                          className={`min-h-[44px] px-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer ${
                            item.type === 'SALE'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'bg-rose-600 hover:bg-rose-700 text-white'
                          }`}
                          title={item.type === 'SALE' ? 'Collect Customer Payment' : 'Pay Supplier Bill'}
                        >
                          <span className="material-symbols-outlined text-[16px]">payments</span>
                          <span>{item.type === 'SALE' ? 'Collect' : 'Pay'}</span>
                        </button>
                      ) : (
                        <span className="min-h-[44px] px-2 text-xs font-bold text-on-surface-variant flex items-center justify-center gap-1">
                          <span className="material-symbols-outlined text-[16px] text-emerald-600 dark:text-emerald-400">
                            check_circle
                          </span>
                          <span>Settled</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Progressive Batching Pagination Dock for Large Feeds (> 50 items) */}
          {filteredActivities.length > visibleActivities.length && (
            <div className="py-3 px-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-container-low/60 rounded-2xl md:col-span-2 border border-outline-variant/20 mt-2">
              <span className="text-xs text-on-surface-variant font-medium">
                Showing <strong>{visibleActivities.length}</strong> of <strong>{filteredActivities.length}</strong> transactions
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                  className="min-h-[44px] px-4 rounded-xl bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/30 text-secondary font-bold text-xs cursor-pointer active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">expand_more</span>
                  <span>Load More ({Math.min(PAGE_SIZE, filteredActivities.length - visibleActivities.length)})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleCount(filteredActivities.length)}
                  className="min-h-[44px] px-4 rounded-xl bg-secondary text-on-secondary font-bold text-xs cursor-pointer active:scale-95 transition-all flex items-center gap-1.5 shadow-xs"
                >
                  <span>Show All ({filteredActivities.length})</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Contextual Action Modals Rendered Directly Within Dashboard Context */}
      {/* 1. Purchase Bill Details Modal */}
      {selectedPurchaseForModal && (
        <SimplifiedPurchaseModal
          bill={selectedPurchaseForModal}
          company={company}
          onClose={() => setSelectedPurchaseForModal(null)}
          onEditPurchase={(bill) => {
            setSelectedPurchaseForModal(null);
            if (onEditPurchase) {
              onEditPurchase(bill);
            }
          }}
        />
      )}

      {/* 2. Voucher Details Modal */}
      {selectedVoucherForModal && (
        <DashboardVoucherModal
          voucher={selectedVoucherForModal}
          company={company}
          onClose={() => setSelectedVoucherForModal(null)}
        />
      )}

      {/* 3. Expense Details Modal */}
      {selectedExpenseForModal && (
        <DashboardExpenseModal
          expense={selectedExpenseForModal}
          company={company}
          onClose={() => setSelectedExpenseForModal(null)}
        />
      )}

      {/* 4. 1-Tap Fast Inline Payment Modal */}
      {isRecordPaymentOpen && paymentTarget && (
        <DashboardRecordPaymentModal
          isOpen={isRecordPaymentOpen}
          onClose={() => {
            setIsRecordPaymentOpen(false);
            setPaymentTarget(null);
          }}
          target={paymentTarget}
          parties={parties}
          onRecordPartyPayment={onRecordPartyPayment}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
};
