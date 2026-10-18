import { describe, it, expect } from 'vitest';
import {
  computePerformanceTimeSeries,
  PerformanceIntervalPoint,
} from '../components/Reports/utils/reportAggregations.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Expense } from '../models/expense.ts';
import { InventoryItem } from '../models/item.ts';

describe('Performance Time Series Interval Breakdown (performanceTimeSeriesIntervals.test.ts)', () => {
  const mockItems: InventoryItem[] = [
    {
      id: 'item-led',
      name: 'LED Panel 40W',
      sku: 'LED-40W',
      hsnSacCode: '8539',
      category: 'Lighting',
      unit: 'PCS',
      salePrice: 1000,
      purchasePrice: 600,
      gstRate: 18,
      currentStock: 50,
      minStockAlert: 10,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
    },
  ];

  const mockInvoices: Invoice[] = [
    {
      id: 'inv-apr',
      invoiceNumber: 'INV-2026-001',
      date: '2026-04-15',
      partyId: 'cust-1',
      partyName: 'Customer A',
      partyGstin: '',
      partyAddress: 'Main Road',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      invoiceType: 'B2B',
      paymentStatus: 'PAID',
      paymentMode: 'CASH',
      totalGrossAmount: 10000,
      totalDiscount: 0,
      totalTaxableAmount: 10000,
      totalCgst: 900,
      totalSgst: 900,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 1800,
      roundOff: 0,
      grandTotal: 11800,
      amountInWords: 'Eleven Thousand Eight Hundred Only',
      paidAmount: 11800,
      balanceAmount: 0,
      items: [
        {
          itemId: 'item-led',
          name: 'LED Panel 40W',
          hsnSacCode: '8539',
          unit: 'PCS',
          quantity: 10,
          unitPrice: 1000,
          taxableAmount: 10000,
          gstRate: 18,
          cgstAmount: 900,
          sgstAmount: 900,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 11800,
        },
      ],
      createdAt: '2026-04-15T10:00:00Z',
      updatedAt: '2026-04-15T10:00:00Z',
    },
    {
      id: 'inv-may',
      invoiceNumber: 'INV-2026-002',
      date: '2026-05-20',
      partyId: 'cust-2',
      partyName: 'Customer B',
      partyGstin: '',
      partyAddress: 'Main Road',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      invoiceType: 'B2B',
      paymentStatus: 'PAID',
      paymentMode: 'CASH',
      totalGrossAmount: 20000,
      totalDiscount: 0,
      totalTaxableAmount: 20000,
      totalCgst: 1800,
      totalSgst: 1800,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 3600,
      roundOff: 0,
      grandTotal: 23600,
      amountInWords: 'Twenty Three Thousand Six Hundred Only',
      paidAmount: 23600,
      balanceAmount: 0,
      items: [
        {
          itemId: 'item-led',
          name: 'LED Panel 40W',
          hsnSacCode: '8539',
          unit: 'PCS',
          quantity: 20,
          unitPrice: 1000,
          taxableAmount: 20000,
          gstRate: 18,
          cgstAmount: 1800,
          sgstAmount: 1800,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 23600,
        },
      ],
      createdAt: '2026-05-20T10:00:00Z',
      updatedAt: '2026-05-20T10:00:00Z',
    },
  ];

  const mockPurchases: PurchaseBill[] = [
    {
      id: 'pur-apr',
      billNumber: 'PUR-2026-001',
      date: '2026-04-10',
      supplierId: 'vendor-x',
      supplierName: 'Vendor X',
      supplierGstin: '',
      supplierAddress: '',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      itcEligibility: 'ELIGIBLE_INPUTS',
      isRcm: false,
      totalGrossAmount: 15000,
      totalDiscount: 0,
      totalTaxableAmount: 15000,
      totalCgst: 1350,
      totalSgst: 1350,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 2700,
      roundOff: 0,
      grandTotal: 17700,
      paidAmount: 17700,
      balanceAmount: 0,
      paymentStatus: 'PAID',
      paymentMode: 'BANK',
      items: [
        {
          itemId: 'item-led',
          name: 'LED Panel 40W',
          hsnSacCode: '8539',
          unit: 'PCS',
          quantity: 25,
          unitPrice: 600,
          taxableAmount: 15000,
          gstRate: 18,
          cgstAmount: 1350,
          sgstAmount: 1350,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 17700,
        },
      ],
      createdAt: '2026-04-10T10:00:00Z',
      updatedAt: '2026-04-10T10:00:00Z',
    },
  ];

  const mockExpenses: Expense[] = [
    {
      id: 'exp-apr',
      category: 'Rent & Utilities',
      title: 'Shop Rent April',
      amount: 5000,
      taxableAmount: 5000,
      gstRate: 0,
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      date: '2026-04-05',
      paymentMode: 'BANK_TRANSFER',
      itcEligible: false,
      createdAt: '2026-04-05T00:00:00Z',
    },
  ];

  it('1. Selects MONTH granularity when date filter is THIS_FY or ALL_TIME', () => {
    const resFY = computePerformanceTimeSeries(
      mockInvoices,
      mockPurchases,
      mockExpenses,
      mockItems,
      'THIS_FY'
    );

    expect(resFY.granularity).toBe('MONTH');
    expect(resFY.granularityLabel).toBe('Monthly Breakdown');
    expect(resFY.points.length).toBeGreaterThanOrEqual(12);

    const resAllTime = computePerformanceTimeSeries(
      mockInvoices,
      mockPurchases,
      mockExpenses,
      mockItems,
      'ALL_TIME'
    );
    expect(resAllTime.granularity).toBe('MONTH');
    expect(resAllTime.granularityLabel).toBe('Monthly Breakdown');
  });

  it('2. Selects MONTH granularity when custom date range exceeds or equals 180 days (half-year)', () => {
    // 2026-01-01 to 2026-07-15 is ~196 days >= 180 days
    const resCustomHalfYear = computePerformanceTimeSeries(
      mockInvoices,
      mockPurchases,
      mockExpenses,
      mockItems,
      'CUSTOM',
      '2026-01-01',
      '2026-07-15'
    );

    expect(resCustomHalfYear.granularity).toBe('MONTH');
    expect(resCustomHalfYear.granularityLabel).toBe('Monthly Breakdown');
    expect(resCustomHalfYear.points.length).toBe(7); // Jan, Feb, Mar, Apr, May, Jun, Jul
  });

  it('3. Selects WEEK granularity when date filter is THIS_QUARTER or range > 31 and < 180 days', () => {
    const resQuarter = computePerformanceTimeSeries(
      mockInvoices,
      mockPurchases,
      mockExpenses,
      mockItems,
      'THIS_QUARTER'
    );

    expect(resQuarter.granularity).toBe('WEEK');
    expect(resQuarter.granularityLabel).toBe('Weekly Breakdown');
    expect(resQuarter.points.length).toBeGreaterThanOrEqual(12);

    // Custom 60 days range (above 31, below 180)
    const resCustom60 = computePerformanceTimeSeries(
      mockInvoices,
      mockPurchases,
      mockExpenses,
      mockItems,
      'CUSTOM',
      '2026-04-01',
      '2026-05-30'
    );
    expect(resCustom60.granularity).toBe('WEEK');
    expect(resCustom60.granularityLabel).toBe('Weekly Breakdown');
    expect(resCustom60.points.length).toBeGreaterThanOrEqual(8);
  });

  it('4. Selects DAY granularity for the rest (<= 31 days: THIS_MONTH, TODAY, YESTERDAY, custom <= 31 days)', () => {
    const resMonth = computePerformanceTimeSeries(
      mockInvoices,
      mockPurchases,
      mockExpenses,
      mockItems,
      'THIS_MONTH'
    );

    expect(resMonth.granularity).toBe('DAY');
    expect(resMonth.granularityLabel).toBe('Daily Breakdown');
    expect(resMonth.points.length).toBeGreaterThanOrEqual(28);

    const resToday = computePerformanceTimeSeries(
      mockInvoices,
      mockPurchases,
      mockExpenses,
      mockItems,
      'TODAY'
    );
    expect(resToday.granularity).toBe('DAY');
    expect(resToday.granularityLabel).toBe('Intraday Breakdown');
    expect(resToday.points.length).toBe(2); // Start to Close

    const resYesterday = computePerformanceTimeSeries(
      mockInvoices,
      mockPurchases,
      mockExpenses,
      mockItems,
      'YESTERDAY'
    );
    expect(resYesterday.granularity).toBe('DAY');
    expect(resYesterday.points.length).toBe(2);

    // Custom 10 days range
    const resCustom10 = computePerformanceTimeSeries(
      mockInvoices,
      mockPurchases,
      mockExpenses,
      mockItems,
      'CUSTOM',
      '2026-04-01',
      '2026-04-10'
    );
    expect(resCustom10.granularity).toBe('DAY');
    expect(resCustom10.granularityLabel).toBe('Daily Breakdown');
    expect(resCustom10.points.length).toBe(10);
  });

  it('5. Correctly aggregates Sales, Purchases, Gross Profit, and Net Profit into month buckets', () => {
    // Custom range spanning April and May 2026 with >= 180 days to enforce monthly buckets
    const res = computePerformanceTimeSeries(
      mockInvoices,
      mockPurchases,
      mockExpenses,
      mockItems,
      'CUSTOM',
      '2026-04-01',
      '2026-10-31'
    );

    expect(res.granularity).toBe('MONTH');
    const aprPoint = res.points.find((p) => p.label.startsWith('Apr'));
    const mayPoint = res.points.find((p) => p.label.startsWith('May'));

    expect(aprPoint).toBeDefined();
    expect(mayPoint).toBeDefined();

    if (aprPoint && mayPoint) {
      // April: 1 invoice of 11,800, 1 purchase of 17,700, 1 expense of 5,000
      // 10 units sold * 600 cost = 6,000 COGS -> Gross Profit = 11,800 - 6,000 = 5,800
      // Net Profit = 5,800 - 5,000 (expense) = 800
      expect(aprPoint.sales).toBe(11800);
      expect(aprPoint.purchases).toBe(17700);
      expect(aprPoint.grossProfit).toBe(5800);
      expect(aprPoint.netProfit).toBe(800);

      // May: 1 invoice of 23,600, 0 purchases, 0 expenses
      // 20 units sold * 600 cost = 12,000 COGS -> Gross Profit = 23,600 - 12,000 = 11,600
      // Net Profit = 11,600 - 0 = 11,600
      expect(mayPoint.sales).toBe(23600);
      expect(mayPoint.purchases).toBe(0);
      expect(mayPoint.grossProfit).toBe(11600);
      expect(mayPoint.netProfit).toBe(11600);
    }
  });
});
