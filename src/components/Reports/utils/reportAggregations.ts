import { Invoice } from '../../../models/invoice.ts';
import { PurchaseBill } from '../../../models/purchase.ts';
import { Expense, ExpenseCategory } from '../../../models/expense.ts';
import { InventoryItem } from '../../../models/item.ts';
import { computeAgingBreakdown, AgingBreakdownResult, AgingBucket } from '../../../core/accounting/aging.ts';
import { DatePreset, getDateFilterBounds } from '../../../core/utils/dateFilters.ts';

export const ALL_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Rent & Utilities',
  'Electricity & Water',
  'Transport & Logistics',
  'Salaries & Wages',
  'Packaging & Courier',
  'Repairs & Maintenance',
  'Tea, Coffee & Refreshments',
  'Marketing & Advertising',
  'Software & Telecom',
  'General Operational',
];

export interface BillProfitResult {
  cogs: number;
  grossProfit: number;
  marginPct: number;
}

export interface ItemWiseSalesSummary {
  itemId: string;
  name: string;
  hsnCode: string;
  unit: string;
  quantitySold: number;
  taxableRevenue: number;
  taxAmount: number;
  grossSalesAmount: number;
  totalCogs: number;
  grossProfit: number;
  marginPct: number;
  currentStock: number;
}

export interface StockValuationSummary {
  totalItems: number;
  totalQuantity: number;
  purchaseValuation: number;
  saleValuation: number;
  potentialGrossProfit: number;
  potentialMarginPct: number;
  needRestockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  negativeStockCount: number;
}

export interface ExpenseCategorySummary {
  category: ExpenseCategory | string;
  count: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  percentageShare: number;
  itcClaimable: number;
}

export interface ExpenseAggregationsResult {
  categories: ExpenseCategorySummary[];
  totalExpense: number;
  totalTaxable: number;
  totalTax: number;
  cashOutflow: number;
  bankOutflow: number;
  totalItc: number;
}

export interface Gstr3bSummary {
  outwardTaxable: number;
  outwardCgst: number;
  outwardSgst: number;
  outwardIgst: number;
  outwardCess: number;
  totalOutwardTax: number;
  itcCgst: number;
  itcSgst: number;
  itcIgst: number;
  itcCess: number;
  totalItc: number;
  ineligibleItc175: number;
  ineligibleItcOthers: number;
  netCgstPayable: number;
  netSgstPayable: number;
  netIgstPayable: number;
  netCessPayable: number;
  netCashPayable: number;
}

/**
 * Calculates Cost of Goods Sold (COGS), Gross Profit, and Margin % for an individual invoice.
 * COGS is computed as sum(quantity * item.purchasePrice).
 */
export function calculateBillProfit(
  invoice: Invoice,
  itemsMap: Map<string, InventoryItem>
): BillProfitResult {
  let cogs = 0;

  for (const line of invoice.items || []) {
    const matchedItem = line.itemId ? itemsMap.get(line.itemId) : undefined;
    const costPrice = matchedItem?.purchasePrice ?? 0;
    cogs += line.quantity * costPrice;
  }

  cogs = Math.round(cogs * 100) / 100;

  // Use taxable amount as net sales revenue
  const revenue = invoice.totalTaxableAmount || (invoice.grandTotal - (invoice.totalTax || 0));
  const grossProfit = Math.round((revenue - cogs) * 100) / 100;
  const marginPct = revenue > 0 ? Math.round(((grossProfit / revenue) * 100) * 100) / 100 : 0;

  return {
    cogs,
    grossProfit,
    marginPct,
  };
}

/**
 * Aggregates Item-Wise Sales across all non-cancelled sales invoices in the selected period.
 */
export function aggregateItemWiseSales(
  invoices: Invoice[],
  itemsMap: Map<string, InventoryItem>
): ItemWiseSalesSummary[] {
  const map = new Map<string, ItemWiseSalesSummary>();

  for (const inv of invoices) {
    if (inv.isCancelled) continue;

    // Credit notes reduce quantity and revenue, Debit notes increase them
    const isCreditNote = inv.invoiceType === 'CREDIT_NOTE';
    const isDebitNote = inv.invoiceType === 'DEBIT_NOTE';
    const multiplier = isCreditNote ? -1 : 1;

    for (const line of inv.items || []) {
      const key = line.itemId || line.name;
      const matched = line.itemId ? itemsMap.get(line.itemId) : undefined;
      const costPrice = matched?.purchasePrice ?? 0;

      const existing = map.get(key) || {
        itemId: line.itemId || key,
        name: line.name || 'Unnamed Item',
        hsnCode: line.hsnSacCode || matched?.hsnSacCode || '-',
        unit: line.unit || matched?.unit || 'PCS',
        quantitySold: 0,
        taxableRevenue: 0,
        taxAmount: 0,
        grossSalesAmount: 0,
        totalCogs: 0,
        grossProfit: 0,
        marginPct: 0,
        currentStock: matched?.currentStock ?? 0,
      };

      const lineTax = (line.cgstAmount || 0) + (line.sgstAmount || 0) + (line.utgstAmount || 0) + (line.igstAmount || 0) + (line.cessAmount || 0);

      existing.quantitySold += multiplier * line.quantity;
      existing.taxableRevenue += multiplier * line.taxableAmount;
      existing.taxAmount += multiplier * lineTax;
      existing.grossSalesAmount += multiplier * line.totalAmount;
      existing.totalCogs += multiplier * (line.quantity * costPrice);

      map.set(key, existing);
    }
  }

  const result: ItemWiseSalesSummary[] = [];

  for (const item of map.values()) {
    item.quantitySold = Math.round(item.quantitySold * 100) / 100;
    item.taxableRevenue = Math.round(item.taxableRevenue * 100) / 100;
    item.taxAmount = Math.round(item.taxAmount * 100) / 100;
    item.grossSalesAmount = Math.round(item.grossSalesAmount * 100) / 100;
    item.totalCogs = Math.round(item.totalCogs * 100) / 100;

    item.grossProfit = Math.round((item.taxableRevenue - item.totalCogs) * 100) / 100;
    item.marginPct = item.taxableRevenue > 0
      ? Math.round(((item.grossProfit / item.taxableRevenue) * 100) * 100) / 100
      : 0;

    result.push(item);
  }

  // Sort descending by taxable revenue
  return result.sort((a, b) => b.taxableRevenue - a.taxableRevenue);
}

/**
 * Calculates full inventory stock valuation comparing purchase cost vs potential sale value.
 */
export function aggregateStockValuation(items: InventoryItem[]): StockValuationSummary {
  let totalQuantity = 0;
  let purchaseValuation = 0;
  let saleValuation = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let negativeStockCount = 0;

  for (const item of items) {
    if (item.isDisabled || item.isActive === false) continue;

    const stock = item.currentStock || 0;
    totalQuantity += stock;

    if (stock > 0) {
      purchaseValuation += stock * (item.purchasePrice || 0);
      saleValuation += stock * (item.salePrice || 0);
    }

    const threshold = item.minStockAlert ?? 5;
    if (stock <= 0) {
      if (stock === 0) outOfStockCount++;
      else negativeStockCount++;
    } else if (stock <= threshold) {
      lowStockCount++;
    }
  }

  purchaseValuation = Math.round(purchaseValuation * 100) / 100;
  saleValuation = Math.round(saleValuation * 100) / 100;
  const potentialGrossProfit = Math.round((saleValuation - purchaseValuation) * 100) / 100;
  const potentialMarginPct = saleValuation > 0
    ? Math.round(((potentialGrossProfit / saleValuation) * 100) * 100) / 100
    : 0;

  const needRestockCount = lowStockCount + outOfStockCount + negativeStockCount;

  return {
    totalItems: items.filter((i) => !i.isDisabled && i.isActive !== false).length,
    totalQuantity: Math.round(totalQuantity * 100) / 100,
    purchaseValuation,
    saleValuation,
    potentialGrossProfit,
    potentialMarginPct,
    needRestockCount,
    lowStockCount,
    outOfStockCount,
    negativeStockCount,
  };
}

/**
 * Aggregates expenses across all 10 standard categories, computing share %, tax breakdown,
 * ITC claimable, and Cash vs Bank outflow bifurcation.
 */
export function aggregateExpenseCategories(expenses: Expense[]): ExpenseAggregationsResult {
  const catMap = new Map<string, { count: number; taxable: number; tax: number; total: number; itc: number }>();

  // Pre-seed all 10 standard categories so they are guaranteed present
  for (const cat of ALL_EXPENSE_CATEGORIES) {
    catMap.set(cat, { count: 0, taxable: 0, tax: 0, total: 0, itc: 0 });
  }

  let totalExpense = 0;
  let totalTaxable = 0;
  let totalTax = 0;
  let cashOutflow = 0;
  let bankOutflow = 0;
  let totalItc = 0;

  for (const exp of expenses) {
    const cat = exp.category || 'General Operational';
    const amount = Number(exp.amount) || 0;
    const taxable = Number(exp.taxableAmount || exp.amount) || 0;
    const tax = Number(exp.taxAmount) || 0;
    const itc = exp.itcEligible && tax > 0 ? tax : 0;

    totalExpense += amount;
    totalTaxable += taxable;
    totalTax += tax;
    totalItc += itc;

    if (exp.paymentMode === 'CASH') {
      cashOutflow += amount;
    } else {
      bankOutflow += amount;
    }

    const current = catMap.get(cat) || { count: 0, taxable: 0, tax: 0, total: 0, itc: 0 };
    current.count += 1;
    current.taxable += taxable;
    current.tax += tax;
    current.total += amount;
    current.itc += itc;
    catMap.set(cat, current);
  }

  totalExpense = Math.round(totalExpense * 100) / 100;
  totalTaxable = Math.round(totalTaxable * 100) / 100;
  totalTax = Math.round(totalTax * 100) / 100;
  cashOutflow = Math.round(cashOutflow * 100) / 100;
  bankOutflow = Math.round(bankOutflow * 100) / 100;
  totalItc = Math.round(totalItc * 100) / 100;

  const categories: ExpenseCategorySummary[] = [];

  for (const [catName, data] of catMap.entries()) {
    const percentageShare = totalExpense > 0
      ? Math.round(((data.total / totalExpense) * 100) * 100) / 100
      : 0;

    categories.push({
      category: catName,
      count: data.count,
      taxableAmount: Math.round(data.taxable * 100) / 100,
      taxAmount: Math.round(data.tax * 100) / 100,
      totalAmount: Math.round(data.total * 100) / 100,
      percentageShare,
      itcClaimable: Math.round(data.itc * 100) / 100,
    });
  }

  // Sort by total amount descending
  categories.sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    categories,
    totalExpense,
    totalTaxable,
    totalTax,
    cashOutflow,
    bankOutflow,
    totalItc,
  };
}

/**
 * Computes official monthly/quarterly GSTR-3B tax liability, ITC reconciliation, and Net Cash payable.
 */
export function aggregateGstr3b(
  invoices: Invoice[],
  purchases: PurchaseBill[],
  expenses: Expense[]
): Gstr3bSummary {
  // 1. Outward Tax Supplies (Table 3.1)
  const regularSales = invoices.filter(
    (i) => !i.isCancelled && i.invoiceType !== 'CREDIT_NOTE' && i.invoiceType !== 'DEBIT_NOTE'
  );
  const creditNotes = invoices.filter((i) => !i.isCancelled && i.invoiceType === 'CREDIT_NOTE');
  const debitNotes = invoices.filter((i) => !i.isCancelled && i.invoiceType === 'DEBIT_NOTE');

  const regTaxable = regularSales.reduce((s, i) => s + (i.totalTaxableAmount || 0), 0);
  const cnTaxable = creditNotes.reduce((s, i) => s + (i.totalTaxableAmount || 0), 0);
  const dnTaxable = debitNotes.reduce((s, i) => s + (i.totalTaxableAmount || 0), 0);
  const outwardTaxable = Math.max(0, Math.round((regTaxable + dnTaxable - cnTaxable) * 100) / 100);

  const regCgst = regularSales.reduce((s, i) => s + (i.totalCgst || 0), 0);
  const cnCgst = creditNotes.reduce((s, i) => s + (i.totalCgst || 0), 0);
  const dnCgst = debitNotes.reduce((s, i) => s + (i.totalCgst || 0), 0);
  const outwardCgst = Math.max(0, Math.round((regCgst + dnCgst - cnCgst) * 100) / 100);

  const regSgst = regularSales.reduce((s, i) => s + (i.totalSgst || i.totalUtgst || 0), 0);
  const cnSgst = creditNotes.reduce((s, i) => s + (i.totalSgst || i.totalUtgst || 0), 0);
  const dnSgst = debitNotes.reduce((s, i) => s + (i.totalSgst || i.totalUtgst || 0), 0);
  const outwardSgst = Math.max(0, Math.round((regSgst + dnSgst - cnSgst) * 100) / 100);

  const regIgst = regularSales.reduce((s, i) => s + (i.totalIgst || 0), 0);
  const cnIgst = creditNotes.reduce((s, i) => s + (i.totalIgst || 0), 0);
  const dnIgst = debitNotes.reduce((s, i) => s + (i.totalIgst || 0), 0);
  const outwardIgst = Math.max(0, Math.round((regIgst + dnIgst - cnIgst) * 100) / 100);

  const regCess = regularSales.reduce((s, i) => s + (i.totalCess || 0), 0);
  const cnCess = creditNotes.reduce((s, i) => s + (i.totalCess || 0), 0);
  const dnCess = debitNotes.reduce((s, i) => s + (i.totalCess || 0), 0);
  const outwardCess = Math.max(0, Math.round((regCess + dnCess - cnCess) * 100) / 100);

  const totalOutwardTax = Math.round((outwardCgst + outwardSgst + outwardIgst + outwardCess) * 100) / 100;

  // 2. Eligible ITC (Table 4)
  const eligiblePurchases = purchases.filter(
    (p) => !p.isCancelled && p.itcEligibility !== 'INELIGIBLE_17_5' && p.itcEligibility !== 'INELIGIBLE_OTHERS'
  );
  const purchaseCgst = eligiblePurchases.reduce((s, p) => s + (p.totalCgst || 0), 0);
  const purchaseSgst = eligiblePurchases.reduce((s, p) => s + (p.totalSgst || p.totalUtgst || 0), 0);
  const purchaseIgst = eligiblePurchases.reduce((s, p) => s + (p.totalIgst || 0), 0);
  const purchaseCess = eligiblePurchases.reduce((s, p) => s + (p.totalCess || 0), 0);

  const eligibleExpenses = expenses.filter((e) => e.itcEligible && (e.taxAmount || 0) > 0);
  const expenseCgst = eligibleExpenses.reduce((s, e) => s + (e.cgstAmount || 0), 0);
  const expenseSgst = eligibleExpenses.reduce((s, e) => s + (e.sgstAmount || 0), 0);
  const expenseIgst = eligibleExpenses.reduce((s, e) => s + (e.igstAmount || 0), 0);

  const itcCgst = Math.round((purchaseCgst + expenseCgst) * 100) / 100;
  const itcSgst = Math.round((purchaseSgst + expenseSgst) * 100) / 100;
  const itcIgst = Math.round((purchaseIgst + expenseIgst) * 100) / 100;
  const itcCess = Math.round(purchaseCess * 100) / 100;
  const totalItc = Math.round((itcCgst + itcSgst + itcIgst + itcCess) * 100) / 100;

  // Ineligible ITC under section 17(5) and others
  const ineligible175 = purchases
    .filter((p) => !p.isCancelled && p.itcEligibility === 'INELIGIBLE_17_5')
    .reduce((s, p) => s + (p.totalTax || 0), 0);
  const ineligibleOthers = purchases
    .filter((p) => !p.isCancelled && p.itcEligibility === 'INELIGIBLE_OTHERS')
    .reduce((s, p) => s + (p.totalTax || 0), 0);

  // 3. Payment of Tax (Table 6.1 Net Cash Payable after ITC offset)
  const netCgstPayable = Math.max(0, Math.round((outwardCgst - itcCgst) * 100) / 100);
  const netSgstPayable = Math.max(0, Math.round((outwardSgst - itcSgst) * 100) / 100);
  const netIgstPayable = Math.max(0, Math.round((outwardIgst - itcIgst) * 100) / 100);
  const netCessPayable = Math.max(0, Math.round((outwardCess - itcCess) * 100) / 100);
  const netCashPayable = Math.round((netCgstPayable + netSgstPayable + netIgstPayable + netCessPayable) * 100) / 100;

  return {
    outwardTaxable,
    outwardCgst,
    outwardSgst,
    outwardIgst,
    outwardCess,
    totalOutwardTax,
    itcCgst,
    itcSgst,
    itcIgst,
    itcCess,
    totalItc,
    ineligibleItc175: Math.round(ineligible175 * 100) / 100,
    ineligibleItcOthers: Math.round(ineligibleOthers * 100) / 100,
    netCgstPayable,
    netSgstPayable,
    netIgstPayable,
    netCessPayable,
    netCashPayable,
  };
}

export interface TradingProfitAndStockSummary {
  grossProfit: number;
  grossMarginPct: number;
  netProfit: number;
  netMarginPct: number;
  totalSales: number;
  grossSales: number;
  salesBillCount: number;
  totalPurchases: number;
  purchasesBillCount: number;
  openingStockValue: number;
  openingStockQuantity: number;
  closingStockValue: number;
  closingStockQuantity: number;
  totalCogs: number;
  totalExpenses: number;
}

/**
 * Calculates comprehensive Trading Profit & Loss and Stock Valuation summary for the top performance card:
 * Gross Profit, Net Profit, Sales, Purchases, Opening Stock, and Closing Stock.
 */
export function computeTradingProfitAndStockSummary(
  invoices: Invoice[],
  purchases: PurchaseBill[],
  expenses: Expense[],
  items: InventoryItem[]
): TradingProfitAndStockSummary {
  // Items map for fast item lookups
  const itemsMap = new Map<string, InventoryItem>();
  for (const item of items) {
    itemsMap.set(item.id, item);
    if (item.name) itemsMap.set(item.name.toLowerCase(), item);
  }

  // 1. Sales & COGS calculation
  let totalSales = 0;
  let grossSales = 0;
  let totalCogs = 0;
  let validSalesCount = 0;

  // Track item quantities sold in this period
  const itemSoldQtyMap = new Map<string, number>();

  for (const inv of invoices) {
    if (inv.isCancelled) continue;
    if (inv.invoiceType === 'ESTIMATE' || inv.invoiceType === 'SALES_ORDER' || inv.invoiceType === 'DELIVERY_CHALLAN') {
      continue;
    }

    const isCreditNote = inv.invoiceType === 'CREDIT_NOTE';
    const multiplier = isCreditNote ? -1 : 1;

    const taxable = inv.totalTaxableAmount || (inv.grandTotal - (inv.totalTax || 0));
    totalSales += taxable * multiplier;
    grossSales += (inv.grandTotal || 0) * multiplier;

    if (!isCreditNote) {
      validSalesCount++;
    }

    const { cogs } = calculateBillProfit(inv, itemsMap);
    totalCogs += cogs * multiplier;

    // Track per-item sold quantity
    if (inv.items && Array.isArray(inv.items)) {
      for (const line of inv.items) {
        const id = line.itemId || line.name?.toLowerCase();
        if (id) {
          const prev = itemSoldQtyMap.get(id) || 0;
          itemSoldQtyMap.set(id, prev + (line.quantity || 0) * multiplier);
        }
      }
    }
  }

  // 2. Purchases calculation
  let totalPurchases = 0;
  let validPurchasesCount = 0;
  const itemPurchasedQtyMap = new Map<string, number>();

  for (const pur of purchases) {
    if (pur.isCancelled) continue;
    totalPurchases += pur.grandTotal || 0;
    validPurchasesCount++;

    if (pur.items && Array.isArray(pur.items)) {
      for (const line of pur.items) {
        const id = line.itemId || line.name?.toLowerCase();
        if (id) {
          const prev = itemPurchasedQtyMap.get(id) || 0;
          itemPurchasedQtyMap.set(id, prev + (line.quantity || 0));
        }
      }
    }
  }

  // 3. Stock Valuations (Opening & Closing)
  let closingStockValue = 0;
  let closingStockQuantity = 0;
  let openingStockValue = 0;
  let openingStockQuantity = 0;

  for (const item of items) {
    if (item.isDisabled) continue;

    const currentQty = Math.max(0, item.currentStock || 0);
    const purchaseCost = item.purchasePrice || 0;

    closingStockQuantity += currentQty;
    closingStockValue += currentQty * purchaseCost;

    // Opening Stock = Current Stock + Sold in Period - Purchased in Period
    const sold = itemSoldQtyMap.get(item.id) || itemSoldQtyMap.get(item.name?.toLowerCase()) || 0;
    const purchased = itemPurchasedQtyMap.get(item.id) || itemPurchasedQtyMap.get(item.name?.toLowerCase()) || 0;
    const openingQty = Math.max(0, currentQty + sold - purchased);

    openingStockQuantity += openingQty;
    openingStockValue += openingQty * purchaseCost;
  }

  // 4. Operating Expenses
  const expSummary = aggregateExpenseCategories(expenses);
  const totalExpenses = expSummary.totalExpense;

  // Rounding and profit calculations
  totalSales = Math.round(totalSales * 100) / 100;
  grossSales = Math.round(grossSales * 100) / 100;
  totalPurchases = Math.round(totalPurchases * 100) / 100;
  totalCogs = Math.round(totalCogs * 100) / 100;
  closingStockValue = Math.round(closingStockValue * 100) / 100;
  closingStockQuantity = Math.round(closingStockQuantity * 100) / 100;
  openingStockValue = Math.round(openingStockValue * 100) / 100;
  openingStockQuantity = Math.round(openingStockQuantity * 100) / 100;

  const grossProfit = Math.round((totalSales - totalCogs) * 100) / 100;
  const grossMarginPct = totalSales > 0 ? Math.round(((grossProfit / totalSales) * 100) * 10) / 10 : 0;

  const netProfit = Math.round((grossProfit - totalExpenses) * 100) / 100;
  const netMarginPct = totalSales > 0 ? Math.round(((netProfit / totalSales) * 100) * 10) / 10 : 0;

  return {
    grossProfit,
    grossMarginPct,
    netProfit,
    netMarginPct,
    totalSales,
    grossSales,
    salesBillCount: validSalesCount,
    totalPurchases,
    purchasesBillCount: validPurchasesCount,
    openingStockValue,
    openingStockQuantity,
    closingStockValue,
    closingStockQuantity,
    totalCogs,
    totalExpenses,
  };
}

export type PerformanceGranularity = 'MONTH' | 'WEEK' | 'DAY';

export interface PerformanceIntervalPoint {
  label: string;
  fullDate?: string;
  sales: number;
  purchases: number;
  grossProfit: number;
  netProfit: number;
  closingStock: number;
  openingStock: number;
}

export interface PerformanceTimeSeriesResult {
  granularity: PerformanceGranularity;
  granularityLabel: string;
  points: PerformanceIntervalPoint[];
}

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Computes time-series intervals for the Business Performance graph:
 * - 'MONTH': If date filter is set to year (THIS_FY, ALL_TIME) or custom range >= 180 days (half-year)
 * - 'WEEK': If date range exceeds a month (> 31 days, e.g. THIS_QUARTER)
 * - 'DAY': For the rest (<= 31 days, e.g. THIS_MONTH, TODAY, YESTERDAY, custom <= 31 days)
 */
export function computePerformanceTimeSeries(
  invoices: Invoice[],
  purchases: PurchaseBill[],
  expenses: Expense[],
  items: InventoryItem[],
  datePreset: DatePreset,
  customStart?: string,
  customEnd?: string
): PerformanceTimeSeriesResult {
  const bounds = getDateFilterBounds(datePreset, customStart, customEnd);
  const startStr = bounds.start;
  const endStr = bounds.end;

  const dStart = new Date(`${startStr}T00:00:00Z`);
  const dEnd = new Date(`${endStr}T00:00:00Z`);
  const diffDays = Math.max(1, Math.round((dEnd.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  let granularity: PerformanceGranularity = 'DAY';
  let granularityLabel = 'Daily Breakdown';

  if (datePreset === 'THIS_FY' || datePreset === 'ALL_TIME' || diffDays >= 180) {
    granularity = 'MONTH';
    granularityLabel = 'Monthly Breakdown';
  } else if (diffDays > 31 || datePreset === 'THIS_QUARTER') {
    granularity = 'WEEK';
    granularityLabel = 'Weekly Breakdown';
  } else {
    granularity = 'DAY';
    granularityLabel = diffDays === 1 ? 'Intraday Breakdown' : 'Daily Breakdown';
  }

  // Pre-build items map for COGS computation
  const itemsMap = new Map<string, InventoryItem>();
  let baseStockValue = 0;
  for (const item of items) {
    if (item.isDisabled) continue;
    itemsMap.set(item.id, item);
    if (item.name) itemsMap.set(item.name.toLowerCase(), item);
    baseStockValue += (item.currentStock || 0) * (item.purchasePrice || 0);
  }

  // Generate bucket intervals based on granularity
  const buckets: { start: string; end: string; label: string }[] = [];

  if (granularity === 'MONTH') {
    const [sY, sM] = startStr.split('-').map(Number);
    const [eY, eM] = endStr.split('-').map(Number);

    let curY = sY;
    let curM = sM;

    while (curY < eY || (curY === eY && curM <= eM)) {
      const lastDayOfMonth = new Date(curY, curM, 0).getDate();
      const padM = String(curM).padStart(2, '0');
      const mStart = `${curY}-${padM}-01`;
      const mEnd = `${curY}-${padM}-${String(lastDayOfMonth).padStart(2, '0')}`;

      const effectiveStart = mStart < startStr ? startStr : mStart;
      const effectiveEnd = mEnd > endStr ? endStr : mEnd;

      const label = sY !== eY ? `${MONTH_NAMES_SHORT[curM - 1]} '${String(curY).slice(2)}` : MONTH_NAMES_SHORT[curM - 1];

      buckets.push({
        start: effectiveStart,
        end: effectiveEnd,
        label,
      });

      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
    }
  } else if (granularity === 'WEEK') {
    let cur = new Date(dStart);
    while (cur <= dEnd) {
      const wStartStr = cur.toISOString().split('T')[0];
      const nextCur = new Date(cur);
      nextCur.setUTCDate(cur.getUTCDate() + 6);

      const wEnd = nextCur > dEnd ? new Date(dEnd) : nextCur;
      const wEndStr = wEnd.toISOString().split('T')[0];

      const dNum = cur.getUTCDate();
      const mName = MONTH_NAMES_SHORT[cur.getUTCMonth()];
      const label = `${dNum} ${mName}`;

      buckets.push({
        start: wStartStr,
        end: wEndStr,
        label,
      });

      cur.setUTCDate(cur.getUTCDate() + 7);
    }
  } else {
    // Granularity === 'DAY'
    if (startStr === endStr) {
      // Single-day view: 2 checkpoints (start of day baseline to end of day closing)
      const summary = computeTradingProfitAndStockSummary(invoices, purchases, expenses, items);
      return {
        granularity,
        granularityLabel,
        points: [
          {
            label: 'Start (₹0)',
            sales: 0,
            purchases: 0,
            grossProfit: 0,
            netProfit: 0,
            closingStock: summary.openingStockValue,
            openingStock: summary.openingStockValue,
          },
          {
            label: 'Closing',
            sales: summary.totalSales,
            purchases: summary.totalPurchases,
            grossProfit: summary.grossProfit,
            netProfit: summary.netProfit,
            closingStock: summary.closingStockValue,
            openingStock: summary.openingStockValue,
          },
        ],
      };
    }

    let cur = new Date(dStart);
    while (cur <= dEnd) {
      const dayStr = cur.toISOString().split('T')[0];
      const dNum = cur.getUTCDate();
      const mName = MONTH_NAMES_SHORT[cur.getUTCMonth()];
      const label = diffDays <= 14 ? `${dNum} ${mName}` : `${dNum}`;

      buckets.push({
        start: dayStr,
        end: dayStr,
        label,
      });

      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  // Aggregate metrics for each bucket
  let runningStock = baseStockValue;
  const points: PerformanceIntervalPoint[] = buckets.map((b) => {
    const bInvoices = invoices.filter((i) => i.date >= b.start && i.date <= b.end && !i.isCancelled);
    const bPurchases = purchases.filter((p) => p.date >= b.start && p.date <= b.end && !p.isCancelled);
    const bExpenses = expenses.filter((e) => e.date >= b.start && e.date <= b.end);

    let sales = 0;
    let cogs = 0;
    for (const inv of bInvoices) {
      if (inv.invoiceType === 'ESTIMATE' || inv.invoiceType === 'SALES_ORDER' || inv.invoiceType === 'DELIVERY_CHALLAN') continue;
      const mult = inv.invoiceType === 'CREDIT_NOTE' ? -1 : 1;
      const total = inv.grandTotal ?? 0;
      sales += total * mult;

      for (const it of inv.items || []) {
        const itemMaster = itemsMap.get(it.itemId) || itemsMap.get((it.name || '').toLowerCase());
        const unitCost = itemMaster?.purchasePrice ?? (it.unitPrice * 0.7);
        cogs += (it.quantity || 0) * unitCost * mult;
      }
    }

    let purchasesTotal = 0;
    for (const pur of bPurchases) {
      const total = pur.grandTotal ?? pur.totalGrossAmount ?? 0;
      purchasesTotal += total;
    }

    let expensesTotal = 0;
    for (const exp of bExpenses) {
      expensesTotal += exp.amount || 0;
    }

    sales = Math.round(sales * 100) / 100;
    purchasesTotal = Math.round(purchasesTotal * 100) / 100;
    cogs = Math.round(cogs * 100) / 100;
    expensesTotal = Math.round(expensesTotal * 100) / 100;

    const grossProfit = Math.round((sales - cogs) * 100) / 100;
    const netProfit = Math.round((grossProfit - expensesTotal) * 100) / 100;

    // Track stock variation
    runningStock = runningStock + purchasesTotal - cogs;

    return {
      label: b.label,
      fullDate: b.start,
      sales,
      purchases: purchasesTotal,
      grossProfit,
      netProfit,
      closingStock: Math.round(runningStock * 100) / 100,
      openingStock: baseStockValue,
    };
  });

  return {
    granularity,
    granularityLabel,
    points,
  };
}

