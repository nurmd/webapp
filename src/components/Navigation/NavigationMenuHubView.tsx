import React, { useState, useMemo } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem } from '../../models/item.ts';
import { Expense } from '../../models/expense.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { AppTab } from '../Shell/Drawer.tsx';
import { pouch, PouchSyncState } from '../../services/pouchdb.ts';
import { CURRENT_APP_VERSION } from '../../services/updateService.ts';

interface NavigationMenuHubViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseBill[];
  parties: Party[];
  items: InventoryItem[];
  expenses: Expense[];
  vouchers: Voucher[];
  onNavigate: (tab: AppTab) => void;
  onNavigateToParties?: (segment: 'CUSTOMERS' | 'SUPPLIERS', filter?: 'ALL' | 'OVERDUE' | 'SETTLED') => void;
  onNewInvoice: () => void;
  onOpenRoleSwitch?: () => void;
  onCheckUpdate?: () => void;
  hasUpdate?: boolean;
  latestVersion?: string;
  isCheckingUpdate?: boolean;
}

type HubCategory =
  | 'all'
  | 'sales'
  | 'purchases'
  | 'parties'
  | 'inventory'
  | 'accounting'
  | 'reports'
  | 'settings';

interface MenuItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  category: HubCategory;
  badge?: {
    text: string;
    type: 'neutral' | 'success' | 'warning' | 'error' | 'primary';
    pulse?: boolean;
  };
  action: () => void;
  keywords: string[];
}

export const NavigationMenuHubView: React.FC<NavigationMenuHubViewProps> = ({
  company,
  invoices,
  purchases,
  parties,
  items,
  expenses,
  vouchers,
  onNavigate,
  onNavigateToParties,
  onNewInvoice,
  onOpenRoleSwitch,
  onCheckUpdate,
  hasUpdate,
  latestVersion,
  isCheckingUpdate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HubCategory>('all');
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [syncState, setSyncState] = useState<PouchSyncState>(pouch.getSyncState());

  React.useEffect(() => {
    const unsub = pouch.subscribeSync((state) => {
      setSyncState(state);
    });
    return unsub;
  }, []);

  // Compute live business metrics
  const customers = useMemo(() => parties.filter((p) => p.type === 'CUSTOMER'), [parties]);
  const suppliers = useMemo(() => parties.filter((p) => p.type === 'SUPPLIER'), [parties]);

  const totalReceivable = useMemo(() => {
    return customers.reduce((sum, c) => {
      const bal = c.currentBalance || 0;
      return bal > 0 ? sum + bal : sum;
    }, 0);
  }, [customers]);

  const totalPayable = useMemo(() => {
    return suppliers.reduce((sum, s) => {
      const bal = s.currentBalance || 0;
      return bal < 0 ? sum + Math.abs(bal) : sum;
    }, 0);
  }, [suppliers]);

  const lowStockItems = useMemo(() => {
    return items.filter((item) => item.currentStock <= (item.minStockAlert || 5));
  }, [items]);

  const unpaidInvoicesCount = useMemo(() => {
    return invoices.filter((inv) => (inv.balanceAmount || 0) > 0).length;
  }, [invoices]);

  const unpaidPurchasesTotal = useMemo(() => {
    return purchases.reduce((acc, p) => acc + (p.balanceAmount || 0), 0);
  }, [purchases]);

  // Format currency helper
  const formatInr = (num: number): string => {
    if (num >= 100000) {
      return `₹${(num / 100000).toFixed(2)}L`;
    }
    if (num >= 1000) {
      return `₹${(num / 1000).toFixed(1)}k`;
    }
    return `₹${num.toLocaleString('en-IN')}`;
  };

  // Menu items master catalog
  const menuItems: MenuItem[] = useMemo(() => [
    // Sales & Billing
    {
      id: 'sale_invoices',
      title: 'Sale Invoices',
      subtitle: 'Create GST/Non-GST tax bills & e-way receipts',
      icon: 'receipt_long',
      category: 'sales',
      badge: unpaidInvoicesCount > 0
        ? { text: `${unpaidInvoicesCount} Pending`, type: 'error' }
        : { text: `${invoices.length} Bills`, type: 'neutral' },
      action: () => onNavigate('sales'),
      keywords: ['sales', 'bill', 'invoice', 'gst', 'tax', 'cash', 'credit', 'sales ledger', 'ledger'],
    },
    {
      id: 'quick_pos',
      title: 'Fast Retail POS Counter',
      subtitle: 'Rapid barcode punch, speed shelf & 1-tap checkout',
      icon: 'point_of_sale',
      category: 'sales',
      badge: { text: '1-Tap Rapid', type: 'success' },
      action: () => onNavigate('pos'),
      keywords: ['pos', 'counter', 'barcode', 'punch', 'retail', 'speed'],
    },
    {
      id: 'sale_quotation',
      title: 'Quotation / Estimate',
      subtitle: 'Convert estimates & proforma bills directly into invoices',
      icon: 'request_quote',
      category: 'sales',
      badge: { text: 'Drafts', type: 'neutral' },
      action: () => onNavigate('sales'),
      keywords: ['estimate', 'quote', 'quotation', 'proforma'],
    },
    {
      id: 'sale_orders',
      title: 'Sale Order',
      subtitle: 'Track pending customer delivery orders and status',
      icon: 'assignment',
      category: 'sales',
      action: () => onNavigate('sales'),
      keywords: ['order', 'booking', 'advance', 'sale order'],
    },
    {
      id: 'delivery_challan',
      title: 'Delivery Challan',
      subtitle: 'Goods dispatch documentation without immediate billing',
      icon: 'local_shipping',
      category: 'sales',
      action: () => onNavigate('sales'),
      keywords: ['challan', 'dispatch', 'transport', 'delivery'],
    },
    {
      id: 'sale_return',
      title: 'Sale Return (Credit Note)',
      subtitle: 'Customer returns, damaged goods & balance refunds',
      icon: 'assignment_return',
      category: 'sales',
      action: () => onNavigate('sales'),
      keywords: ['return', 'credit note', 'refund', 'replacement'],
    },

    // Purchases & Expenses
    {
      id: 'purchase_bills',
      title: 'Purchase Bills',
      subtitle: 'Inward inventory, supplier bills & ITC tax credits',
      icon: 'shopping_bag',
      category: 'purchases',
      badge: unpaidPurchasesTotal > 0
        ? { text: `${formatInr(unpaidPurchasesTotal)} due`, type: 'warning' }
        : { text: `${purchases.length} Inward`, type: 'neutral' },
      action: () => onNavigate('purchases'),
      keywords: ['purchase', 'vendor bill', 'inward', 'itc', 'procurement', 'purchase ledger', 'ledger'],
    },
    {
      id: 'purchase_orders',
      title: 'Purchase Orders',
      subtitle: 'Draft procurement purchase orders to authorized vendors',
      icon: 'add_shopping_cart',
      category: 'purchases',
      action: () => onNavigate('purchases'),
      keywords: ['po', 'purchase order', 'vendor order'],
    },
    {
      id: 'purchase_return',
      title: 'Purchase Return (Debit Note)',
      subtitle: 'Vendor return debit notes & supplier ledger adjustments',
      icon: 'assignment_turned_in',
      category: 'purchases',
      action: () => onNavigate('purchases'),
      keywords: ['debit note', 'purchase return', 'vendor credit'],
    },

    // Parties & Ledger
    {
      id: 'parties_customers',
      title: 'Customers',
      subtitle: `${customers.length} verified accounts & client ledgers`,
      icon: 'person',
      category: 'parties',
      badge: totalReceivable > 0
        ? { text: `${formatInr(totalReceivable)} to collect`, type: 'success' }
        : { text: 'All Cleared', type: 'neutral' },
      action: () => {
        if (onNavigateToParties) {
          onNavigateToParties('CUSTOMERS', 'ALL');
        } else {
          onNavigate('parties');
        }
      },
      keywords: ['customer', 'client', 'buyer', 'debtor', 'receivable'],
    },
    {
      id: 'parties_suppliers',
      title: 'Suppliers & Vendors',
      subtitle: `${suppliers.length} distributors, wholesalers & manufacturers`,
      icon: 'domain',
      category: 'parties',
      badge: totalPayable > 0
        ? { text: `${formatInr(totalPayable)} to pay`, type: 'error' }
        : { text: 'Settled', type: 'neutral' },
      action: () => {
        if (onNavigateToParties) {
          onNavigateToParties('SUPPLIERS', 'ALL');
        } else {
          onNavigate('parties');
        }
      },
      keywords: ['supplier', 'vendor', 'wholesaler', 'creditor', 'payable'],
    },
    {
      id: 'party_categories',
      title: 'Party Groups & Categories',
      subtitle: 'Distributors, Retailers, VIPs & Credit Terms',
      icon: 'groups',
      category: 'parties',
      action: () => onNavigate('parties'),
      keywords: ['group', 'category', 'vip', 'distributor'],
    },

    // Items & Inventory
    {
      id: 'inventory_items',
      title: 'Stock Items',
      subtitle: `${items.length} active SKUs, barcodes & units listed`,
      icon: 'inventory_2',
      category: 'inventory',
      badge: { text: `${items.length} SKUs`, type: 'neutral' },
      action: () => onNavigate('inventory'),
      keywords: ['items', 'products', 'goods', 'stock', 'sku', 'catalog'],
    },
    {
      id: 'inventory_pricing',
      title: 'Units & Multi-Tier Pricing',
      subtitle: 'Wholesale, Semi-Wholesale & Retail multi-tier rates',
      icon: 'straighten',
      category: 'inventory',
      action: () => onNavigate('inventory'),
      keywords: ['unit', 'pricing', 'tier', 'wholesale', 'mrp', 'rate'],
    },
    {
      id: 'barcode_catalog',
      title: 'Barcode Catalog & Labels',
      subtitle: 'Generate and scan thermal barcode labels & EAN codes',
      icon: 'barcode_scanner',
      category: 'inventory',
      action: () => onNavigate('pos'),
      keywords: ['barcode', 'scanner', 'label', 'ean', 'print code'],
    },
    {
      id: 'low_stock_alerts',
      title: 'Low Stock Alerts',
      subtitle: `${lowStockItems.length} items below minimum reorder threshold`,
      icon: 'notification_important',
      category: 'inventory',
      badge: lowStockItems.length > 0
        ? { text: `${lowStockItems.length} Critical`, type: 'error', pulse: true }
        : { text: 'Optimal', type: 'success' },
      action: () => onNavigate('inventory'),
      keywords: ['low stock', 'reorder', 'alert', 'shortage'],
    },

    // Accounting & Finance
    {
      id: 'cash_and_bank',
      title: 'Cash & Bank Accounts',
      subtitle: 'Cash in hand, UPI QR accounts & live bank passbook',
      icon: 'account_balance',
      category: 'accounting',
      badge: { text: 'Realtime', type: 'success' },
      action: () => onNavigate('cash_bank'),
      keywords: ['cash', 'bank', 'upi', 'account', 'ledger'],
    },
    {
      id: 'expense_tracker',
      title: 'Expense Tracker',
      subtitle: `${expenses.length} overhead expenses (Rent, Electricity, Salary)`,
      icon: 'receipt',
      category: 'accounting',
      action: () => onNavigate('expenses'),
      keywords: ['expense', 'overhead', 'salary', 'rent', 'petty cash'],
    },
    {
      id: 'cheques_vouchers',
      title: 'Daybook & Journal Vouchers',
      subtitle: `${vouchers.length} double-entry general journal transactions recorded`,
      icon: 'menu_book',
      category: 'accounting',
      action: () => onNavigate('accounting'),
      keywords: ['journal', 'voucher', 'daybook', 'cheque', 'audit'],
    },
    {
      id: 'loans_and_emi',
      title: 'Loans & EMIs',
      subtitle: 'Track principal repayment, interest ledger & collateral',
      icon: 'credit_score',
      category: 'accounting',
      action: () => onNavigate('accounting'),
      keywords: ['loan', 'emi', 'borrowing', 'interest'],
    },

    // Reports & GST Filing
    {
      id: 'gstr_filing',
      title: 'GSTR-1 & GSTR-3B Reports',
      subtitle: 'Auto-generated GST tax summaries for direct portal upload',
      icon: 'fact_check',
      category: 'reports',
      badge: { text: 'CA Ready', type: 'success' },
      action: () => onNavigate('reports'),
      keywords: ['gst', 'gstr1', 'gstr3b', 'tax report', 'ca', 'portal'],
    },
    {
      id: 'profit_loss',
      title: 'Profit & Loss Statement',
      subtitle: 'Real-time revenue, gross margin & operational net income',
      icon: 'trending_up',
      category: 'reports',
      action: () => onNavigate('reports'),
      keywords: ['profit', 'loss', 'p&l', 'margin', 'financials'],
    },
    {
      id: 'bill_wise_profit',
      title: 'Bill-Wise Profit Report',
      subtitle: 'Invoice-level revenue, COGS, gross profit & profit margin',
      icon: 'receipt_long',
      category: 'reports',
      badge: { text: 'New', type: 'primary' },
      action: () => onNavigate('reports'),
      keywords: ['bill profit', 'invoice profit', 'margin per bill', 'cogs', 'profitability'],
    },
    {
      id: 'daybook_balance_sheet',
      title: 'Balance Sheet & Trial Balance',
      subtitle: 'Assets, liabilities, equity & trial balance verification',
      icon: 'account_balance_wallet',
      category: 'reports',
      action: () => onNavigate('accounting'),
      keywords: ['balance sheet', 'trial balance', 'assets', 'liabilities'],
    },
    {
      id: 'stock_valuation',
      title: 'Stock Summary & FIFO Valuation',
      subtitle: 'Closing inventory valuation, cost of goods sold & aging',
      icon: 'summarize',
      category: 'reports',
      action: () => onNavigate('reports'),
      keywords: ['valuation', 'stock summary', 'fifo', 'inventory report'],
    },

    // Settings & Configuration
    {
      id: 'gst_settings',
      title: 'GST & Legal Tax Configuration',
      subtitle: 'Regular, Composition, reverse charge & HSN/SAC master',
      icon: 'tune',
      category: 'settings',
      action: () => {
        onNavigate('settings');
        setTimeout(() => {
          document.getElementById('gst-tax-config')?.scrollIntoView({ behavior: 'smooth' });
        }, 120);
      },
      keywords: ['tax', 'gstin', 'composition', 'hsn', 'settings'],
    },
    {
      id: 'print_themes',
      title: 'Print & Invoice Themes',
      subtitle: 'A4, A5, Thermal roll 58mm/80mm receipt templates',
      icon: 'palette',
      category: 'settings',
      action: () => onNavigate('settings'),
      keywords: ['print', 'thermal', 'template', 'format', 'invoice theme'],
    },
    {
      id: 'auto_backup_sync',
      title: 'Continuous CouchDB / IndexedDB Sync',
      subtitle: (syncState.status === 'synced' || syncState.status === 'syncing')
        ? 'Continuous 2-Way Multi-Device Live Sync Active'
        : '100% Offline-First IndexedDB Local Storage',
      icon: 'cloud_sync',
      category: 'settings',
      badge: (syncState.status === 'synced' || syncState.status === 'syncing')
        ? { text: 'Cloud Live', type: 'success' }
        : { text: 'Offline Ready', type: 'neutral' },
      action: () => onNavigate('settings'),
      keywords: ['sync', 'backup', 'cloud', 'couchdb', 'database'],
    },
    {
      id: 'staff_security',
      title: 'Staff Roles & PIN Lock Security',
      subtitle: 'Role-based access (Owner, Cashier, CA) & 4-digit PIN lock',
      icon: 'admin_panel_settings',
      category: 'settings',
      action: () => {
        if (onOpenRoleSwitch) onOpenRoleSwitch();
        else onNavigate('settings');
      },
      keywords: ['pin', 'staff', 'role', 'security', 'cashier', 'lock'],
    },
  ], [
    invoices,
    purchases,
    customers,
    suppliers,
    totalReceivable,
    totalPayable,
    items,
    lowStockItems,
    unpaidInvoicesCount,
    unpaidPurchasesTotal,
    expenses,
    vouchers,
    syncState,
    onNavigate,
    onOpenRoleSwitch,
  ]);

  // Filter items by search query and category
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesSubtitle = item.subtitle.toLowerCase().includes(q);
        const matchesKeyword = item.keywords.some((k) => k.toLowerCase().includes(q));
        return matchesTitle || matchesSubtitle || matchesKeyword;
      }
      return true;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  // Group filtered items by category for structured layout
  const sections = useMemo(() => [
    {
      key: 'sales',
      title: 'Sales & Billing',
      dotColor: 'bg-secondary',
      items: filteredItems.filter((i) => i.category === 'sales'),
    },
    {
      key: 'purchases',
      title: 'Purchases & Expenses',
      dotColor: 'bg-orange-500',
      items: filteredItems.filter((i) => i.category === 'purchases'),
    },
    {
      key: 'parties',
      title: 'Parties & Ledger',
      dotColor: 'bg-secondary',
      items: filteredItems.filter((i) => i.category === 'parties'),
    },
    {
      key: 'inventory',
      title: 'Items & Inventory',
      dotColor: 'bg-secondary',
      items: filteredItems.filter((i) => i.category === 'inventory'),
    },
    {
      key: 'accounting',
      title: 'Accounting & Finance',
      dotColor: 'bg-outline',
      items: filteredItems.filter((i) => i.category === 'accounting'),
    },
    {
      key: 'reports',
      title: 'Reports & GST Filing',
      dotColor: 'bg-secondary',
      items: filteredItems.filter((i) => i.category === 'reports'),
    },
    {
      key: 'settings',
      title: 'Settings & Configuration',
      dotColor: 'bg-outline',
      items: filteredItems.filter((i) => i.category === 'settings'),
    },
  ], [filteredItems]);

  const handleCopyReferral = () => {
    const text = `Join Vyapar PRO - Complete Offline GST Billing & Accounting App. Use my store referral for ₹500 welcome bonus! https://github.com/nurmd/webapp`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedReferral(true);
      setTimeout(() => setCopiedReferral(false), 2500);
    }
  };

  const getFiscalYear = (): string => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (April is 3)
    if (currentMonth >= 3) {
      return `${currentYear}–${(currentYear + 1).toString().slice(-2)}`;
    } else {
      return `${currentYear - 1}–${currentYear.toString().slice(-2)}`;
    }
  };

  return (
    <div className="flex flex-col w-full pb-10 bg-surface min-h-screen">
      <div className="px-3 sm:px-4 pt-3 flex flex-col gap-3.5 max-w-4xl mx-auto w-full">
        {/* Merchant Identity & Store Summary Card */}
        <div className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm border border-outline-variant/30 relative overflow-hidden">
          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="flex gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-secondary/15 flex items-center justify-center flex-shrink-0 text-secondary shadow-sm">
                <span className="material-symbols-outlined text-[28px]">storefront</span>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-headline-sm text-base sm:text-lg font-bold text-on-surface truncate">
                    {company.businessName || 'Shree Balaji Enterprises'}
                  </span>
                  <span
                    className="material-symbols-outlined text-secondary text-[18px] flex-shrink-0"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    verified
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full font-label-sm text-[11px] font-semibold flex items-center gap-1 ${
                    company.isGstEnabled === false
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      : 'bg-secondary-container text-on-secondary-container'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${company.isGstEnabled === false ? 'bg-amber-500' : 'bg-secondary'}`}></span>
                    {company.isGstEnabled === false ? 'Non-GST Store' : 'GSTIN Active'}
                  </span>
                  <span className="font-body-sm text-xs text-on-surface-variant truncate">
                    {company.tradeName || 'Wholesale & Retail'}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigate('settings')}
              className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant flex-shrink-0 active:scale-95 transition-transform cursor-pointer hover:bg-surface-container-high"
              title="Edit Business Profile"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
          </div>

          {/* Key Quick Metadata Strip */}
          <div className="mt-3.5 pt-2 border-t border-outline-variant/20 grid grid-cols-3 gap-2 relative z-10">
            <div className="p-2 rounded-xl bg-surface-container-low flex flex-col min-w-0">
              <span className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider">
                {company.isGstEnabled === false ? 'Tax Mode' : 'GST Reg.'}
              </span>
              <span className="font-tabular-data text-xs text-on-surface truncate font-semibold">
                {company.isGstEnabled === false ? 'Non-GST' : (company.gstin || '27AAAAA0000A1Z5')}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-surface-container-low flex flex-col min-w-0">
              <span className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider">
                Fiscal Year
              </span>
              <span className="font-tabular-data text-xs text-on-surface truncate font-semibold">
                {getFiscalYear()}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-secondary-container/50 flex flex-col justify-center min-w-0">
              <span className="font-label-sm text-[10px] text-on-secondary-container uppercase tracking-wider">
                Storage
              </span>
              <span className="font-label-sm text-xs text-secondary font-bold flex items-center gap-1 truncate">
                <span className="material-symbols-outlined text-[14px]">
                  {(syncState.status === 'synced' || syncState.status === 'syncing') ? 'cloud_done' : 'offline_pin'}
                </span>
                {(syncState.status === 'synced' || syncState.status === 'syncing') ? 'Cloud Live' : 'Offline 100%'}
              </span>
            </div>
          </div>
        </div>

        {/* Live Search Bar across all Navigation Modules */}
        <div className="relative">
          <div className="flex items-center bg-surface-container-lowest rounded-2xl px-3.5 py-2.5 shadow-sm border border-outline-variant/30 gap-2.5 focus-within:ring-2 focus-within:ring-secondary/40 transition-all">
            <span className="material-symbols-outlined text-on-surface-variant text-[22px] flex-shrink-0">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoices, reports, stock, accounts..."
              className="w-full bg-transparent font-body-md text-sm text-on-surface outline-none placeholder:text-outline"
            />
            {searchQuery.length > 0 && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-6 h-6 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Horizontal Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-xs font-semibold shadow-sm transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">all_inclusive</span>
            All Hubs
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('sales')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-xs font-semibold shadow-sm transition-all cursor-pointer ${
              selectedCategory === 'sales'
                ? 'bg-secondary text-on-secondary'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">point_of_sale</span>
            Sales
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('purchases')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-xs font-semibold shadow-sm transition-all cursor-pointer ${
              selectedCategory === 'purchases'
                ? 'bg-orange-600 text-white'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <span className={`material-symbols-outlined text-[16px] ${selectedCategory === 'purchases' ? 'text-white' : 'text-orange-600 dark:text-orange-400'}`}>shopping_bag</span>
            Purchases
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('parties')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-xs font-semibold shadow-sm transition-all cursor-pointer ${
              selectedCategory === 'parties'
                ? 'bg-secondary text-on-secondary'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">group</span>
            Parties
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('inventory')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-xs font-semibold shadow-sm transition-all cursor-pointer ${
              selectedCategory === 'inventory'
                ? 'bg-secondary text-on-secondary'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">inventory_2</span>
            Items
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('accounting')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-xs font-semibold shadow-sm transition-all cursor-pointer ${
              selectedCategory === 'accounting'
                ? 'bg-secondary text-on-secondary'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">account_balance</span>
            Finance
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('reports')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-xs font-semibold shadow-sm transition-all cursor-pointer ${
              selectedCategory === 'reports'
                ? 'bg-secondary text-on-secondary'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">analytics</span>
            Reports
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('settings')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-label-md text-xs font-semibold shadow-sm transition-all cursor-pointer ${
              selectedCategory === 'settings'
                ? 'bg-secondary text-on-secondary'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">settings</span>
            Settings
          </button>
        </div>

        {/* Action Button: Quick Add Bill CTA */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNewInvoice}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-secondary text-on-secondary font-label-md text-sm font-bold shadow-[0_4px_16px_rgba(0,108,73,0.25)] active:scale-98 transition-transform cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            Create New GST Invoice
          </button>

          <button
            type="button"
            onClick={() => onNavigate('pos')}
            className="px-4 py-3 rounded-2xl bg-surface-container-lowest text-secondary font-label-md text-sm font-bold border border-outline-variant/40 flex items-center gap-1.5 shadow-sm active:scale-98 transition-transform cursor-pointer hover:bg-surface-container-low"
            title="Fast POS Counter"
          >
            <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
            POS
          </button>
        </div>

        {/* Render Categorized Sections */}
        {sections.map((section) => {
          if (section.items.length === 0) return null;

          return (
            <section key={section.key} className="flex flex-col gap-2 mt-1">
              {/* Section Header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${section.dotColor}`}></span>
                  <span className="font-label-sm text-xs uppercase tracking-wider text-on-surface-variant font-bold">
                    {section.title}
                  </span>
                </div>
                <span className={`font-label-sm text-xs font-semibold ${section.key === 'purchases' ? 'text-orange-600 dark:text-orange-400' : 'text-secondary'}`}>
                  {section.items.length} {section.items.length === 1 ? 'module' : 'modules'}
                </span>
              </div>

              {/* Section Card List */}
              <div className="rounded-2xl bg-surface-container-lowest shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.action}
                    className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-surface-container-low/60 active:bg-surface-container-low transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-on-surface-variant flex-shrink-0 ${
                        section.key === 'purchases'
                          ? 'group-hover:text-orange-600 group-hover:bg-orange-500/15'
                          : 'group-hover:text-secondary group-hover:bg-secondary-container/40'
                      } transition-colors`}>
                        <span className="material-symbols-outlined text-[22px]">
                          {item.icon}
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0 flex-1 pr-2">
                        <span className="font-headline-sm text-sm sm:text-base font-bold text-on-surface truncate">
                          {item.title}
                        </span>
                        <span className="font-body-sm text-xs text-on-surface-variant/85 truncate">
                          {item.subtitle}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.badge && (
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-label-sm text-[11px] font-bold flex items-center gap-1 ${
                            item.badge.type === 'error'
                              ? 'bg-error-container text-on-error-container'
                              : item.badge.type === 'warning'
                              ? 'bg-amber-100 text-amber-900'
                              : item.badge.type === 'success'
                              ? 'bg-secondary-container text-on-secondary-container'
                              : 'bg-surface-container-high text-on-surface-variant'
                          }`}
                        >
                          {item.badge.pulse && (
                            <span className="w-1.5 h-1.5 rounded-full bg-error animate-ping"></span>
                          )}
                          {item.badge.text}
                        </span>
                      )}
                      <span className="material-symbols-outlined text-outline-variant text-[20px] group-hover:translate-x-0.5 transition-transform">
                        chevron_right
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        {/* Empty Search Results Message */}
        {filteredItems.length === 0 && (
          <div className="py-12 flex flex-col items-center justify-center text-center px-4 bg-surface-container-lowest rounded-2xl border border-outline-variant/30">
            <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant mb-2">
              <span className="material-symbols-outlined text-[26px]">search_off</span>
            </div>
            <span className="font-headline-sm text-base font-bold text-on-surface">
              No matching modules found
            </span>
            <p className="font-body-sm text-xs text-on-surface-variant max-w-xs mt-1">
              Could not find any navigation item matching "{searchQuery}". Try searching for invoices, stock, reports, or settings.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="mt-3 px-4 py-1.5 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-semibold cursor-pointer"
            >
              Reset Search Filter
            </button>
          </div>
        )}

        {/* Bonus / Refer & Earn Banner Card */}
        <div className="rounded-2xl bg-gradient-to-r from-secondary/15 via-secondary/10 to-surface-container-lowest p-4 shadow-sm border border-secondary/20 relative overflow-hidden">
          <div className="flex items-center justify-between gap-3 relative z-10">
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-secondary text-on-secondary font-label-sm text-[10px] font-bold">
                  Bonus
                </span>
                <span className="font-headline-sm text-sm sm:text-base font-bold text-on-surface truncate">
                  Refer & Earn ₹500
                </span>
              </div>
              <p className="font-body-sm text-xs text-on-surface-variant mt-1 line-clamp-2">
                Invite merchant friends to Vyapar PRO. Get ₹500 deposited directly into your bank on their first bill.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyReferral}
              className="px-3.5 py-2 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold flex-shrink-0 shadow-sm active:scale-95 transition-transform cursor-pointer"
            >
              {copiedReferral ? 'Copied Link!' : 'Invite Friends'}
            </button>
          </div>
        </div>

        {/* Assistance, Security & App Version Card */}
        <div className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[22px]">support_agent</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-headline-sm text-sm font-bold text-on-surface">
                  Need Assistance?
                </span>
                <span className="font-body-sm text-xs text-on-surface-variant truncate">
                  WhatsApp Support Helpline: 9AM – 8PM IST
                </span>
              </div>
            </div>

            <a
              href="https://wa.me/919999999999?text=Hello%20Vyapar%20PRO%20Support%20Team"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-surface-container-low text-secondary font-label-md text-xs font-bold flex items-center gap-1 hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">chat</span>
              WhatsApp
            </a>
          </div>

          <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between text-on-surface-variant font-label-sm text-xs">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-secondary">
                verified_user
              </span>
              <span>100% Offline Autonomy & Local Encryption</span>
            </div>

            <button
              type="button"
              onClick={onCheckUpdate}
              disabled={isCheckingUpdate}
              className={`font-bold hover:underline cursor-pointer flex items-center gap-1 ${
                hasUpdate ? 'text-amber-600 dark:text-amber-400' : 'text-secondary'
              }`}
            >
              <span>
                {isCheckingUpdate
                  ? 'Checking for Updates...'
                  : hasUpdate && latestVersion
                  ? `Update to v${latestVersion} Available`
                  : `Vyapar PRO v${CURRENT_APP_VERSION}`}
              </span>
              <span
                className={`material-symbols-outlined text-[14px] ${
                  hasUpdate ? 'animate-bounce text-amber-500' : isCheckingUpdate ? 'animate-spin' : ''
                }`}
              >
                {isCheckingUpdate ? 'sync' : 'system_update'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
