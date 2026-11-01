import { ExpenseCategory } from '../../models/expense.ts';

export interface CategoryMeta {
  icon: string;
  tint: string;
}

export const EXPENSE_CATEGORY_META: Record<ExpenseCategory, CategoryMeta> = {
  'Rent & Utilities': {
    icon: 'home_work',
    tint: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  },
  'Electricity & Water': {
    icon: 'bolt',
    tint: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  },
  'Transport & Logistics': {
    icon: 'local_shipping',
    tint: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900',
  },
  'Salaries & Wages': {
    icon: 'badge',
    tint: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  },
  'Packaging & Courier': {
    icon: 'inventory_2',
    tint: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900',
  },
  'Repairs & Maintenance': {
    icon: 'build',
    tint: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900',
  },
  'Tea, Coffee & Refreshments': {
    icon: 'coffee',
    tint: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
  },
  'Marketing & Advertising': {
    icon: 'campaign',
    tint: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900',
  },
  'Software & Telecom': {
    icon: 'devices',
    tint: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
  },
  'General Operational': {
    icon: 'storefront',
    tint: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900',
  },
};

export const getExpenseCategoryMeta = (category?: string): CategoryMeta => {
  if (category && category in EXPENSE_CATEGORY_META) {
    return EXPENSE_CATEGORY_META[category as ExpenseCategory];
  }
  return {
    icon: 'receipt_long',
    tint: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  };
};

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank / NEFT',
  CREDIT_CARD: 'Card',
};

