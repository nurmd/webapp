import { describe, it, expect } from 'vitest';
import {
  calculateBillProfit,
  aggregateItemWiseSales,
  aggregateStockValuation,
  aggregateExpenseCategories,
  aggregateGstr3b,
  ALL_EXPENSE_CATEGORIES,
} from '../components/Reports/utils/reportAggregations.ts';
import {
  getAgingBucket,
  getOverdueDays,
  computeAgingBreakdown,
  AgingItemInput,
} from '../core/accounting/aging.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Expense } from '../models/expense.ts';
import { InventoryItem } from '../models/item.ts';

describe('GSTR-3B, COGS, Aging & Stock Valuation Calculation Suite', () => {
  // =========================================================================
  // Dimension 1: Aging Bucket Boundaries & Date Handling
  // =========================================================================
  describe('Dimension 1: Aging Bucket Boundaries & Date Handling', () => {
    it('1.1: Exact boundaries for getAgingBucket: 0, 30, 31, 60, 61, 90, 91 days', () => {
      // Day 0
      expect(getAgingBucket(0)).toBe('0-30');
      // Exactly Day 30 boundary
      expect(getAgingBucket(30)).toBe('0-30');
      // Exactly Day 31 boundary
      expect(getAgingBucket(31)).toBe('31-60');
      // Exactly Day 60 boundary
      expect(getAgingBucket(60)).toBe('31-60');
      // Exactly Day 61 boundary
      expect(getAgingBucket(61)).toBe('61-90');
      // Exactly Day 90 boundary
      expect(getAgingBucket(90)).toBe('61-90');
      // Exactly Day 91 boundary
      expect(getAgingBucket(91)).toBe('90+');
      // Extreme overdue (e.g. 365 days)
      expect(getAgingBucket(365)).toBe('90+');
    });

    it('1.2: Future due dates (negative elapsed days) map safely to 0-30 bucket', () => {
      expect(getAgingBucket(-1)).toBe('0-30');
      expect(getAgingBucket(-15)).toBe('0-30');
      expect(getAgingBucket(-365)).toBe('0-30');
    });

    it('1.3: computeAgingBreakdown with exact boundary dates relative to asOfDate', () => {
      const fixedAsOf = new Date('2026-10-17T00:00:00Z');

      const items: AgingItemInput[] = [
        // Day 0: due today (2026-10-17) -> 0-30
        { date: '2026-10-01', dueDate: '2026-10-17', balanceDue: 100, partyId: 'P1', partyName: 'Party 1' },
        // Day 30: due 30 days ago (2026-09-17) -> 0-30
        { date: '2026-09-01', dueDate: '2026-09-17', balanceDue: 200, partyId: 'P1', partyName: 'Party 1' },
        // Day 31: due 31 days ago (2026-09-16) -> 31-60
        { date: '2026-09-01', dueDate: '2026-09-16', balanceDue: 300, partyId: 'P1', partyName: 'Party 1' },
        // Day 60: due 60 days ago (2026-08-18) -> 31-60
        { date: '2026-08-01', dueDate: '2026-08-18', balanceDue: 400, partyId: 'P1', partyName: 'Party 1' },
        // Day 61: due 61 days ago (2026-08-17) -> 61-90
        { date: '2026-08-01', dueDate: '2026-08-17', balanceDue: 500, partyId: 'P1', partyName: 'Party 1' },
        // Day 90: due 90 days ago (2026-07-19) -> 61-90
        { date: '2026-07-01', dueDate: '2026-07-19', balanceDue: 600, partyId: 'P1', partyName: 'Party 1' },
        // Day 91: due 91 days ago (2026-07-18) -> 90+
        { date: '2026-07-01', dueDate: '2026-07-18', balanceDue: 700, partyId: 'P1', partyName: 'Party 1' },
      ];

      const res = computeAgingBreakdown(items, fixedAsOf);

      expect(res.summary['0-30']).toBe(300); // 100 + 200
      expect(res.summary['31-60']).toBe(700); // 300 + 400
      expect(res.summary['61-90']).toBe(1100); // 500 + 600
      expect(res.summary['90+']).toBe(700); // 700
      expect(res.totalOutstanding).toBe(2800);
      expect(res.counts['0-30']).toBe(2);
      expect(res.counts['31-60']).toBe(2);
      expect(res.counts['61-90']).toBe(2);
      expect(res.counts['90+']).toBe(1);
    });

    it('1.4: Settled invoices (balanceDue = 0 or <= 0.01) are strictly excluded from totals and party lists', () => {
      const fixedAsOf = new Date('2026-10-17T00:00:00Z');
      const items: AgingItemInput[] = [
        { date: '2026-10-01', dueDate: '2026-10-10', balanceDue: 0, partyId: 'PAID-1', partyName: 'Zero Due' },
        { date: '2026-10-01', dueDate: '2026-10-10', balanceDue: 0.005, partyId: 'PAID-2', partyName: 'Half Paisa' },
        { date: '2026-10-01', dueDate: '2026-10-10', balanceDue: 0.01, partyId: 'PAID-3', partyName: 'One Paisa' },
        { date: '2026-10-01', dueDate: '2026-10-10', balanceDue: -150, partyId: 'CREDIT-1', partyName: 'Negative Balance' },
        { date: '2026-10-01', dueDate: '2026-10-10', balanceDue: 500, partyId: 'ACTIVE-1', partyName: 'Active Dues' },
      ];

      const res = computeAgingBreakdown(items, fixedAsOf);

      expect(res.totalOutstanding).toBe(500);
      expect(res.parties.length).toBe(1);
      expect(res.parties[0].partyId).toBe('ACTIVE-1');
      expect(res.parties[0].totalOutstanding).toBe(500);
      expect(res.summary['0-30']).toBe(500);
    });

    it('1.5: Future due dates in computeAgingBreakdown fall in 0-30 bracket', () => {
      const fixedAsOf = new Date('2026-10-17T00:00:00Z');
      const items: AgingItemInput[] = [
        { date: '2026-10-17', dueDate: '2026-11-15', balanceDue: 1200, partyId: 'FUT-1', partyName: 'Future Due 1' },
        { date: '2026-10-17', dueDate: '2027-01-01', balanceDue: 3500, partyId: 'FUT-2', partyName: 'Future Due 2' },
      ];

      const res = computeAgingBreakdown(items, fixedAsOf);

      expect(res.summary['0-30']).toBe(4700);
      expect(res.summary['31-60']).toBe(0);
      expect(res.summary['61-90']).toBe(0);
      expect(res.summary['90+']).toBe(0);
      expect(res.totalOutstanding).toBe(4700);
      expect(res.counts['0-30']).toBe(2);
    });

    it('1.6: getOverdueDays correctly reports 0 for today and future dates, positive count for past dates', () => {
      const today = new Date('2026-10-17T12:00:00Z');
      expect(getOverdueDays('2026-10-17', today)).toBe(0);
      expect(getOverdueDays('2026-10-18', today)).toBe(0);
      expect(getOverdueDays('2026-11-01', today)).toBe(0);
      expect(getOverdueDays('2026-10-16', today)).toBe(1);
      expect(getOverdueDays('2026-10-07', today)).toBe(10);
      expect(getOverdueDays(undefined, today)).toBe(0);
      expect(getOverdueDays('', today)).toBe(0);
    });

    it('1.7: computeAgingBreakdown falls back to invoice date when dueDate is omitted', () => {
      const fixedAsOf = new Date('2026-10-17T00:00:00Z');
      const items: AgingItemInput[] = [
        { date: '2026-09-02', balanceDue: 850, partyId: 'P-NODUE', partyName: 'No Due Date' }, // 45 days ago
      ];

      const res = computeAgingBreakdown(items, fixedAsOf);

      expect(res.summary['31-60']).toBe(850);
      expect(res.totalOutstanding).toBe(850);
      expect(res.counts['31-60']).toBe(1);
    });
  });

  // =========================================================================
  // Dimension 2: COGS & Margins Calculations
  // =========================================================================
  describe('Dimension 2: COGS & Margins Calculations', () => {
    const itemsMap = new Map<string, InventoryItem>([
      [
        'item-normal',
        {
          id: 'item-normal',
          name: 'Normal Item',
          sku: 'NORM-1',
          hsnSacCode: '8471',
          category: 'General',
          minStockAlert: 5,
          unit: 'PCS',
          salePrice: 1000,
          purchasePrice: 600,
          gstRate: 18,
          currentStock: 20,
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ],
      [
        'item-zero-cost',
        {
          id: 'item-zero-cost',
          name: 'Zero Cost Item',
          sku: 'ZERO-1',
          hsnSacCode: '8471',
          category: 'General',
          minStockAlert: 5,
          unit: 'PCS',
          salePrice: 500,
          purchasePrice: 0,
          gstRate: 18,
          currentStock: 10,
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ],
      [
        'item-expensive-cost',
        {
          id: 'item-expensive-cost',
          name: 'Loss Making Item',
          sku: 'LOSS-1',
          hsnSacCode: '8471',
          category: 'General',
          minStockAlert: 5,
          unit: 'PCS',
          salePrice: 1000,
          purchasePrice: 1500, // purchasePrice > salePrice!
          gstRate: 18,
          currentStock: 5,
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ],
    ]);

    it('2.1: Missing purchasePrice or uncataloged itemId defaults COGS to 0 without crashing', () => {
      const invoice: Invoice = {
        id: 'inv-adhoc',
        invoiceNumber: 'INV-001',
        invoiceType: 'B2B',
        date: '2026-10-10',
        partyName: 'Test Corp',
        partyAddress: 'Mumbai',
        grandTotal: 1180,
        totalTaxableAmount: 1000,
        totalTax: 180,
        paymentStatus: 'PAID',
        items: [
          {
            itemId: 'non-existent-id',
            name: 'Ad-hoc Consultation',
            hsnSacCode: '9983',
            unit: 'HOURS',
            quantity: 2,
            unitPrice: 500,
            taxableAmount: 1000,
            gstRate: 18,
            cgstAmount: 90,
            sgstAmount: 90,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 1180,
          },
        ],
        createdAt: '2026-10-10',
        updatedAt: '2026-10-10',
      } as unknown as Invoice;

      const result = calculateBillProfit(invoice, itemsMap);

      expect(result.cogs).toBe(0);
      expect(result.grossProfit).toBe(1000);
      expect(result.marginPct).toBe(100);
    });

    it('2.2: Item with purchasePrice = 0 yields 0 COGS and 100% margin', () => {
      const invoice: Invoice = {
        id: 'inv-zero-cost',
        invoiceNumber: 'INV-002',
        invoiceType: 'B2B',
        date: '2026-10-10',
        partyName: 'Test Corp',
        partyAddress: 'Mumbai',
        grandTotal: 590,
        totalTaxableAmount: 500,
        totalTax: 90,
        paymentStatus: 'PAID',
        items: [
          {
            itemId: 'item-zero-cost',
            name: 'Zero Cost Item',
            hsnSacCode: '8471',
            unit: 'PCS',
            quantity: 1,
            unitPrice: 500,
            taxableAmount: 500,
            gstRate: 18,
            cgstAmount: 45,
            sgstAmount: 45,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 590,
          },
        ],
        createdAt: '2026-10-10',
        updatedAt: '2026-10-10',
      } as unknown as Invoice;

      const result = calculateBillProfit(invoice, itemsMap);

      expect(result.cogs).toBe(0);
      expect(result.grossProfit).toBe(500);
      expect(result.marginPct).toBe(100);
    });

    it('2.3: purchasePrice > salePrice correctly produces negative gross profit and negative margin percentage', () => {
      const invoice: Invoice = {
        id: 'inv-loss',
        invoiceNumber: 'INV-003',
        invoiceType: 'B2B',
        date: '2026-10-10',
        partyName: 'Test Corp',
        partyAddress: 'Mumbai',
        grandTotal: 1180,
        totalTaxableAmount: 1000,
        totalTax: 180,
        paymentStatus: 'PAID',
        items: [
          {
            itemId: 'item-expensive-cost',
            name: 'Loss Making Item',
            hsnSacCode: '8471',
            unit: 'PCS',
            quantity: 1,
            unitPrice: 1000,
            taxableAmount: 1000,
            gstRate: 18,
            cgstAmount: 90,
            sgstAmount: 90,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 1180,
          },
        ],
        createdAt: '2026-10-10',
        updatedAt: '2026-10-10',
      } as unknown as Invoice;

      const result = calculateBillProfit(invoice, itemsMap);

      expect(result.cogs).toBe(1500);
      expect(result.grossProfit).toBe(-500);
      // Margin = (-500 / 1000) * 100 = -50%
      expect(result.marginPct).toBe(-50);
    });

    it('2.4: Zero taxable revenue returns 0 marginPct without NaN or divide-by-zero crash', () => {
      const invoice: Invoice = {
        id: 'inv-zero-rev',
        invoiceNumber: 'INV-004',
        invoiceType: 'B2B',
        date: '2026-10-10',
        partyName: 'Zero Revenue Customer',
        partyAddress: 'Mumbai',
        grandTotal: 0,
        totalTaxableAmount: 0,
        totalTax: 0,
        paymentStatus: 'PAID',
        items: [],
        createdAt: '2026-10-10',
        updatedAt: '2026-10-10',
      } as unknown as Invoice;

      const result = calculateBillProfit(invoice, itemsMap);

      expect(result.cogs).toBe(0);
      expect(result.grossProfit).toBe(0);
      expect(result.marginPct).toBe(0);
      expect(Number.isNaN(result.marginPct)).toBe(false);
    });

    it('2.5: aggregateItemWiseSales accurately computes volume, revenue, COGS, and handles Credit Notes', () => {
      const invoices: Invoice[] = [
        {
          id: 'inv-s1',
          invoiceNumber: 'INV-101',
          invoiceType: 'B2B',
          date: '2026-10-05',
          partyName: 'Client 1',
          partyAddress: 'Mumbai',
          grandTotal: 2360,
          totalTaxableAmount: 2000,
          paymentStatus: 'PAID',
          items: [
            {
              itemId: 'item-normal',
              name: 'Normal Item',
              hsnSacCode: '8471',
              unit: 'PCS',
              quantity: 2,
              unitPrice: 1000,
              taxableAmount: 2000,
              gstRate: 18,
              cgstAmount: 180,
              sgstAmount: 180,
              igstAmount: 0,
              cessAmount: 0,
              totalAmount: 2360,
            },
          ],
          createdAt: '2026-10-05',
          updatedAt: '2026-10-05',
        },
        // Credit note returning 1 unit
        {
          id: 'cn-1',
          invoiceNumber: 'CN-101',
          invoiceType: 'CREDIT_NOTE',
          date: '2026-10-08',
          partyName: 'Client 1',
          partyAddress: 'Mumbai',
          grandTotal: 1180,
          totalTaxableAmount: 1000,
          paymentStatus: 'PAID',
          items: [
            {
              itemId: 'item-normal',
              name: 'Normal Item',
              hsnSacCode: '8471',
              unit: 'PCS',
              quantity: 1,
              unitPrice: 1000,
              taxableAmount: 1000,
              gstRate: 18,
              cgstAmount: 90,
              sgstAmount: 90,
              igstAmount: 0,
              cessAmount: 0,
              totalAmount: 1180,
            },
          ],
          createdAt: '2026-10-08',
          updatedAt: '2026-10-08',
        },
        // Cancelled invoice must be ignored
        {
          id: 'inv-cancelled',
          invoiceNumber: 'INV-CANCEL',
          invoiceType: 'B2B',
          isCancelled: true,
          date: '2026-10-09',
          partyName: 'Cancelled',
          partyAddress: 'Mumbai',
          grandTotal: 5000,
          totalTaxableAmount: 4000,
          paymentStatus: 'UNPAID',
          items: [
            {
              itemId: 'item-normal',
              name: 'Normal Item',
              hsnSacCode: '8471',
              unit: 'PCS',
              quantity: 4,
              unitPrice: 1000,
              taxableAmount: 4000,
              gstRate: 18,
              cgstAmount: 360,
              sgstAmount: 360,
              igstAmount: 0,
              cessAmount: 0,
              totalAmount: 4720,
            },
          ],
          createdAt: '2026-10-09',
          updatedAt: '2026-10-09',
        },
      ] as unknown as Invoice[];

      const itemSales = aggregateItemWiseSales(invoices, itemsMap);

      expect(itemSales.length).toBe(1);
      const summary = itemSales[0];
      // 2 sold - 1 returned = 1 unit net
      expect(summary.quantitySold).toBe(1);
      // 2000 taxable - 1000 credit note = 1000 net revenue
      expect(summary.taxableRevenue).toBe(1000);
      // COGS = 1 unit * 600 purchasePrice = 600
      expect(summary.totalCogs).toBe(600);
      // Gross Profit = 1000 - 600 = 400
      expect(summary.grossProfit).toBe(400);
      // Margin = (400 / 1000) * 100 = 40%
      expect(summary.marginPct).toBe(40);
    });

    it('2.6: Item-wise sales with negative margin when item cost exceeds sale revenue', () => {
      const invoices: Invoice[] = [
        {
          id: 'inv-loss-item',
          invoiceNumber: 'INV-LOSS-1',
          invoiceType: 'B2B',
          date: '2026-10-05',
          partyName: 'Client Loss',
          partyAddress: 'Mumbai',
          grandTotal: 1180,
          totalTaxableAmount: 1000,
          paymentStatus: 'PAID',
          items: [
            {
              itemId: 'item-expensive-cost',
              name: 'Loss Making Item',
              hsnSacCode: '8471',
              unit: 'PCS',
              quantity: 1,
              unitPrice: 1000,
              taxableAmount: 1000,
              gstRate: 18,
              cgstAmount: 90,
              sgstAmount: 90,
              igstAmount: 0,
              cessAmount: 0,
              totalAmount: 1180,
            },
          ],
          createdAt: '2026-10-05',
          updatedAt: '2026-10-05',
        },
      ] as unknown as Invoice[];

      const itemSales = aggregateItemWiseSales(invoices, itemsMap);
      expect(itemSales.length).toBe(1);
      expect(itemSales[0].taxableRevenue).toBe(1000);
      expect(itemSales[0].totalCogs).toBe(1500);
      expect(itemSales[0].grossProfit).toBe(-500);
      expect(itemSales[0].marginPct).toBe(-50);
    });
  });

  // =========================================================================
  // Dimension 3: GSTR-3B Tax Offset & ITC Reconciliation
  // =========================================================================
  describe('Dimension 3: GSTR-3B Tax Offset & ITC Reconciliation', () => {
    it('3.1: Excess ITC Scenario (Intra-head): ITC > Output tax -> net cash payable = 0', () => {
      const invoices: Invoice[] = [
        {
          id: 'inv-out-1',
          invoiceNumber: 'INV-301',
          invoiceType: 'B2B',
          date: '2026-10-05',
          partyName: 'Buyer 1',
          partyAddress: 'Local',
          grandTotal: 11800,
          totalTaxableAmount: 10000,
          totalCgst: 900,
          totalSgst: 900,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 1800,
          paymentStatus: 'PAID',
          items: [],
          createdAt: '2026-10-05',
          updatedAt: '2026-10-05',
        },
      ] as unknown as Invoice[];

      const purchases: PurchaseBill[] = [
        {
          id: 'pur-1',
          billNumber: 'PUR-301',
          date: '2026-10-02',
          supplierName: 'Vendor 1',
          grandTotal: 23600,
          totalTaxableAmount: 20000,
          totalCgst: 1800,
          totalSgst: 1800,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 3600,
          itcEligibility: 'ELIGIBLE_INPUTS',
          paymentStatus: 'PAID',
          createdAt: '2026-10-02',
          updatedAt: '2026-10-02',
        },
      ] as unknown as PurchaseBill[];

      const res = aggregateGstr3b(invoices, purchases, []);

      expect(res.outwardTaxable).toBe(10000);
      expect(res.outwardCgst).toBe(900);
      expect(res.outwardSgst).toBe(900);
      expect(res.totalOutwardTax).toBe(1800);

      expect(res.itcCgst).toBe(1800);
      expect(res.itcSgst).toBe(1800);
      expect(res.totalItc).toBe(3600);

      // Since ITC (1800) > Outward Tax (900) per head:
      expect(res.netCgstPayable).toBe(0);
      expect(res.netSgstPayable).toBe(0);
      expect(res.netIgstPayable).toBe(0);
      expect(res.netCashPayable).toBe(0);
    });

    it('3.2: Zero Purchase Scenario: Output tax > 0, ITC = 0 -> net cash payable equals total outward tax', () => {
      const invoices: Invoice[] = [
        {
          id: 'inv-out-2',
          invoiceNumber: 'INV-302',
          invoiceType: 'B2B',
          date: '2026-10-05',
          partyName: 'Buyer 2',
          partyAddress: 'Local',
          grandTotal: 11800,
          totalTaxableAmount: 10000,
          totalCgst: 900,
          totalSgst: 900,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 1800,
          paymentStatus: 'PAID',
          items: [],
          createdAt: '2026-10-05',
          updatedAt: '2026-10-05',
        },
      ] as unknown as Invoice[];

      const res = aggregateGstr3b(invoices, [], []);

      expect(res.outwardCgst).toBe(900);
      expect(res.outwardSgst).toBe(900);
      expect(res.totalOutwardTax).toBe(1800);
      expect(res.totalItc).toBe(0);

      expect(res.netCgstPayable).toBe(900);
      expect(res.netSgstPayable).toBe(900);
      expect(res.netCashPayable).toBe(1800);
    });

    it('3.3: Ineligible ITC filtering (Section 17(5) and Others)', () => {
      const purchases: PurchaseBill[] = [
        {
          id: 'pur-blocked-175',
          billNumber: 'PUR-BLOCK-1',
          date: '2026-10-02',
          supplierName: 'Car Dealer',
          grandTotal: 590000,
          totalTaxableAmount: 500000,
          totalCgst: 45000,
          totalSgst: 45000,
          totalTax: 90000,
          itcEligibility: 'INELIGIBLE_17_5',
          paymentStatus: 'PAID',
          createdAt: '2026-10-02',
          updatedAt: '2026-10-02',
        },
        {
          id: 'pur-blocked-others',
          billNumber: 'PUR-BLOCK-2',
          date: '2026-10-03',
          supplierName: 'Other Ineligible',
          grandTotal: 11800,
          totalTaxableAmount: 10000,
          totalCgst: 900,
          totalSgst: 900,
          totalTax: 1800,
          itcEligibility: 'INELIGIBLE_OTHERS',
          paymentStatus: 'PAID',
          createdAt: '2026-10-03',
          updatedAt: '2026-10-03',
        },
        {
          id: 'pur-eligible',
          billNumber: 'PUR-OK',
          date: '2026-10-04',
          supplierName: 'Raw Materials Supplier',
          grandTotal: 35400,
          totalTaxableAmount: 30000,
          totalCgst: 2700,
          totalSgst: 2700,
          totalTax: 5400,
          itcEligibility: 'ELIGIBLE_INPUTS',
          paymentStatus: 'PAID',
          createdAt: '2026-10-04',
          updatedAt: '2026-10-04',
        },
      ] as unknown as PurchaseBill[];

      const res = aggregateGstr3b([], purchases, []);

      // Ineligible ITCs must not be in eligible totalItc
      expect(res.itcCgst).toBe(2700);
      expect(res.itcSgst).toBe(2700);
      expect(res.totalItc).toBe(5400);

      // Ineligible buckets tracked accurately
      expect(res.ineligibleItc175).toBe(90000);
      expect(res.ineligibleItcOthers).toBe(1800);
    });

    it('3.4: Inter-state vs Intra-state segregation and Credit/Debit note handling', () => {
      const invoices: Invoice[] = [
        // Intra-state sale
        {
          id: 'inv-intra',
          invoiceNumber: 'INV-INTRA',
          invoiceType: 'B2B',
          date: '2026-10-01',
          partyName: 'Local Buyer',
          partyAddress: 'Mumbai',
          grandTotal: 11800,
          totalTaxableAmount: 10000,
          totalCgst: 900,
          totalSgst: 900,
          totalIgst: 0,
          paymentStatus: 'PAID',
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
        // Inter-state sale
        {
          id: 'inv-inter',
          invoiceNumber: 'INV-INTER',
          invoiceType: 'B2B',
          date: '2026-10-02',
          partyName: 'Interstate Buyer',
          partyAddress: 'Delhi',
          grandTotal: 23600,
          totalTaxableAmount: 20000,
          totalCgst: 0,
          totalSgst: 0,
          totalIgst: 3600,
          paymentStatus: 'PAID',
          createdAt: '2026-10-02',
          updatedAt: '2026-10-02',
        },
        // Credit note on Inter-state sale
        {
          id: 'cn-inter',
          invoiceNumber: 'CN-INTER',
          invoiceType: 'CREDIT_NOTE',
          date: '2026-10-05',
          partyName: 'Interstate Buyer',
          partyAddress: 'Delhi',
          grandTotal: 5900,
          totalTaxableAmount: 5000,
          totalCgst: 0,
          totalSgst: 0,
          totalIgst: 900,
          paymentStatus: 'PAID',
          createdAt: '2026-10-05',
          updatedAt: '2026-10-05',
        },
      ] as unknown as Invoice[];

      const res = aggregateGstr3b(invoices, [], []);

      expect(res.outwardCgst).toBe(900);
      expect(res.outwardSgst).toBe(900);
      // IGST: 3600 - 900 = 2700
      expect(res.outwardIgst).toBe(2700);
      // Taxable: 10000 + 20000 - 5000 = 25000
      expect(res.outwardTaxable).toBe(25000);
      expect(res.totalOutwardTax).toBe(4500);
      expect(res.netCashPayable).toBe(4500);
    });

    it('3.5: [CHALLENGE / DEFECT ANALYSIS] Cross-head ITC utilization (e.g. IGST ITC against CGST/SGST)', () => {
      // Under GST Law Rule 88A: Excess IGST credit must be utilized against IGST, then CGST & SGST.
      // If a business has 10,000 IGST ITC and 5,000 CGST + 5,000 SGST outward tax:
      // Real GST net cash payable = 0 (IGST ITC covers CGST + SGST).
      // In aggregateGstr3b, test what current implementation does:
      const invoices: Invoice[] = [
        {
          id: 'inv-local',
          invoiceNumber: 'INV-LOC',
          invoiceType: 'B2B',
          date: '2026-10-01',
          partyName: 'Local Customer',
          partyAddress: 'Mumbai',
          grandTotal: 11800,
          totalTaxableAmount: 10000,
          totalCgst: 500,
          totalSgst: 500,
          totalIgst: 0,
          paymentStatus: 'PAID',
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ] as unknown as Invoice[];

      const purchases: PurchaseBill[] = [
        {
          id: 'pur-import',
          billNumber: 'PUR-IMP',
          date: '2026-10-01',
          supplierName: 'Interstate Supplier',
          grandTotal: 11800,
          totalTaxableAmount: 10000,
          totalCgst: 0,
          totalSgst: 0,
          totalIgst: 2000, // 2000 IGST ITC
          totalTax: 2000,
          itcEligibility: 'ELIGIBLE_INPUTS',
          paymentStatus: 'PAID',
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ] as unknown as PurchaseBill[];

      const res = aggregateGstr3b(invoices, purchases, []);

      // Total outward tax = 1,000. Total eligible ITC = 2,000.
      expect(res.totalOutwardTax).toBe(1000);
      expect(res.totalItc).toBe(2000);

      // Note: Current implementation does intra-head offset only:
      // netCgst = 500, netSgst = 500, netIgst = 0 -> netCashPayable = 1000.
      // We document this empirical behavior:
      expect(res.netCgstPayable).toBe(500);
      expect(res.netSgstPayable).toBe(500);
      expect(res.netCashPayable).toBe(1000);
    });

    it('3.6: Statutory Cess liability included in Table 6.1 netCashPayable and netCessPayable', () => {
      const invoices: Invoice[] = [
        {
          id: 'inv-cess',
          invoiceNumber: 'INV-CESS-1',
          invoiceType: 'B2B',
          date: '2026-10-01',
          partyName: 'Cess Customer',
          partyAddress: 'Mumbai',
          grandTotal: 10500,
          totalTaxableAmount: 10000,
          totalCgst: 0,
          totalSgst: 0,
          totalIgst: 0,
          totalCess: 500, // 500 Cess
          totalTax: 500,
          paymentStatus: 'PAID',
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [],
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ] as unknown as Invoice[];

      // Case 1: Zero ITC -> Net cash payable equals outward cess
      const resNoItc = aggregateGstr3b(invoices, [], []);
      expect(resNoItc.outwardCess).toBe(500);
      expect(resNoItc.totalOutwardTax).toBe(500);
      expect(resNoItc.itcCess).toBe(0);
      expect(resNoItc.netCessPayable).toBe(500);
      expect(resNoItc.netCashPayable).toBe(500);

      // Case 2: Partial ITC offset -> Net cash payable is outward - itc
      const purchasesPartial: PurchaseBill[] = [
        {
          id: 'pur-cess',
          billNumber: 'PB-CESS-1',
          date: '2026-10-01',
          supplierName: 'Cess Vendor',
          grandTotal: 5200,
          totalTaxableAmount: 5000,
          totalCgst: 0,
          totalSgst: 0,
          totalIgst: 0,
          totalCess: 200,
          totalTax: 200,
          itcEligibility: 'ELIGIBLE_INPUTS',
          paymentStatus: 'PAID',
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ] as unknown as PurchaseBill[];
      const resPartial = aggregateGstr3b(invoices, purchasesPartial, []);
      expect(resPartial.outwardCess).toBe(500);
      expect(resPartial.itcCess).toBe(200);
      expect(resPartial.netCessPayable).toBe(300);
      expect(resPartial.netCashPayable).toBe(300);

      // Case 3: Excess ITC -> Net cash payable clamps to 0
      const purchasesExcess: PurchaseBill[] = [
        {
          id: 'pur-cess-excess',
          billNumber: 'PB-CESS-2',
          date: '2026-10-01',
          supplierName: 'Cess Vendor',
          grandTotal: 10800,
          totalTaxableAmount: 10000,
          totalCgst: 0,
          totalSgst: 0,
          totalIgst: 0,
          totalCess: 800,
          totalTax: 800,
          itcEligibility: 'ELIGIBLE_INPUTS',
          paymentStatus: 'PAID',
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ] as unknown as PurchaseBill[];
      const resExcess = aggregateGstr3b(invoices, purchasesExcess, []);
      expect(resExcess.outwardCess).toBe(500);
      expect(resExcess.itcCess).toBe(800);
      expect(resExcess.netCessPayable).toBe(0);
      expect(resExcess.netCashPayable).toBe(0);
    });
  });

  // =========================================================================
  // Dimension 4: Stock Valuation
  // =========================================================================
  describe('Dimension 4: Stock Valuation', () => {
    it('4.1: Stock = 0 counts as outOfStockCount and does NOT distort valuations', () => {
      const items: InventoryItem[] = [
        {
          id: 'item-oos',
          name: 'Out of Stock Item',
          sku: 'OOS-1',
          hsnSacCode: '8539',
          unit: 'PCS',
          salePrice: 1000,
          purchasePrice: 600,
          currentStock: 0,
          minStockAlert: 5,
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ] as unknown as InventoryItem[];

      const val = aggregateStockValuation(items);

      expect(val.totalItems).toBe(1);
      expect(val.totalQuantity).toBe(0);
      expect(val.purchaseValuation).toBe(0);
      expect(val.saleValuation).toBe(0);
      expect(val.potentialGrossProfit).toBe(0);
      expect(val.potentialMarginPct).toBe(0);
      expect(val.outOfStockCount).toBe(1);
      // Must not be double counted in lowStockCount
      expect(val.lowStockCount).toBe(0);
      expect(val.negativeStockCount).toBe(0);
    });

    it('4.2: Negative stock counts in negativeStockCount and does NOT decrease valuation below zero', () => {
      const items: InventoryItem[] = [
        {
          id: 'item-neg',
          name: 'Negative Stock Item',
          sku: 'NEG-1',
          hsnSacCode: '8539',
          unit: 'PCS',
          salePrice: 500,
          purchasePrice: 300,
          currentStock: -8, // -8 units
          minStockAlert: 2,
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ] as unknown as InventoryItem[];

      const val = aggregateStockValuation(items);

      expect(val.totalItems).toBe(1);
      // Quantity reflects net physical units (-8)
      expect(val.totalQuantity).toBe(-8);
      // Valuations only compute for stock > 0, avoiding negative asset values
      expect(val.purchaseValuation).toBe(0);
      expect(val.saleValuation).toBe(0);
      expect(val.potentialGrossProfit).toBe(0);
      expect(val.potentialMarginPct).toBe(0);
      expect(val.negativeStockCount).toBe(1);
      expect(val.outOfStockCount).toBe(0);
      expect(val.lowStockCount).toBe(0);
    });

    it('4.3: Items with purchasePrice = 0 or salePrice = 0', () => {
      const items: InventoryItem[] = [
        // Free bonus stock item (purchasePrice = 0)
        {
          id: 'item-bonus',
          name: 'Free Promo Stock',
          sku: 'BONUS-1',
          hsnSacCode: '8539',
          unit: 'PCS',
          salePrice: 200,
          purchasePrice: 0,
          currentStock: 10,
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
        // Sample item given away for free (salePrice = 0)
        {
          id: 'item-sample',
          name: 'Sample Stock',
          sku: 'SAMPLE-1',
          hsnSacCode: '8539',
          unit: 'PCS',
          salePrice: 0,
          purchasePrice: 150,
          currentStock: 10,
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ] as unknown as InventoryItem[];

      const val = aggregateStockValuation(items);

      expect(val.totalItems).toBe(2);
      expect(val.totalQuantity).toBe(20);
      // Purchase valuation = (10 * 0) + (10 * 150) = 1500
      expect(val.purchaseValuation).toBe(1500);
      // Sale valuation = (10 * 200) + (10 * 0) = 2000
      expect(val.saleValuation).toBe(2000);
      // Gross Profit = 2000 - 1500 = 500
      expect(val.potentialGrossProfit).toBe(500);
      // Potential margin = (500 / 2000) * 100 = 25%
      expect(val.potentialMarginPct).toBe(25);
    });

    it('4.4: Low stock alert threshold trigger (0 < stock <= minStockAlert)', () => {
      const items: InventoryItem[] = [
        {
          id: 'item-low',
          name: 'Low Stock Item',
          sku: 'LOW-1',
          hsnSacCode: '8539',
          unit: 'PCS',
          salePrice: 100,
          purchasePrice: 50,
          currentStock: 3,
          minStockAlert: 5, // 3 <= 5 -> low stock!
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
        {
          id: 'item-sufficient',
          name: 'Sufficient Stock Item',
          sku: 'SUFF-1',
          hsnSacCode: '8539',
          unit: 'PCS',
          salePrice: 100,
          purchasePrice: 50,
          currentStock: 10,
          minStockAlert: 5,
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ] as unknown as InventoryItem[];

      const val = aggregateStockValuation(items);

      expect(val.lowStockCount).toBe(1);
      expect(val.outOfStockCount).toBe(0);
      expect(val.negativeStockCount).toBe(0);
    });

    it('4.5: Disabled items are excluded from inventory valuation counts and totals', () => {
      const items: InventoryItem[] = [
        {
          id: 'item-active',
          name: 'Active Item',
          sku: 'ACT-1',
          hsnSacCode: '8539',
          unit: 'PCS',
          salePrice: 100,
          purchasePrice: 50,
          currentStock: 10,
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
        {
          id: 'item-disabled',
          name: 'Archived Item',
          sku: 'DIS-1',
          hsnSacCode: '8539',
          unit: 'PCS',
          salePrice: 500,
          purchasePrice: 300,
          currentStock: 100,
          isDisabled: true,
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
      ] as unknown as InventoryItem[];

      const val = aggregateStockValuation(items);

      expect(val.totalItems).toBe(1);
      expect(val.totalQuantity).toBe(10);
      expect(val.purchaseValuation).toBe(500);
      expect(val.saleValuation).toBe(1000);
    });
  });

  // =========================================================================
  // Dimension 5: Expense Categorization & Aggregations
  // =========================================================================
  describe('Dimension 5: Expense Categorization & Aggregations', () => {
    it('5.1: Seeds all 10 standard expense categories and computes shares and Cash vs Bank splits', () => {
      const expenses: Expense[] = [
        {
          id: 'exp-1',
          voucherNumber: 'EXP-001',
          category: 'Rent & Utilities',
          amount: 15000,
          taxableAmount: 15000,
          taxAmount: 2700,
          cgstAmount: 1350,
          sgstAmount: 1350,
          itcEligible: true,
          paymentMode: 'BANK_TRANSFER',
          date: '2026-10-01',
          createdAt: '2026-10-01',
          updatedAt: '2026-10-01',
        },
        {
          id: 'exp-2',
          voucherNumber: 'EXP-002',
          category: 'Tea, Coffee & Refreshments',
          amount: 500,
          taxableAmount: 500,
          taxAmount: 0,
          itcEligible: false,
          paymentMode: 'CASH',
          date: '2026-10-02',
          createdAt: '2026-10-02',
          updatedAt: '2026-10-02',
        },
      ] as unknown as Expense[];

      const res = aggregateExpenseCategories(expenses);

      // Verify all 10 categories are present
      expect(res.categories.length).toBe(10);
      for (const catName of ALL_EXPENSE_CATEGORIES) {
        expect(res.categories.some((c) => c.category === catName)).toBe(true);
      }

      // Totals
      expect(res.totalExpense).toBe(15500);
      expect(res.totalTaxable).toBe(15500);
      expect(res.totalTax).toBe(2700);
      expect(res.totalItc).toBe(2700);
      expect(res.cashOutflow).toBe(500);
      expect(res.bankOutflow).toBe(15000);

      // Percentage share check
      const rentCat = res.categories.find((c) => c.category === 'Rent & Utilities')!;
      expect(rentCat.totalAmount).toBe(15000);
      // (15000 / 15500) * 100 = 96.77%
      expect(rentCat.percentageShare).toBe(96.77);
      expect(rentCat.itcClaimable).toBe(2700);
    });
  });
});
