import { describe, it, expect } from 'vitest';
import { computeCashBankSummary } from '@/core/accounting/cashBankCalculator';
import { isItemInBills } from '@/core/utils/itemStatus';
import type { BankAccount, CashBankTransaction } from '@/models/bankAccount';
import type { Invoice, InvoiceItemEntry } from '@/models/invoice';
import type { PurchaseBill, PurchaseItemEntry } from '@/models/purchase';
import type { Expense } from '@/models/expense';
import type { Voucher } from '@/core/accounting/voucherTypes';

describe('M1 Challenger 2 Empirical Stress Test Suite', () => {
  // =========================================================================
  // 1. LIQUID BALANCE INVARIANCE ACROSS 500+ RANDOM CONTRA TRANSACTIONS
  // =========================================================================
  describe('1. Contra Transactions Liquid Balance Invariance', () => {
    const bank1: BankAccount = {
      id: 'ACC_BANK_1',
      accountName: 'HDFC Bank',
      accountType: 'BANK',
      openingBalance: 200000,
      isDefault: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const bank2: BankAccount = {
      id: 'ACC_BANK_2',
      accountName: 'ICICI Bank',
      accountType: 'BANK',
      openingBalance: 150000,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const bank3: BankAccount = {
      id: 'ACC_BANK_3',
      accountName: 'SBI Current',
      accountType: 'BANK',
      openingBalance: 100000,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const cashAcc: BankAccount = {
      id: 'ACC_CASH',
      accountName: 'Cash in Hand',
      accountType: 'CASH',
      openingBalance: 50000,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const accounts = [cashAcc, bank1, bank2, bank3];
    const initialLiquidBalance = 50000 + 200000 + 150000 + 100000; // 500,000

    it('TC-CHAL2-CONTRA-01: 500+ randomized contra transactions maintain exact zero-sum liquid balance invariance', () => {
      // Deterministic PRNG for reproducibility
      let seed = 42;
      const pseudoRandom = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      const bankIds = ['ACC_BANK_1', 'ACC_BANK_2', 'ACC_BANK_3'];
      const contraTypes: Array<'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER'> = ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER'];
      const transactions: CashBankTransaction[] = [];

      const ITERATIONS = 600; // 600 random transactions (> 500 required)

      for (let i = 1; i <= ITERATIONS; i++) {
        const type = contraTypes[Math.floor(pseudoRandom() * contraTypes.length)];
        // Generate diverse amounts including cents / fractional numbers
        const amount = Number((pseudoRandom() * 10000 + 0.5).toFixed(2));
        const targetBank = bankIds[Math.floor(pseudoRandom() * bankIds.length)];
        const sourceBank = bankIds[Math.floor(pseudoRandom() * bankIds.length)];

        let txn: CashBankTransaction;

        if (type === 'DEPOSIT') {
          // Cash -> Bank
          txn = {
            id: `TXN-CONTRA-${i}`,
            txnNumber: `TXN-${i}`,
            type: 'DEPOSIT',
            fromAccountId: 'ACC_CASH',
            toAccountId: targetBank,
            amount,
            description: 'Contra Deposit',
            date: '2026-10-01',
            createdAt: '2026-10-01',
          };
        } else if (type === 'WITHDRAWAL') {
          // Bank -> Cash
          txn = {
            id: `TXN-CONTRA-${i}`,
            txnNumber: `TXN-${i}`,
            type: 'WITHDRAWAL',
            fromAccountId: sourceBank,
            toAccountId: 'ACC_CASH',
            amount,
            description: 'Contra Withdrawal',
            date: '2026-10-01',
            createdAt: '2026-10-01',
          };
        } else {
          // Bank -> Bank
          txn = {
            id: `TXN-CONTRA-${i}`,
            txnNumber: `TXN-${i}`,
            type: 'TRANSFER',
            fromAccountId: sourceBank,
            toAccountId: targetBank,
            amount,
            description: 'Contra Transfer',
            date: '2026-10-01',
            createdAt: '2026-10-01',
          };
        }

        transactions.push(txn);
      }

      const summary = computeCashBankSummary({
        accounts,
        invoices: [],
        purchases: [],
        expenses: [],
        vouchers: [],
        transactions,
      });

      // INVARIANT 1: Total Liquid Balance must strictly equal initial balance (500,000)
      expect(summary.totalLiquidBalance).toBe(initialLiquidBalance);

      // INVARIANT 2: totalLiquidBalance must equal sum of totalCashBalance + totalBankBalance
      const sumOfCashAndBank = Number((summary.totalCashBalance + summary.totalBankBalance).toFixed(2));
      expect(summary.totalLiquidBalance).toBe(sumOfCashAndBank);

      // INVARIANT 3: Sum of all individual account balances must strictly match totalLiquidBalance
      let sumOfAccounts = 0;
      Object.values(summary.accountBalances).forEach((bal) => {
        sumOfAccounts += bal;
      });
      expect(Number(sumOfAccounts.toFixed(2))).toBe(initialLiquidBalance);

      // INVARIANT 4: Ledger entries generated must be exactly 2 * ITERATIONS (one IN, one OUT per contra)
      expect(summary.ledgerEntries).toHaveLength(ITERATIONS * 2);

      // INVARIANT 5: Total contra IN flow must equal Total contra OUT flow
      const contraIn = summary.ledgerEntries.filter((e) => e.flow === 'IN').reduce((sum, e) => sum + e.amount, 0);
      const contraOut = summary.ledgerEntries.filter((e) => e.flow === 'OUT').reduce((sum, e) => sum + e.amount, 0);
      expect(Number(contraIn.toFixed(2))).toBe(Number(contraOut.toFixed(2)));
    });

    it('TC-CHAL2-CONTRA-02: Contra boundary conditions (zero amount, negative, cyclic, self-transfer)', () => {
      const boundaryTxns: CashBankTransaction[] = [
        {
          id: 'TXN-ZERO',
          txnNumber: 'TXN-ZERO',
          type: 'DEPOSIT',
          fromAccountId: 'ACC_CASH',
          toAccountId: 'ACC_BANK_1',
          amount: 0, // Zero amount
          description: 'Zero amount deposit',
          date: '2026-10-01',
          createdAt: '2026-10-01',
        },
        {
          id: 'TXN-NEG',
          txnNumber: 'TXN-NEG',
          type: 'WITHDRAWAL',
          fromAccountId: 'ACC_BANK_1',
          toAccountId: 'ACC_CASH',
          amount: -500, // Negative amount
          description: 'Negative amount withdrawal',
          date: '2026-10-01',
          createdAt: '2026-10-01',
        },
        {
          id: 'TXN-SELF',
          txnNumber: 'TXN-SELF',
          type: 'TRANSFER',
          fromAccountId: 'ACC_BANK_1',
          toAccountId: 'ACC_BANK_1', // Self transfer
          amount: 10000,
          description: 'Self transfer',
          date: '2026-10-01',
          createdAt: '2026-10-01',
        },
        // Cyclic transfer: Bank 1 -> Bank 2 -> Bank 3 -> Cash -> Bank 1
        {
          id: 'TXN-CYC-1',
          txnNumber: 'TXN-C1',
          type: 'TRANSFER',
          fromAccountId: 'ACC_BANK_1',
          toAccountId: 'ACC_BANK_2',
          amount: 5000,
          description: 'Cyclic transfer 1',
          date: '2026-10-01',
          createdAt: '2026-10-01',
        },
        {
          id: 'TXN-CYC-2',
          txnNumber: 'TXN-C2',
          type: 'TRANSFER',
          fromAccountId: 'ACC_BANK_2',
          toAccountId: 'ACC_BANK_3',
          amount: 5000,
          description: 'Cyclic transfer 2',
          date: '2026-10-01',
          createdAt: '2026-10-01',
        },
        {
          id: 'TXN-CYC-3',
          txnNumber: 'TXN-C3',
          type: 'WITHDRAWAL',
          fromAccountId: 'ACC_BANK_3',
          toAccountId: 'ACC_CASH',
          amount: 5000,
          description: 'Cyclic transfer 3',
          date: '2026-10-01',
          createdAt: '2026-10-01',
        },
        {
          id: 'TXN-CYC-4',
          txnNumber: 'TXN-C4',
          type: 'DEPOSIT',
          fromAccountId: 'ACC_CASH',
          toAccountId: 'ACC_BANK_1',
          amount: 5000,
          description: 'Cyclic transfer 4',
          date: '2026-10-01',
          createdAt: '2026-10-01',
        },
      ];

      const summary = computeCashBankSummary({
        accounts,
        invoices: [],
        purchases: [],
        expenses: [],
        vouchers: [],
        transactions: boundaryTxns,
      });

      // Liquid balance invariant strictly holds
      expect(summary.totalLiquidBalance).toBe(initialLiquidBalance);
      // Because cycle completed with exact equal amount, individual balances return to opening balances!
      expect(summary.accountBalances['ACC_BANK_1']).toBe(200000);
      expect(summary.accountBalances['ACC_BANK_2']).toBe(150000);
      expect(summary.accountBalances['ACC_BANK_3']).toBe(100000);
      expect(summary.accountBalances['ACC_CASH']).toBe(50000);
    });
  });

  // =========================================================================
  // 2. DEDUPLICATION: UPFRONT INVOICE PAYMENTS VS VOUCHER RECEIPTS
  // =========================================================================
  describe('2. Deduplication Between Upfront Invoice Payments and Voucher Receipts', () => {
    const defaultBank: BankAccount = {
      id: 'ACC_BANK_1',
      accountName: 'Current Account',
      accountType: 'BANK',
      openingBalance: 10000,
      isDefault: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const cashAccount: BankAccount = {
      id: 'ACC_CASH',
      accountName: 'Cash',
      accountType: 'CASH',
      openingBalance: 5000,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const baseParams = {
      accounts: [cashAccount, defaultBank],
      invoices: [] as Invoice[],
      purchases: [] as PurchaseBill[],
      expenses: [] as Expense[],
      vouchers: [] as Voucher[],
      transactions: [] as CashBankTransaction[],
    };

    it('TC-CHAL2-DEDUP-01: Upfront cash sale + matching voucher receipt never double-counts', () => {
      const invoice: Partial<Invoice> = {
        id: 'INV-101',
        invoiceNumber: 'INV/2026/101',
        partyId: 'PTY-ALPHA',
        partyName: 'Alpha Enterprises',
        paidAmount: 8000,
        grandTotal: 8000,
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        items: [],
        date: '2026-10-01',
      };
      const receiptVoucher: Voucher = {
        id: 'VCH-RCPT-101',
        voucherNumber: 'RCPT-101',
        voucherType: 'RECEIPT',
        date: '2026-10-01',
        entries: [
          { accountId: 'ACC_CASH', accountName: 'Cash', debit: 8000, credit: 0 },
          { accountId: 'PTY-ALPHA', accountName: 'Alpha Enterprises', debit: 0, credit: 8000 },
        ],
        narration: 'Receipt from Alpha',
        totalAmount: 8000,
        createdAt: '2026-10-01',
      };

      const summary = computeCashBankSummary({
        ...baseParams,
        invoices: [invoice as Invoice],
        vouchers: [receiptVoucher],
      });

      // Opening was 5000 cash, 10000 bank = 15000 liquid.
      // After single 8000 inflow: cash should be 13000, liquid 23000 (NOT 31000 double-counted!)
      expect(summary.totalCashBalance).toBe(13000);
      expect(summary.totalLiquidBalance).toBe(23000);
    });

    it('TC-CHAL2-DEDUP-02: Partial voucher receipt offsets upfront invoice and takes remainder correctly', () => {
      const invoice: Partial<Invoice> = {
        id: 'INV-102',
        invoiceNumber: 'INV/2026/102',
        partyId: 'PTY-BETA',
        paidAmount: 10000,
        grandTotal: 10000,
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        items: [],
        date: '2026-10-01',
      };
      // Voucher only covers 4000
      const voucher: Voucher = {
        id: 'VCH-RCPT-102',
        voucherNumber: 'RCPT-102',
        voucherType: 'RECEIPT',
        date: '2026-10-01',
        entries: [
          { accountId: 'ACC_CASH', accountName: 'Cash', debit: 4000, credit: 0 },
          { accountId: 'PTY-BETA', accountName: 'Beta Traders', debit: 0, credit: 4000 },
        ],
        narration: 'Partial receipt',
        totalAmount: 4000,
        createdAt: '2026-10-01',
      };

      const summary = computeCashBankSummary({
        ...baseParams,
        invoices: [invoice as Invoice],
        vouchers: [voucher],
      });

      // Total money received should be 10000 (4000 voucher + 6000 unvouchered upfront)
      // Opening cash 5000 + 10000 = 15000
      expect(summary.totalCashBalance).toBe(15000);
      expect(summary.totalLiquidBalance).toBe(25000);
    });

    it('TC-CHAL2-DEDUP-03: Multi-invoice credit consumption across multiple bills for same party', () => {
      const inv1: Partial<Invoice> = {
        id: 'INV-A1',
        invoiceNumber: 'INV-A1',
        partyId: 'PTY-GAMMA',
        paidAmount: 3000,
        grandTotal: 3000,
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        items: [],
        date: '2026-10-01',
      };
      const inv2: Partial<Invoice> = {
        id: 'INV-A2',
        invoiceNumber: 'INV-A2',
        partyId: 'PTY-GAMMA',
        paidAmount: 5000,
        grandTotal: 5000,
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        items: [],
        date: '2026-10-01',
      };
      // Voucher for 6000: covers inv1 completely (3000) and covers 3000 of inv2, leaving 2000 unvouchered
      const voucher: Voucher = {
        id: 'VCH-GAMMA',
        voucherNumber: 'RCPT-G',
        voucherType: 'RECEIPT',
        date: '2026-10-01',
        entries: [
          { accountId: 'ACC_CASH', accountName: 'Cash', debit: 6000, credit: 0 },
          { accountId: 'PTY-GAMMA', accountName: 'Gamma Corp', debit: 0, credit: 6000 },
        ],
        narration: 'Lump sum receipt',
        totalAmount: 6000,
        createdAt: '2026-10-01',
      };

      const summary = computeCashBankSummary({
        ...baseParams,
        invoices: [inv1 as Invoice, inv2 as Invoice],
        vouchers: [voucher],
      });

      // Total received: 6000 (voucher) + 2000 (unvouchered remainder of inv2) = 8000
      // Opening 5000 + 8000 = 13000
      expect(summary.totalCashBalance).toBe(13000);
      expect(summary.totalLiquidBalance).toBe(23000);
    });

    it('TC-CHAL2-DEDUP-04: Upfront purchase payment + matching payment voucher never double-counts outflows', () => {
      const purchase: Partial<PurchaseBill> = {
        id: 'PUR-201',
        billNumber: 'BILL-201',
        supplierId: 'SUP-DELTA',
        paidAmount: 6000,
        grandTotal: 6000,
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        items: [],
        date: '2026-10-01',
      };
      const paymentVoucher: Voucher = {
        id: 'VCH-PYMT-201',
        voucherNumber: 'PYMT-201',
        voucherType: 'PAYMENT',
        date: '2026-10-01',
        entries: [
          { accountId: 'SUP-DELTA', accountName: 'Delta Vendor', debit: 6000, credit: 0 },
          { accountId: 'ACC_CASH', accountName: 'Cash', debit: 0, credit: 6000 },
        ],
        narration: 'Payment to Delta',
        totalAmount: 6000,
        createdAt: '2026-10-01',
      };

      const summary = computeCashBankSummary({
        ...baseParams,
        purchases: [purchase as PurchaseBill],
        vouchers: [paymentVoucher],
      });

      // Cash was 5000, outflow of 6000 once -> -1000 cash balance
      // If double-counted, it would have been -7000!
      expect(summary.totalCashBalance).toBe(-1000);
      expect(summary.totalLiquidBalance).toBe(9000); // 10000 bank - 1000 cash = 9000
    });

    it('TC-CHAL2-DEDUP-05: Fuzzing deduplication across 100 mixed parties, invoices, and vouchers', () => {
      let seed = 12345;
      const pseudoRandom = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      const fuzzInvoices: Invoice[] = [];
      const fuzzVouchers: Voucher[] = [];

      for (let p = 1; p <= 50; p++) {
        const partyId = `PTY-FUZZ-${p}`;
        const invoicePaid = Math.floor(pseudoRandom() * 5000) + 1000;
        const hasVoucher = pseudoRandom() > 0.5;

        fuzzInvoices.push({
          id: `INV-F-${p}`,
          invoiceNumber: `INV-F-${p}`,
          invoiceType: 'B2B',
          date: '2026-10-01',
          partyId,
          partyName: `Fuzz Party ${p}`,
          partyAddress: '',
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [],
          totalTaxableAmount: invoicePaid,
          totalCgst: 0,
          totalSgst: 0,
          totalIgst: 0,
          totalCess: 0,
          grandTotal: invoicePaid,
          paidAmount: invoicePaid,
          paymentMode: 'CASH',
          paymentStatus: 'PAID',
        } as unknown as Invoice);

        if (hasVoucher) {
          // Voucher covers invoice
          fuzzVouchers.push({
            id: `VCH-F-${p}`,
            voucherNumber: `VCH-F-${p}`,
            voucherType: 'RECEIPT',
            date: '2026-10-01',
            entries: [
              { accountId: 'ACC_CASH', accountName: 'Cash', debit: invoicePaid, credit: 0 },
              { accountId: partyId, accountName: `Fuzz Party ${p}`, debit: 0, credit: invoicePaid },
            ],
            narration: 'Fuzz Receipt',
            totalAmount: invoicePaid,
            createdAt: '2026-10-01',
          });
        }
      }

      const summary = computeCashBankSummary({
        ...baseParams,
        invoices: fuzzInvoices,
        vouchers: fuzzVouchers,
      });

      // Oracle calculation:
      // Each party has invoicePaid. If hasVoucher, it's counted once via voucher. If no voucher, counted once via upfront invoice.
      // Therefore, every party's invoicePaid is counted exactly ONCE!
      const expectedTotalInflow = fuzzInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
      const expectedFinalCash = 5000 + expectedTotalInflow;

      expect(summary.totalCashBalance).toBe(expectedFinalCash);
    });
  });

  // =========================================================================
  // 3. isItemInBills DELETION PROTECTION UNDER STRESS CONDITIONS
  // =========================================================================
  describe('3. isItemInBills Referential Integrity & Deletion Protection', () => {
    it('TC-CHAL2-INTEG-01: Boundary and falsy input resilience', () => {
      expect(isItemInBills('')).toBe(false);
      expect(isItemInBills(null as any)).toBe(false);
      expect(isItemInBills(undefined as any)).toBe(false);
      expect(isItemInBills('ITM-UNBILLED', [], [])).toBe(false);
    });

    it('TC-CHAL2-INTEG-02: Referential integrity holds across special character and boundary item IDs', () => {
      const specialIds = [
        'ITM/2026/01#99',
        'ITM-!@#$%^&*()',
        'ITM 123 WITH SPACES',
        'ITM-📦-EMOJI',
        '0',
        '12345678901234567890',
        '__proto__',
        'constructor',
        'toString',
      ];

      specialIds.forEach((id) => {
        const invWithItem: Partial<Invoice> = {
          id: `INV-${id}`,
          items: [
            {
              itemId: id,
              name: 'Special Item',
              hsnSacCode: '8471',
              quantity: 1,
              unit: 'NOS',
              unitPrice: 100,
              taxableAmount: 100,
              gstRate: 18,
              cgstAmount: 9,
              sgstAmount: 9,
              igstAmount: 0,
              cessAmount: 0,
              totalAmount: 118,
            } as InvoiceItemEntry,
          ],
        };

        expect(isItemInBills(id, [invWithItem as Invoice], [])).toBe(true);
        expect(isItemInBills('DIFFERENT_ID', [invWithItem as Invoice], [])).toBe(false);
      });
    });

    it('TC-CHAL2-INTEG-03: Deletion protection remains active on cancelled bills and non-tax invoices', () => {
      const cancelledInvoice: Partial<Invoice> = {
        id: 'INV-CANCELLED',
        isCancelled: true,
        items: [
          {
            itemId: 'ITM-HISTORIC-01',
            name: 'Historic Item',
            hsnSacCode: '8471',
            quantity: 5,
            unit: 'NOS',
            unitPrice: 200,
            taxableAmount: 1000,
            gstRate: 18,
            cgstAmount: 90,
            sgstAmount: 90,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 1180,
          } as InvoiceItemEntry,
        ],
      };

      // Even on a cancelled invoice, the item cannot be deleted to preserve audit logs
      expect(isItemInBills('ITM-HISTORIC-01', [cancelledInvoice as Invoice], [])).toBe(true);
    });

    it('TC-CHAL2-INTEG-04: High-volume stress search across 2,000 invoices (20,000 line items)', () => {
      const LARGE_COUNT = 2000;
      const largeInvoices: Invoice[] = [];

      for (let i = 0; i < LARGE_COUNT; i++) {
        const items: InvoiceItemEntry[] = [];
        for (let j = 0; j < 10; j++) {
          items.push({
            itemId: `ITM-BULK-${i}-${j}`,
            name: `Bulk Item ${i}-${j}`,
            hsnSacCode: '8471',
            quantity: 1,
            unit: 'NOS',
            unitPrice: 10,
            taxableAmount: 10,
            gstRate: 18,
            cgstAmount: 0.9,
            sgstAmount: 0.9,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 11.8,
          });
        }
        largeInvoices.push({
          id: `INV-BULK-${i}`,
          invoiceNumber: `INV-${i}`,
          invoiceType: 'B2B',
          date: '2026-10-01',
          partyName: 'Test',
          partyAddress: '',
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items,
          totalTaxableAmount: 100,
          totalCgst: 9,
          totalSgst: 9,
          totalIgst: 0,
          totalCess: 0,
          grandTotal: 118,
        } as Invoice);
      }

      // Best case: item at index 0 of first invoice
      const t0 = performance.now();
      const foundFirst = isItemInBills('ITM-BULK-0-0', largeInvoices, []);
      const t1 = performance.now();
      expect(foundFirst).toBe(true);

      // Worst case: item at the very last position of the 2,000th invoice
      const t2 = performance.now();
      const foundLast = isItemInBills('ITM-BULK-1999-9', largeInvoices, []);
      const t3 = performance.now();
      expect(foundLast).toBe(true);

      // Non-existent item scanned across all 20,000 line items
      const t4 = performance.now();
      const foundNone = isItemInBills('ITM-NONEXISTENT', largeInvoices, []);
      const t5 = performance.now();
      expect(foundNone).toBe(false);

      // Performance check: scanning 20,000 items in memory should take < 50ms in modern JS
      expect(t5 - t4).toBeLessThan(100);
    });

    it('TC-CHAL2-INTEG-05: Purchase bills independently enforce deletion protection', () => {
      const purchases: Partial<PurchaseBill>[] = [
        {
          id: 'PUR-1',
          billNumber: 'BILL-1',
          items: [
            {
              itemId: 'ITM-PURCHASE-ONLY',
              name: 'Raw Ingot',
              hsnSacCode: '7204',
              quantity: 100,
              unit: 'KGS',
              unitPrice: 50,
              taxableAmount: 5000,
              gstRate: 18,
              cgstAmount: 450,
              sgstAmount: 450,
              igstAmount: 0,
              cessAmount: 0,
              totalAmount: 5900,
            } as PurchaseItemEntry,
          ],
        },
      ];

      // Exists only in purchases, not in sales invoices
      expect(isItemInBills('ITM-PURCHASE-ONLY', [], purchases as PurchaseBill[])).toBe(true);
      expect(isItemInBills('ITM-OTHER', [], purchases as PurchaseBill[])).toBe(false);
    });
  });
});
