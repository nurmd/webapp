export type DashboardQuickActionId =
  | 'SALE_BILL'
  | 'QUICK_POS'
  | 'NEW_INVOICE'
  | 'PURCHASE'
  | 'ADD_PARTY'
  | 'ITEMS'
  | 'EXPENSES'
  | 'PAYMENT_IN'
  | 'PAYMENT_OUT'
  | 'CASH_BANK'
  | 'REPORTS';

export interface DashboardQuickActionDefinition {
  id: DashboardQuickActionId;
  label: string;
  icon: string; // Material Symbols name
  accentClass: string;
  description: string;
}

export const DASHBOARD_QUICK_ACTIONS: Record<DashboardQuickActionId, DashboardQuickActionDefinition> = {
  SALE_BILL: {
    id: 'SALE_BILL',
    label: 'Sale Bill',
    icon: 'receipt_long',
    accentClass: 'text-secondary',
    description: 'Open the sales ledger',
  },
  QUICK_POS: {
    id: 'QUICK_POS',
    label: 'Quick POS',
    icon: 'point_of_sale',
    accentClass: 'text-secondary',
    description: 'Start a fast counter sale',
  },
  NEW_INVOICE: {
    id: 'NEW_INVOICE',
    label: 'New Invoice',
    icon: 'note_add',
    accentClass: 'text-secondary',
    description: 'Create a new tax invoice',
  },
  PURCHASE: {
    id: 'PURCHASE',
    label: 'Purchase',
    icon: 'shopping_bag',
    accentClass: 'text-orange-600 dark:text-orange-400',
    description: 'Open the purchase ledger',
  },
  ADD_PARTY: {
    id: 'ADD_PARTY',
    label: 'Add Party',
    icon: 'person_add',
    accentClass: 'text-on-surface-variant',
    description: 'Open customers & suppliers',
  },
  ITEMS: {
    id: 'ITEMS',
    label: 'Items',
    icon: 'inventory_2',
    accentClass: 'text-sky-600 dark:text-sky-400',
    description: 'Open inventory & items',
  },
  EXPENSES: {
    id: 'EXPENSES',
    label: 'Expenses',
    icon: 'payments',
    accentClass: 'text-rose-600 dark:text-rose-400',
    description: 'Open expense records',
  },
  PAYMENT_IN: {
    id: 'PAYMENT_IN',
    label: 'Payment In',
    icon: 'south_west',
    accentClass: 'text-emerald-600 dark:text-emerald-400',
    description: 'Open payment-in vouchers',
  },
  PAYMENT_OUT: {
    id: 'PAYMENT_OUT',
    label: 'Payment Out',
    icon: 'north_east',
    accentClass: 'text-rose-600 dark:text-rose-400',
    description: 'Open payment-out vouchers',
  },
  CASH_BANK: {
    id: 'CASH_BANK',
    label: 'Cash & Bank',
    icon: 'account_balance',
    accentClass: 'text-sky-600 dark:text-sky-400',
    description: 'Open cash & bank ledger',
  },
  REPORTS: {
    id: 'REPORTS',
    label: 'Reports',
    icon: 'bar_chart',
    accentClass: 'text-violet-600 dark:text-violet-400',
    description: 'Open business reports',
  },
};

export const MAX_DASHBOARD_QUICK_ACTIONS = 6;

export const DEFAULT_DASHBOARD_QUICK_ACTIONS: DashboardQuickActionId[] = [
  'SALE_BILL',
  'QUICK_POS',
  'PURCHASE',
  'ADD_PARTY',
];

export function normalizeDashboardQuickActions(ids?: unknown): DashboardQuickActionId[] {
  if (!Array.isArray(ids)) {
    return [...DEFAULT_DASHBOARD_QUICK_ACTIONS];
  }

  const validCatalogKeys = new Set(Object.keys(DASHBOARD_QUICK_ACTIONS));
  const seen = new Set<DashboardQuickActionId>();
  const result: DashboardQuickActionId[] = [];

  for (const item of ids) {
    if (typeof item === 'string' && validCatalogKeys.has(item)) {
      const actionId = item as DashboardQuickActionId;
      if (!seen.has(actionId)) {
        seen.add(actionId);
        result.push(actionId);
        if (result.length >= MAX_DASHBOARD_QUICK_ACTIONS) {
          break;
        }
      }
    }
  }

  if (result.length === 0) {
    return [...DEFAULT_DASHBOARD_QUICK_ACTIONS];
  }

  return result;
}
