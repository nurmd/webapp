import React, { useState, useMemo } from 'react';
import { Invoice, PaymentSplit } from '../../models/invoice.ts';
import { InventoryItem } from '../../models/item.ts';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Expense } from '../../models/expense.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getWhatsAppShareUrl, safeOpenExternalUrl, getPartyTotalBalanceDue } from '../../core/utils/upiAndShare.ts';
import { buildPurchaseWhatsAppMessage, buildPaymentVoucherWhatsAppMessage } from '../../core/utils/whatsAppMessageBuilders.ts';
import { AppTab } from '../Shell/Drawer.tsx';

const SimplifiedPurchaseModal = React.lazy(() =>
  import('../Purchases/SimplifiedPurchaseModal.tsx').then((m) => ({ default: m.SimplifiedPurchaseModal }))
);
const DashboardVoucherModal = React.lazy(() =>
  import('./DashboardVoucherModal.tsx').then((m) => ({ default: m.DashboardVoucherModal }))
);
import { DashboardExpenseModal } from './DashboardExpenseModal.tsx';
import { AddEditPartyModal } from '../Parties/AddEditPartyModal.tsx';
import {
  DashboardRecordPaymentModal,
  DashboardPaymentTarget,
} from './DashboardRecordPaymentModal.tsx';
import { usePaymentModal } from '../Payments/PaymentModalContext.tsx';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';
import { DatePreset, getDateFilterBounds, isDateInRange } from '../../core/utils/dateFilters.ts';
import { getOverdueDays } from '../../core/accounting/aging.ts';
import { computeCashBankSummary } from '../../core/accounting/cashBankCalculator.ts';
import { computePartyDues } from '../../core/accounting/partyDues.ts';
import {
  useSettings,
  usePurchases,
  useVouchers,
  useExpenses,
  useBankAccounts,
  useCashBankTxns,
} from '../../core/store/useDataStore.ts';
import {
  DASHBOARD_QUICK_ACTIONS,
  DashboardQuickActionId,
  normalizeDashboardQuickActions,
} from '../../core/settings/dashboardQuickActions.ts';

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
  dueDate?: string;
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
    paymentSplits?: PaymentSplit[],
    discount?: number
  ) => void;
  onSaveParty?: (party: Party) => void;
  onRefresh?: () => void;
  onNavigateTab: (tab: AppTab) => void;
  onNavigateToParties?: (segment: 'CUSTOMERS' | 'SUPPLIERS', filter?: 'ALL' | 'OVERDUE' | 'SETTLED') => void;
  onOpenPaymentModal?: (flow: 'IN' | 'OUT') => void;
}

const DashboardViewComponent: React.FC<DashboardViewProps> = ({
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
  onSaveParty,
  onRefresh,
  onNavigateTab,
  onNavigateToParties,
  onOpenPaymentModal,
}) => {
  const paymentModal = usePaymentModal();
  const storePurchases = usePurchases();
  const storeVouchers = useVouchers();
  const storeExpenses = useExpenses();
  const storeBankAccounts = useBankAccounts();
  const storeCashBankTxns = useCashBankTxns();

  // Resolve data sources with graceful fallback to store if props are omitted or undefined
  const activeInvoices = invoices || [];
  const activeParties = parties || [];
  const activeItems = items || [];
  const activePurchases = (propPurchases !== undefined && propPurchases !== null ? propPurchases : storePurchases) || [];
  const activeVouchers = (propVouchers !== undefined && propVouchers !== null ? propVouchers : storeVouchers) || [];
  const activeExpenses = (propExpenses !== undefined && propExpenses !== null ? propExpenses : storeExpenses) || [];

  // Configurable dashboard quick actions (max 6)
  const settings = useSettings();
  const quickActionIds = normalizeDashboardQuickActions(settings.dashboardQuickActions);
  const quickActionDefinitions = quickActionIds
    .map((id) => DASHBOARD_QUICK_ACTIONS[id])
    .filter(Boolean);

  const [isAddPartyOpen, setIsAddPartyOpen] = useState(false);

  const handleQuickAction = (id: DashboardQuickActionId) => {
    switch (id) {
      case 'SALE_BILL':
        onNavigateTab('sales');
        break;
      case 'QUICK_POS':
        onQuickPos();
        break;
      case 'NEW_INVOICE':
        onNewInvoice();
        break;
      case 'PURCHASE':
        onNavigateTab('purchases');
        break;
      case 'ADD_PARTY':
        setIsAddPartyOpen(true);
        break;
      case 'ITEMS':
        onNavigateTab('inventory');
        break;
      case 'EXPENSES':
        onNavigateTab('expenses');
        break;
      case 'PAYMENT_IN':
        if (onOpenPaymentModal) {
          onOpenPaymentModal('IN');
        } else {
          paymentModal.openPaymentModal({ flow: 'IN' });
        }
        break;
      case 'PAYMENT_OUT':
        if (onOpenPaymentModal) {
          onOpenPaymentModal('OUT');
        } else {
          paymentModal.openPaymentModal({ flow: 'OUT' });
        }
        break;
      case 'CASH_BANK':
        onNavigateTab('cash_bank');
        break;
      case 'REPORTS':
        onNavigateTab('reports');
        break;
    }
  };

  // Filters & Search State
  const [txTypeFilter, setTxTypeFilter] = useState<TxTypeFilter>('ALL');
  const [txStatusFilter, setTxStatusFilter] = useState<TxStatusFilter>('ALL');
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL_TIME');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Active Date Filter Bounds
  const dateRange = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  // Normalizes diverse date formats (YYYY-MM-DD, ISO, DD/MM/YYYY, timestamp) to YYYY-MM-DD
  const toNormalizedDateStr = (dateStr?: string, timestamp?: number): string => {
    if (dateStr) {
      const trimmed = dateStr.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        return trimmed.slice(0, 10);
      }
      if (trimmed.includes('/')) {
        const parts = trimmed.split('/');
        if (parts.length === 3) {
          const d = parts[0].padStart(2, '0');
          const m = parts[1].padStart(2, '0');
          const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
          return `${y}-${m}-${d}`;
        }
      }
    }
    if (timestamp && timestamp > 0) {
      const d = new Date(timestamp);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    return '';
  };

  // Modals for Contextual In-Dashboard Actions
  const [selectedPurchaseForModal, setSelectedPurchaseForModal] = useState<PurchaseBill | null>(null);
  const [selectedVoucherForModal, setSelectedVoucherForModal] = useState<Voucher | null>(null);
  const [selectedExpenseForModal, setSelectedExpenseForModal] = useState<Expense | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<DashboardPaymentTarget | null>(null);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);

  // Financial Overview Aggregates (Memoized to prevent recalculation on search/filter changes)
  const totalSales = useMemo(() => {
    return activeInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
  }, [activeInvoices]);

  const { totalReceivables, totalPayables, debtorParties, creditorParties } = useMemo(
    () => computePartyDues(activeParties),
    [activeParties]
  );

  const bankAccounts = storeBankAccounts;
  const cashBankTransactions = storeCashBankTxns;

  const totalCashBankBalance = useMemo(() => {
    const summary = computeCashBankSummary({
      accounts: bankAccounts,
      transactions: cashBankTransactions,
      invoices: activeInvoices,
      purchases: activePurchases,
      expenses: activeExpenses,
      vouchers: activeVouchers,
    });
    return summary.totalLiquidBalance;
  }, [
    bankAccounts,
    cashBankTransactions,
    activeInvoices,
    activePurchases,
    activeVouchers,
    activeExpenses,
  ]);

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

      const isSalesReturn =
        inv.invoiceType === 'CREDIT_NOTE' ||
        (inv.invoiceType as string) === 'RETURN' ||
        (inv as any).noteType === 'C';

      const saleTypeLabel = isSalesReturn
        ? 'Sales Return'
        : inv.invoiceType === 'DEBIT_NOTE'
        ? 'Debit Note'
        : inv.invoiceType === 'DELIVERY_CHALLAN'
        ? 'Delivery Challan'
        : inv.invoiceType === 'ESTIMATE'
        ? 'Quotation / Estimate'
        : inv.invoiceType === 'SALES_ORDER'
        ? 'Sale Order'
        : 'Sale Invoice';

      feed.push({
        id: `sale-${inv.id}`,
        rawId: inv.id,
        type: 'SALE',
        typeLabel: saleTypeLabel,
        flow: 'IN',
        partyName: inv.partyName || 'Cash Customer',
        partyId: inv.partyId,
        identifier: inv.invoiceNumber || '',
        date: inv.date || '',
        dueDate: inv.dueDate,
        timestamp: parseDateToTimestamp(inv.date, inv.createdAt),
        amount: inv.grandTotal || 0,
        paidAmount: inv.paidAmount,
        balanceAmount: inv.balanceAmount,
        paymentMode: inv.paymentMode || 'CASH',
        paymentStatus: status,
        description: invItems.length > 0
          ? `${invItems.length} item${invItems.length > 1 ? 's' : ''} (${invItems.map((i) => i.name).slice(0, 2).join(', ')})`
          : isSalesReturn
          ? 'Sales Return (Credit Note)'
          : inv.invoiceType === 'DELIVERY_CHALLAN'
          ? 'Delivery Challan'
          : saleTypeLabel,
        rawInvoice: inv,
      });
    });

    // B. Purchase Documents (Money Out - Rose)
    activePurchases.forEach((pur) => {
      if (!pur) return;
      const isPaid = pur.paymentStatus === 'PAID' || (pur.balanceAmount || 0) <= 0.01;
      const isPartial = !isPaid && (pur.paidAmount || 0) > 0;
      const status: 'PAID' | 'UNPAID' | 'PARTIAL' = isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'UNPAID';
      const purItems = pur.items || [];
      const isPurchaseReturn =
        pur.purchaseType === 'RETURN' ||
        (pur.purchaseType as string) === 'DEBIT_NOTE' ||
        (pur as any).noteType === 'D';

      const purchaseTypeLabel =
        pur.purchaseType === 'CHALLAN'
          ? 'Purchase Challan (GRN)'
          : pur.purchaseType === 'PO'
          ? 'Purchase Order'
          : isPurchaseReturn
          ? 'Purchase Return'
          : 'Purchase Bill';

      feed.push({
        id: `pur-${pur.id}`,
        rawId: pur.id,
        type: 'PURCHASE',
        typeLabel: purchaseTypeLabel,
        flow: 'OUT',
        partyName: pur.supplierName || 'Unknown Supplier',
        partyId: pur.supplierId,
        identifier: pur.billNumber || '',
        date: pur.date || '',
        dueDate: pur.dueDate,
        timestamp: parseDateToTimestamp(pur.date, pur.createdAt),
        amount: pur.grandTotal || 0,
        paidAmount: pur.paidAmount,
        balanceAmount: pur.balanceAmount,
        paymentMode: pur.paymentMode || 'CASH',
        paymentStatus: status,
        description: purItems.length > 0
          ? `${purItems.length} item${purItems.length > 1 ? 's' : ''} (${purItems.map((i) => i.name).slice(0, 2).join(', ')})`
          : pur.purchaseType === 'CHALLAN'
          ? 'Goods Received Note'
          : isPurchaseReturn
          ? 'Purchase Return (Debit Note)'
          : purchaseTypeLabel,
        rawPurchase: pur,
      });
    });

    // C. Accounting Vouchers (Receipts = Money In, Payments = Money Out)
    activeVouchers.forEach((v, vIdx) => {
      if (!v) return;
      if (v.isReversed || v.isCancelled) return;
      // Exclude auto-generated SALES and PURCHASE vouchers that mirror primary invoices/purchases
      if (v.voucherType === 'SALES' || v.voucherType === 'PURCHASE') {
        return;
      }
      const vNum = v.voucherNumber || '';
      if (vNum.startsWith('VCH-SAL-') || vNum.startsWith('VCH-PUR-') || vNum.startsWith('VCH-REV-') || vNum.startsWith('VCH-RCM-')) {
        return;
      }

      const isReceipt = v.voucherType === 'RECEIPT';
      const flow: CashFlowDirection = isReceipt ? 'IN' : 'OUT';

      // Resolve the real party from the voucher entries. Bank/discount lines often
      // appear before the party line, so never use the first non-cash entry blindly.
      const entries = v.entries || [];
      const normalizedName = (value?: string) => (value || '').trim().toLowerCase();
      const partyEntry = entries.find((entry) =>
        activeParties.some((party) => party.id === entry.accountId)
      ) || entries.find((entry) =>
        activeParties.some((party) => party.name && normalizedName(party.name) === normalizedName(entry.accountName))
      );
      const matchedParty = partyEntry
        ? activeParties.find(
            (party) =>
              party.id === partyEntry.accountId ||
              (party.name && normalizedName(party.name) === normalizedName(partyEntry.accountName))
          )
        : undefined;
      const bankAccountIds = new Set(bankAccounts.map((account) => account.id));
      const systemAccountIds = new Set([
        'ACC_CASH',
        'ACC_BANK',
        'ACC_ROUND_OFF',
        'ACC_EXPENSE_DISCOUNT',
        'ACC_INCOME_DISCOUNT',
      ]);
      const isBankLedger = (accountId?: string) =>
        accountId === 'ACC_BANK' || (!!accountId && bankAccountIds.has(accountId));
      const fallbackPartyEntry = entries.find(
        (entry) => !systemAccountIds.has(entry.accountId) && !isBankLedger(entry.accountId)
      );
      const fallbackPartyName =
        v.voucherType === 'CONTRA'
          ? 'Cash & Bank Transfer'
          : v.voucherType === 'JOURNAL'
          ? 'Journal Adjustment'
          : isReceipt
          ? 'Receipt Party'
          : 'Payment Party';
      const partyName = matchedParty?.name || fallbackPartyEntry?.accountName || fallbackPartyName;
      const partyId = matchedParty?.id || fallbackPartyEntry?.accountId;

      // Extract payment mode from entries
      const cashLines = entries.filter((e) => e.accountId === 'ACC_CASH' && (e.debit > 0 || e.credit > 0));
      const bankLines = entries.filter((e) => isBankLedger(e.accountId) && (e.debit > 0 || e.credit > 0));
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
      const contraRoute = v.voucherType === 'CONTRA'
        ? (() => {
            const fromEntry = entries.find((e) => e.credit > 0);
            const toEntry = entries.find((e) => e.debit > 0);
            const fromName = fromEntry?.accountName || 'Cash in Hand';
            const toName = toEntry?.accountName || 'Bank Account';
            return `${fromName} ➔ ${toName}`;
          })()
        : null;

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
          description: contraRoute
            ? (v.narration ? `${contraRoute} • ${v.narration}` : contraRoute)
            : v.narration || (isReceipt ? 'Payment Received' : 'Payment Disbursed'),
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

  // 2. Real-Time Search & Type / Status / Date Filtering (R2)
  const filteredActivities = useMemo(() => {
    return allActivities.filter((item) => {
      // 0. Date Range Filter
      if (dateRange.start || dateRange.end) {
        const itemYmd = toNormalizedDateStr(item.date, item.timestamp);
        if (!isDateInRange(itemYmd, dateRange.start, dateRange.end)) {
          return false;
        }
      }

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
  }, [allActivities, dateRange, txTypeFilter, txStatusFilter, searchQuery]);

  // Progressive batching for large datasets (preserves visual containment and prevents UI lag)
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Collapsible Filters State
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const activeFiltersCount = useMemo(() => {
    return (
      (txTypeFilter !== 'ALL' ? 1 : 0) +
      (txStatusFilter !== 'ALL' ? 1 : 0) +
      (datePreset !== 'ALL_TIME' ? 1 : 0)
    );
  }, [txTypeFilter, txStatusFilter, datePreset]);

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, txTypeFilter, txStatusFilter, datePreset, customStart, customEnd]);

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
      const url = getWhatsAppShareUrl(item.rawInvoice, company, party?.phone, party);
      safeOpenExternalUrl(url);
    } else if (item.type === 'PURCHASE' && item.rawPurchase) {
      const pur = item.rawPurchase;
      const supplier = item.partyId ? activeParties.find((p) => p.id === item.partyId) : undefined;
      const cleanPhone = (supplier?.phone || '').replace(/\D/g, '');
      const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      const text = buildPurchaseWhatsAppMessage(pur, company, supplier);
      const url = `https://wa.me/${phoneParam}?text=${encodeURIComponent(text)}`;
      safeOpenExternalUrl(url);
    } else if (item.type === 'VOUCHER' && item.rawVoucher) {
      const v = item.rawVoucher;
      const vParty = v.partyId ? activeParties.find((p) => p.id === v.partyId) : undefined;
      const text = buildPaymentVoucherWhatsAppMessage(v, vParty, company, undefined, { heading: 'Voucher Summary' });
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
    <div className="flex flex-col w-full px-3 sm:px-4 md:px-6 gap-3 sm:gap-4 pt-3 pb-28 sm:pb-6 max-w-7xl mx-auto">
      {/* 2 & 3. Unified Financial Snapshot & Quick Actions (Responsive Tablet Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-stretch">
        {/* Left: Financial Overview Card - Light High-Contrast Card */}
        <section className="md:col-span-8 bg-white dark:bg-surface-container-lowest text-on-surface rounded-2xl p-3 sm:p-3.5 shadow-sm border border-outline-variant/40 flex flex-col justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/20">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Financial Overview
            </span>

            <button
              type="button"
              onClick={() => onNavigateTab('reports')}
              className="text-slate-600 hover:text-emerald-700 text-xs font-bold flex items-center gap-0.5 cursor-pointer transition-colors"
            >
              <span>Reports</span>
              <span className="material-symbols-outlined text-[15px]">chevron_right</span>
            </button>
          </div>

          {/* Primary Metric: Total Sales Panel */}
          <div
            onClick={() => onNavigateTab('sales')}
            className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer group"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] sm:text-xs text-slate-600 uppercase font-bold tracking-wider">
                Total Sales
              </span>
              <span className="font-tabular-data text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5 group-hover:text-emerald-700 transition-colors">
                {formatINR(totalSales)}
              </span>
            </div>

            <div className="flex items-center gap-1 text-emerald-700 text-xs font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl group-hover:bg-emerald-100 transition-all flex-shrink-0 ml-2">
              <span>Sales Hub</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </div>
          </div>

          {/* Cash Flow Balance: 2-Column Split (To Collect vs To Pay) */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {/* To Collect (Receivables) - Money In (Emerald) */}
            <div
              onClick={() => {
                if (onNavigateToParties) {
                  onNavigateToParties('CUSTOMERS', debtorParties.length > 0 ? 'OVERDUE' : 'ALL');
                } else {
                  onNavigateTab('parties');
                }
              }}
              className="p-2.5 sm:p-3 rounded-xl bg-emerald-50/70 hover:bg-emerald-50 border border-emerald-200 flex flex-col cursor-pointer active:scale-98 transition-all group min-w-0"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-xs text-emerald-700 font-bold uppercase tracking-wider flex items-center gap-1 truncate">
                  <span className="material-symbols-outlined text-[14px] flex-shrink-0">south_west</span>
                  <span className="truncate">To Collect</span>
                </span>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-md flex-shrink-0">
                  {debtorParties.length}
                </span>
              </div>

              <span className="font-tabular-data text-sm sm:text-base md:text-lg font-black text-emerald-700 mt-1.5 truncate">
                {formatINR(totalReceivables)}
              </span>
            </div>

            {/* To Pay (Payables) - Money Out (Rose) */}
            <div
              onClick={() => {
                if (onNavigateToParties) {
                  onNavigateToParties('SUPPLIERS', creditorParties.length > 0 ? 'OVERDUE' : 'ALL');
                } else {
                  onNavigateTab('parties');
                }
              }}
              className="p-2.5 sm:p-3 rounded-xl bg-rose-50/70 hover:bg-rose-50 border border-rose-200 flex flex-col cursor-pointer active:scale-98 transition-all group min-w-0"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-xs text-rose-700 font-bold uppercase tracking-wider flex items-center gap-1 truncate">
                  <span className="material-symbols-outlined text-[14px] flex-shrink-0">north_east</span>
                  <span className="truncate">To Pay</span>
                </span>
                <span className="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded-md flex-shrink-0">
                  {creditorParties.length}
                </span>
              </div>

              <span className="font-tabular-data text-sm sm:text-base md:text-lg font-black text-rose-700 mt-1.5 truncate">
                {formatINR(totalPayables)}
              </span>
            </div>
          </div>

          {/* Cash & Bank Quick Strip */}
          <div
            onClick={() => onNavigateTab('cash_bank')}
            className="flex items-center justify-between p-2 sm:p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
                <span className="material-symbols-outlined text-[17px]">account_balance</span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-slate-900 truncate">Cash & Bank Balance</span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div className="flex flex-col items-end">
                <span
                  data-testid="dashboard-cash-bank-balance"
                  className="font-tabular-data text-xs sm:text-sm font-bold text-slate-900"
                >
                  {formatINR(totalCashBankBalance || 0)}
                </span>
                {totalCashBankBalance < 0 && (
                  <span
                    data-testid="dashboard-cash-bank-negative-note"
                    title="Recorded entries, not a calculation error. Open Cash & Bank → Reconcile."
                    aria-label="Recorded entries, not a calculation error. Open Cash & Bank → Reconcile."
                    className="text-[10px] text-amber-700 font-medium"
                  >
                    Negative ledger balance
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-slate-600 group-hover:text-emerald-700 font-bold text-xs group-hover:underline">
                <span className="hidden sm:inline">Passbook</span>
                <span className="material-symbols-outlined text-[15px]">chevron_right</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right: Configurable Quick Action Buttons (max 8) */}
        <section className="md:col-span-4 bg-surface-container-lowest rounded-2xl p-3 sm:p-3.5 shadow-sm border border-outline-variant/30 flex flex-col justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/20">
            <span className="font-bold text-xs uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-secondary"></span>
              Quick Actions
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {quickActionDefinitions.map((action, index) => {
              const isPrimary = index === 0;
              return (
                <button
                  key={action.id}
                  data-quick-action={action.id}
                  onClick={() => handleQuickAction(action.id)}
                  type="button"
                  aria-label={action.label}
                  className={`flex flex-col items-center justify-center gap-0.5 sm:gap-1 h-14 sm:h-16 p-1 sm:p-1.5 rounded-xl active:scale-95 transition-all cursor-pointer ${
                    isPrimary
                      ? 'bg-secondary text-on-secondary shadow-sm'
                      : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 shadow-xs hover:border-secondary'
                  }`}
                  title={action.description}
                >
                  <span
                    aria-hidden="true"
                    className={`material-symbols-outlined text-[18px] sm:text-[20px] leading-none ${isPrimary ? '' : action.accentClass}`}
                  >
                    {action.icon}
                  </span>
                  <span className="font-bold text-[9px] sm:text-[10px] leading-tight truncate w-full text-center px-0.5">
                    {action.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* 4. Unified Multi-Entity Business Activity Timeline (R1, R2, R3) */}
      <section className="bg-slate-50 dark:bg-surface-container-low rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col">
        {/* Sticky Timeline Filter Header */}
        <div className="sticky top-0 z-10 bg-slate-50/95 dark:bg-surface-container-low/95 backdrop-blur-md p-3.5 sm:p-4 border-b border-outline-variant/20 rounded-t-2xl flex flex-col gap-2.5 sm:gap-3 shadow-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-secondary">history</span>
              <span className="font-bold text-sm sm:text-base text-on-surface">
                Business Activity Timeline
              </span>
              <span className="text-xs bg-surface-container-low px-2 py-0.5 rounded-full text-on-surface-variant font-bold">
                {filteredActivities.length} of {allActivities.length}
              </span>
            </div>

          </div>

          {/* Real-Time Live Search Input & Expandable Filter Button */}
          <div className="flex items-center gap-2 w-full">
            <div className="relative flex-1 min-w-0">
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
                  aria-label="Clear search"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </div>

            {/* Compact Expandable Filter Button */}
            <button
              type="button"
              onClick={() => setIsFilterExpanded((prev) => !prev)}
              aria-expanded={isFilterExpanded}
              aria-label="Filter"
              className={`min-h-[44px] px-3 sm:px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shrink-0 active:scale-95 ${
                activeFiltersCount > 0
                  ? 'bg-secondary/15 border-secondary text-secondary'
                  : isFilterExpanded
                  ? 'bg-surface-container border-outline-variant/60 text-on-surface'
                  : 'bg-surface-container-low/80 border-outline-variant/30 text-on-surface hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              <span>Filter</span>
              {activeFiltersCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-secondary text-on-secondary text-[10px] flex items-center justify-center font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Collapsible Filter Dropdowns Bar */}
          <div className={`${isFilterExpanded ? 'grid grid-cols-1 sm:grid-cols-3' : 'hidden'} gap-1.5 sm:gap-2 w-full pt-1 transition-all`}>
            {/* Entity Type Dropdown */}
            <div className="relative flex-1 min-w-0">
              <select
                id="timeline-filter-type"
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value as TxTypeFilter)}
                className={`w-full appearance-none min-h-[38px] pl-2.5 pr-6 sm:pr-7 rounded-xl border text-xs font-semibold transition-all cursor-pointer truncate ${
                  txTypeFilter !== 'ALL'
                    ? 'bg-secondary/15 border-secondary text-secondary font-bold'
                    : 'bg-surface-container-low/80 border-outline-variant/30 text-on-surface hover:border-outline-variant/60'
                }`}
                aria-label="Filter by transaction type"
              >
                <option value="ALL">All Types ({allActivities.length})</option>
                <option value="SALES">Sales ({salesCount})</option>
                <option value="PURCHASES">Purchases ({purchasesCount})</option>
                <option value="VOUCHERS">Vouchers ({vouchersCount})</option>
                <option value="EXPENSES">Expenses ({expensesCount})</option>
                <option value="VOUCHERS_EXPENSES">Vouchers &amp; Exp ({vouchersAndExpensesCount})</option>
              </select>
              <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant pointer-events-none">
                expand_more
              </span>
            </div>

            {/* Payment Settlement Status Dropdown */}
            <div className="relative flex-1 min-w-0">
              <select
                id="timeline-filter-status"
                value={txStatusFilter}
                onChange={(e) => setTxStatusFilter(e.target.value as TxStatusFilter)}
                className={`w-full appearance-none min-h-[38px] pl-2.5 pr-6 sm:pr-7 rounded-xl border text-xs font-semibold transition-all cursor-pointer truncate ${
                  txStatusFilter !== 'ALL'
                    ? 'bg-secondary/15 border-secondary text-secondary font-bold'
                    : 'bg-surface-container-low/80 border-outline-variant/30 text-on-surface hover:border-outline-variant/60'
                }`}
                aria-label="Filter by payment status"
              >
                <option value="ALL">All Status</option>
                <option value="UNPAID">Unpaid ({unpaidCount})</option>
                <option value="PAID">Paid ({paidCount})</option>
              </select>
              <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant pointer-events-none">
                expand_more
              </span>
            </div>

            {/* Date Range / Period Dropdown */}
            <div className="relative flex-1 min-w-0">
              <select
                id="timeline-filter-period"
                value={datePreset}
                onChange={(e) => {
                  const val = e.target.value as DatePreset;
                  if (val === 'CUSTOM') {
                    setIsDateModalOpen(true);
                  } else {
                    const bounds = getDateFilterBounds(val);
                    setDatePreset(val);
                    setCustomStart(bounds.start);
                    setCustomEnd(bounds.end);
                  }
                }}
                className={`w-full appearance-none min-h-[38px] pl-2.5 pr-6 sm:pr-7 rounded-xl border text-xs font-semibold transition-all cursor-pointer truncate ${
                  datePreset !== 'ALL_TIME'
                    ? 'bg-secondary/15 border-secondary text-secondary font-bold'
                    : 'bg-surface-container-low/80 border-outline-variant/30 text-on-surface hover:border-outline-variant/60'
                }`}
                aria-label="Filter by date period"
              >
                <option value="ALL_TIME">All Time</option>
                <option value="TODAY">Today</option>
                <option value="THIS_WEEK">This Week</option>
                <option value="THIS_MONTH">This Month</option>
                <option value="CUSTOM">{datePreset === 'CUSTOM' ? `Custom: ${dateRange.label}` : 'Custom Date...'}</option>
              </select>
              <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant pointer-events-none">
                expand_more
              </span>
            </div>

            {/* Custom Date Modal Trigger Button when custom active */}
            {datePreset === 'CUSTOM' && (
              <button
                type="button"
                onClick={() => setIsDateModalOpen(true)}
                className="min-h-[38px] px-2 rounded-xl bg-secondary text-on-secondary text-xs flex items-center justify-center shrink-0 cursor-pointer shadow-xs active:scale-95 transition-all"
                title="Edit Custom Date Range"
                aria-label="Edit Custom Date Range"
              >
                <span className="material-symbols-outlined text-[16px]">edit_calendar</span>
              </button>
            )}

            {/* Quick Reset Button when any filter is active */}
            {(txTypeFilter !== 'ALL' || txStatusFilter !== 'ALL' || datePreset !== 'ALL_TIME' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setTxTypeFilter('ALL');
                  setTxStatusFilter('ALL');
                  setDatePreset('ALL_TIME');
                  setCustomStart('');
                  setCustomEnd('');
                  setSearchQuery('');
                }}
                className="min-h-[38px] px-2.5 rounded-xl border border-outline-variant/30 text-outline hover:text-error hover:border-error/40 bg-surface-container-low hover:bg-surface-container text-xs font-semibold flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                title="Reset all filters"
                aria-label="Reset all filters"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                <span className="hidden sm:inline text-[11px] ml-1">Reset</span>
              </button>
            )}
          </div>

          {/* Accessible helper buttons for screen readers & programmatic automation */}
          <div className="sr-only" aria-hidden="true">
            {[
              { preset: 'ALL_TIME' as DatePreset, label: 'All Time' },
              { preset: 'TODAY' as DatePreset, label: 'Today' },
              { preset: 'THIS_WEEK' as DatePreset, label: 'This Week' },
              { preset: 'THIS_MONTH' as DatePreset, label: 'This Month' },
              { preset: 'CUSTOM' as DatePreset, label: 'Custom Date' },
            ].map(({ preset, label }) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  if (preset === 'CUSTOM') {
                    setIsDateModalOpen(true);
                  } else {
                    const bounds = getDateFilterBounds(preset);
                    setDatePreset(preset);
                    setCustomStart(bounds.start);
                    setCustomEnd(bounds.end);
                  }
                }}
                className="rounded-full"
              >
                {label}
              </button>
            ))}
            <button onClick={() => setTxTypeFilter('ALL')} type="button" className="rounded-full">All ({allActivities.length})</button>
            <button onClick={() => setTxTypeFilter('SALES')} type="button" className="rounded-full">Sales ({salesCount})</button>
            <button onClick={() => setTxTypeFilter('PURCHASES')} type="button" className="rounded-full">Purchases ({purchasesCount})</button>
            <button onClick={() => setTxTypeFilter('VOUCHERS')} type="button" className="rounded-full">Vouchers ({vouchersCount})</button>
            <button onClick={() => setTxTypeFilter('EXPENSES')} type="button" className="rounded-full">Expenses ({expensesCount})</button>
            <button onClick={() => setTxTypeFilter('VOUCHERS_EXPENSES')} type="button" className="rounded-full">Vouchers/Expenses ({vouchersAndExpensesCount})</button>
            <button onClick={() => setTxStatusFilter('ALL')} type="button" className="rounded-full">All</button>
            <button onClick={() => setTxStatusFilter('UNPAID')} type="button" className="rounded-full">Unpaid ({unpaidCount})</button>
            <button onClick={() => setTxStatusFilter('PAID')} type="button" className="rounded-full">Paid ({paidCount})</button>
          </div>
        </div>

        {/* Transactions Feed List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5 p-3 sm:p-3.5">
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
                {allActivities.length > 0 && (txTypeFilter !== 'ALL' || txStatusFilter !== 'ALL' || datePreset !== 'ALL_TIME') && (
                  <button
                    onClick={() => {
                      setTxTypeFilter('ALL');
                      setTxStatusFilter('ALL');
                      setDatePreset('ALL_TIME');
                      setCustomStart('');
                      setCustomEnd('');
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

              const isReturn =
                item.typeLabel === 'Sales Return' ||
                item.typeLabel === 'Purchase Return' ||
                item.typeLabel.includes('Return');

              // Type Badge Colors for Light Card
              const typeBadgeClass =
                isReturn
                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                  : item.type === 'SALE'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : item.type === 'PURCHASE'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : item.type === 'VOUCHER'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200';

              const overdueDays =
                item.dueDate && (item.balanceAmount || 0) > 0.01 && item.paymentStatus !== 'PAID'
                  ? getOverdueDays(item.dueDate)
                  : 0;

              return (
                <div
                  key={item.id}
                  onClick={() => handleCardClick(item)}
                  style={{
                    contentVisibility: 'auto',
                    containIntrinsicSize: '1px 72px',
                  }}
                  className="p-3 rounded-xl bg-white dark:bg-surface-container-lowest hover:bg-slate-100/70 active:bg-slate-200/60 border border-outline-variant/30 hover:border-outline-variant/60 shadow-xs hover:shadow-sm flex flex-col justify-between gap-2 cursor-pointer transition-all group"
                >
                  {/* Top line: Badges on left, Date on right */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar py-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${typeBadgeClass} whitespace-nowrap shrink-0`}>
                        {item.typeLabel}
                      </span>

                      {overdueDays > 0 && (
                        <span
                          data-testid="overdue-badge"
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap shrink-0"
                        >
                          <span className="material-symbols-outlined text-[11px]">schedule</span>
                          <span>{overdueDays} days overdue</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-slate-500 font-medium">
                        {formatDate(item.date) || '—'}
                      </span>
                      <button
                        type="button"
                        title="Share Receipt"
                        aria-label="Share receipt"
                        onClick={(e) => handleShareClick(e, item)}
                        className="min-h-[44px] min-w-[44px] -my-2 flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded-lg active:scale-95 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">share</span>
                      </button>
                    </div>
                  </div>

                  {/* Main Details Line: Left (Party & Doc #), Right (Amount & Status/Due) */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    {/* Left: Party Name & Doc Number */}
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-on-surface truncate group-hover:text-emerald-700 transition-colors">
                        {item.partyName}
                      </span>
                      <span className="font-mono font-medium text-[11px] text-slate-600 truncate mt-0.5">
                        {item.identifier}
                      </span>
                    </div>

                    {/* Right: Amount & Status / Due */}
                    <div className="flex flex-col items-end flex-shrink-0 text-right">
                      <span
                        className={`font-tabular-data text-xs sm:text-sm font-black whitespace-nowrap ${
                          isMoneyIn ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {isMoneyIn ? '+' : '-'} {formatINR(item.amount)}
                      </span>

                      <div className="flex items-center gap-1.5 mt-0.5 justify-end">
                        <span
                          className={`h-5 px-1.5 rounded-full inline-flex items-center justify-center text-[10px] font-bold leading-none whitespace-nowrap shrink-0 ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isPartial
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          <span className="leading-none">{item.paymentStatus}</span>
                        </span>

                        {hasBalance && item.balanceAmount && (
                          <span className="text-[10px] font-semibold text-rose-700 whitespace-nowrap shrink-0 leading-none">
                            Due: {formatINR(item.balanceAmount)}
                          </span>
                        )}
                      </div>
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
        <React.Suspense fallback={null}>
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
        </React.Suspense>
      )}

      {/* 2. Voucher Details Modal */}
      {selectedVoucherForModal && (
        <React.Suspense fallback={null}>
          <DashboardVoucherModal
            voucher={selectedVoucherForModal}
            company={company}
            parties={activeParties}
            onClose={() => setSelectedVoucherForModal(null)}
          />
        </React.Suspense>
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
      {/* 5. Date Filter Modal */}
      <DateFilterModal
        isOpen={isDateModalOpen}
        activePreset={datePreset}
        customStartDate={customStart}
        customEndDate={customEnd}
        onClose={() => setIsDateModalOpen(false)}
        onSelectRange={(preset, start, end) => {
          setDatePreset(preset);
          setCustomStart(start || '');
          setCustomEnd(end || '');
        }}
        accentColor="secondary"
      />

      {/* 6. Add New Party Modal */}
      <AddEditPartyModal
        isOpen={isAddPartyOpen}
        editingParty={null}
        parties={activeParties}
        onClose={() => setIsAddPartyOpen(false)}
        onSave={(party) => {
          onSaveParty?.(party);
          setIsAddPartyOpen(false);
        }}
      />
    </div>
  );
};

export const DashboardView = React.memo(DashboardViewComponent);
