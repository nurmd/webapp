import { describe, it, expect, beforeEach, vi } from 'vitest';

class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });

vi.mock('../services/db/preMigrationBackup.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/db/preMigrationBackup.ts')>();
  return {
    ...actual,
    createAndVerifyPreMigrationBackup: vi.fn((migrationId: string) => actual.createAndVerifyPreMigrationBackup(migrationId)),
  };
});

import { db } from '../services/db.ts';
import { STORAGE_KEYS } from '../services/db/storageEngine.ts';
import { createAndVerifyPreMigrationBackup } from '../services/db/preMigrationBackup.ts';
import {
  PAISE_MIGRATION_ID,
  scheduleStartupPaiseIntegrityCheck,
} from '../services/db/paiseMigrationStorage.ts';
import {
  hasCurrentPaiseSchema,
  verifyPaiseFields,
} from '../core/accounting/paisePersistence.ts';
import type { PurchaseBill } from '../models/purchase.ts';
import type { Voucher } from '../core/accounting/voucherTypes.ts';

const sampleInvoice = {
  id: 'INV-TEST-001',
  invoiceNumber: 'INV-2026-001',
  date: '2026-11-12',
  dueDate: '2026-11-20',
  partyId: 'PTY-001',
  partyName: 'Alpha Traders',
  type: 'B2B',
  status: 'ISSUED',
  paymentStatus: 'UNPAID',
  paymentMode: 'CREDIT',
  totalGrossAmount: 1000,
  totalDiscount: 50,
  totalTaxableAmount: 950,
  totalCgst: 85.5,
  totalSgst: 85.5,
  totalUtgst: 0,
  totalIgst: 0,
  totalCess: 0,
  totalTax: 171,
  roundOff: 0,
  shippingAmount: 50,
  grandTotal: 1171,
  paidAmount: 0,
  balanceAmount: 1171,
  items: [
    {
      itemId: 'ITEM-1',
      name: 'Widget',
      quantity: 10,
      unit: 'PCS',
      unitPrice: 100,
      discountAmount: 50,
      taxableAmount: 950,
      gstRate: 18,
      cgstAmount: 85.5,
      sgstAmount: 85.5,
      utgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 1121,
    },
  ],
  paymentSplits: [],
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const samplePurchase = {
  id: 'PUR-TEST-001',
  billNumber: 'BILL-2026-001',
  supplierInvoiceNumber: 'SUP-001',
  date: '2026-11-12',
  dueDate: '2026-11-20',
  supplierId: 'PTY-002',
  supplierName: 'Beta Suppliers',
  purchaseType: 'REGULAR',
  paymentStatus: 'PAID',
  paymentMode: 'CASH',
  totalGrossAmount: 500,
  totalDiscount: 0,
  totalTaxableAmount: 500,
  totalCgst: 45,
  totalSgst: 45,
  totalUtgst: 0,
  totalIgst: 0,
  totalCess: 0,
  totalTax: 90,
  roundOff: 0,
  shippingAmount: 0,
  grandTotal: 590,
  paidAmount: 590,
  balanceAmount: 0,
  items: [
    {
      itemId: 'RAW-1',
      name: 'Raw Material',
      quantity: 5,
      unit: 'KG',
      unitPrice: 100,
      discountAmount: 0,
      taxableAmount: 500,
      gstRate: 18,
      cgstAmount: 45,
      sgstAmount: 45,
      utgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 590,
    },
  ],
  paymentSplits: [],
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const sampleVoucher = {
  id: 'VCH-TEST-001',
  voucherNumber: 'VCH-2026-001',
  date: '2026-11-12',
  voucherType: 'RECEIPT',
  totalAmount: 500,
  partyId: 'PTY-001',
  partyName: 'Alpha Traders',
  entries: [
    {
      id: 'ENTRY-1',
      accountId: 'CASH',
      accountName: 'Cash',
      accountType: 'ASSET',
      debit: 500,
      credit: 0,
    },
    {
      id: 'ENTRY-2',
      accountId: 'PTY-001',
      accountName: 'Alpha Traders',
      accountType: 'ACCOUNTS_RECEIVABLE',
      debit: 0,
      credit: 500,
    },
  ],
  createdAt: '2026-11-12T00:00:00.000Z',
};

const sampleParty = {
  id: 'PTY-001',
  name: 'Alpha Traders',
  type: 'CUSTOMER',
  phone: '9876543210',
  openingBalance: 1000,
  currentBalance: 2171,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const sampleExpense = {
  id: 'EXP-TEST-001',
  date: '2026-11-12',
  expenseCategory: 'OFFICE',
  amount: 250,
  taxableAmount: 211.86,
  taxAmount: 38.14,
  cgstAmount: 19.07,
  sgstAmount: 19.07,
  igstAmount: 0,
  createdAt: '2026-11-12T00:00:00.000Z',
};

const sampleBankAccount = {
  id: 'ACC-001',
  accountName: 'HDFC Current',
  accountType: 'BANK',
  openingBalance: 50000,
  openingBalanceDate: '2026-04-01',
  isDefault: true,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const sampleCashBankTxn = {
  id: 'CBT-001',
  date: '2026-11-12',
  transactionType: 'DEPOSIT',
  fromAccountId: 'ACC_CASH',
  toAccountId: 'ACC-001',
  amount: 10000,
  createdAt: '2026-11-12T00:00:00.000Z',
};

const sampleLoan = {
  id: 'LOAN-001',
  lenderName: 'SBI',
  loanType: 'SECURED',
  sanctionAmount: 500000,
  emiAmount: 15000,
  currentPrincipalOutstanding: 450000,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const sampleLoanTxn = {
  id: 'LTXN-001',
  loanId: 'LOAN-001',
  date: '2026-11-12',
  principalPaid: 10000,
  interestPaid: 5000,
  chargesPaid: 0,
  totalAmount: 15000,
  remainingPrincipal: 440000,
  createdAt: '2026-11-12T00:00:00.000Z',
};

function seedUnmigratedData(): void {
  db.clearMemoryCache();
  testStorage.clear();
  db.set(STORAGE_KEYS.INVOICES, [{ ...sampleInvoice }]);
  db.set(STORAGE_KEYS.PURCHASES, [{ ...samplePurchase }]);
  db.set(STORAGE_KEYS.VOUCHERS, [{ ...sampleVoucher }]);
  db.set(STORAGE_KEYS.PARTIES, [{ ...sampleParty }]);
  db.set(STORAGE_KEYS.EXPENSES, [{ ...sampleExpense }]);
  db.set(STORAGE_KEYS.BANK_ACCOUNTS, [{ ...sampleBankAccount }]);
  db.set(STORAGE_KEYS.CASH_BANK_TXNS, [{ ...sampleCashBankTxn }]);
  db.set(STORAGE_KEYS.LOANS, [{ ...sampleLoan }]);
  db.set(STORAGE_KEYS.LOAN_TXNS, [{ ...sampleLoanTxn }]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function projectRupeeDoc(doc: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key.endsWith('Paise') || key === 'paiseSchema' || key === 'paiseKind' || key === '__paiseSchema' || key === '__paiseKind') {
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.map((item: unknown) => {
        if (isRecord(item)) {
          return projectRupeeDoc(item);
        }
        return item;
      });
    } else {
      result[key] = value;
    }
  }
  return result;
}

describe('Paise Backfill Migration and Integrity Check Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedUnmigratedData();
  });

  it('1. planPaiseMigration reports pending > 0 for freshly saved docs and current === total after a successful run', () => {
    const planBefore = db.planPaiseMigration();
    expect(planBefore.totalDocuments).toBe(9);
    expect(planBefore.totalPending).toBe(9);
    expect(planBefore.totalCurrent).toBe(0);

    const report = db.runPaiseMigration();
    expect(report.success).toBe(true);
    expect(report.totalMigrated).toBe(9);

    const planAfter = db.planPaiseMigration();
    expect(planAfter.totalDocuments).toBe(9);
    expect(planAfter.totalPending).toBe(0);
    expect(planAfter.totalCurrent).toBe(planAfter.totalDocuments);
  });

  it('2. runPaiseMigration({ dryRun: true }) performs no writes: documents keep no paiseSchema and totalMigrated === 0', () => {
    const report = db.runPaiseMigration({ dryRun: true });
    expect(report.success).toBe(true);
    expect(report.dryRun).toBe(true);
    expect(report.totalMigrated).toBe(0);
    expect(report.abortedReason).toBe('DRY_RUN');

    const invoices = db.getInvoices();
    expect(invoices.length).toBe(1);
    expect(hasCurrentPaiseSchema(invoices[0])).toBe(false);
    expect(Reflect.get(invoices[0], 'paiseSchema')).toBeUndefined();

    const purchases = db.getPurchases();
    expect(hasCurrentPaiseSchema(purchases[0])).toBe(false);

    const parties = db.getParties();
    expect(hasCurrentPaiseSchema(parties[0])).toBe(false);

    const vouchers = db.getVouchers();
    expect(hasCurrentPaiseSchema(vouchers[0])).toBe(false);
  });

  it('3. Full run: every invoice/purchase/voucher/party doc gains paiseSchema: 1 and correct twins, and verifyPaiseIntegrity() returns []', () => {
    const report = db.runPaiseMigration();
    expect(report.success).toBe(true);
    expect(report.dryRun).toBe(false);
    expect(report.backupId).toBe(`gst_pre_migration_backup_${PAISE_MIGRATION_ID}`);
    expect(report.backupChecksum).toBeDefined();
    expect(report.totalMigrated).toBe(9);
    expect(report.totalSkipped).toBe(0);
    expect(report.totalDivergences).toBe(0);

    // Spot-check Invoice
    const invoice = db.getInvoices()[0];
    expect(hasCurrentPaiseSchema(invoice)).toBe(true);
    expect(Reflect.get(invoice, 'paiseSchema')).toBe(1);
    expect(Reflect.get(invoice, 'grandTotalPaise')).toBe(117100);

    // Spot-check Party
    const party = db.getParties()[0];
    expect(hasCurrentPaiseSchema(party)).toBe(true);
    expect(Reflect.get(party, 'paiseSchema')).toBe(1);
    expect(Reflect.get(party, 'currentBalancePaise')).toBe(217100);

    // Spot-check Voucher
    const voucher = db.getVouchers()[0];
    expect(hasCurrentPaiseSchema(voucher)).toBe(true);
    expect(Reflect.get(voucher, 'paiseSchema')).toBe(1);
    expect(Reflect.get(voucher, 'totalAmountPaise')).toBe(50000);

    // Spot-check Purchase
    const purchase = db.getPurchases()[0];
    expect(hasCurrentPaiseSchema(purchase)).toBe(true);
    expect(Reflect.get(purchase, 'paiseSchema')).toBe(1);
    expect(Reflect.get(purchase, 'grandTotalPaise')).toBe(59000);

    // Integrity check clean
    expect(db.verifyPaiseIntegrity()).toEqual([]);
  });

  it('4. Idempotency: a second run reports totalMigrated === 0', () => {
    const firstReport = db.runPaiseMigration();
    expect(firstReport.success).toBe(true);
    expect(firstReport.totalMigrated).toBe(9);

    const secondReport = db.runPaiseMigration();
    expect(secondReport.success).toBe(true);
    expect(secondReport.totalMigrated).toBe(0);
    expect(secondReport.totalDivergences).toBe(0);
  });

  it('5. Backup failure: preMigrationBackup throws; assert success === false, abortedReason starts with BACKUP_FAILED, and no doc gained paiseSchema', () => {
    vi.mocked(createAndVerifyPreMigrationBackup).mockImplementationOnce(() => {
      throw new Error('Simulated disk full failure');
    });

    const report = db.runPaiseMigration();
    expect(report.success).toBe(false);
    expect(report.abortedReason).toBeDefined();
    expect(report.abortedReason?.startsWith('BACKUP_FAILED: Simulated disk full failure')).toBe(true);
    expect(report.totalMigrated).toBe(0);

    const invoices = db.getInvoices();
    expect(hasCurrentPaiseSchema(invoices[0])).toBe(false);
    expect(Reflect.get(invoices[0], 'paiseSchema')).toBeUndefined();
  });

  it('6. verifyPaiseIntegrity detects a tampered twin (mutate a stored doc grandTotalPaise, expect one mismatch with the right path)', () => {
    const initialReport = db.runPaiseMigration();
    expect(initialReport.success).toBe(true);

    const invoices = db.getInvoices();
    const tampered = { ...invoices[0], grandTotalPaise: 9999 };
    db.set(STORAGE_KEYS.INVOICES, [tampered]);

    const divergences = db.verifyPaiseIntegrity();
    expect(divergences.length).toBe(1);
    expect(divergences[0].entity).toBe('invoice');
    expect(divergences[0].id).toBe('INV-TEST-001');
    expect(divergences[0].path).toBe('grandTotal');
    expect(divergences[0].rupee).toBe(1171);
    expect(divergences[0].paise).toBe(9999);
  });

  it('7. Migration never changes rupee fields: snapshot JSON.stringify of the rupee-only projection before/after', () => {
    const beforeSnapshot = JSON.stringify({
      invoices: db.getInvoices().map(projectRupeeDoc),
      purchases: db.getPurchases().map(projectRupeeDoc),
      vouchers: db.getVouchers().map(projectRupeeDoc),
      parties: db.getParties().map(projectRupeeDoc),
      expenses: db.getExpenses().map(projectRupeeDoc),
      bankAccounts: db.getBankAccounts().map(projectRupeeDoc),
      cashBankTxns: db.getCashBankTransactions().map(projectRupeeDoc),
      loans: db.getLoans().map(projectRupeeDoc),
      loanTxns: db.getLoanTransactions().map(projectRupeeDoc),
    });

    const report = db.runPaiseMigration();
    expect(report.success).toBe(true);

    const afterSnapshot = JSON.stringify({
      invoices: db.getInvoices().map(projectRupeeDoc),
      purchases: db.getPurchases().map(projectRupeeDoc),
      vouchers: db.getVouchers().map(projectRupeeDoc),
      parties: db.getParties().map(projectRupeeDoc),
      expenses: db.getExpenses().map(projectRupeeDoc),
      bankAccounts: db.getBankAccounts().map(projectRupeeDoc),
      cashBankTxns: db.getCashBankTransactions().map(projectRupeeDoc),
      loans: db.getLoans().map(projectRupeeDoc),
      loanTxns: db.getLoanTransactions().map(projectRupeeDoc),
    });

    expect(afterSnapshot).toBe(beforeSnapshot);
  });

  it('8. scheduleStartupPaiseIntegrityCheck handles startup warnings gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    db.runPaiseMigration();
    const invoices = db.getInvoices();
    db.set(STORAGE_KEYS.INVOICES, [{ ...invoices[0], grandTotalPaise: 8888 }]);

    scheduleStartupPaiseIntegrityCheck(db);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[PaiseIntegrity] Startup integrity check found')
    );
    warnSpy.mockRestore();
  });

  it('9. Stale twins repair (W1): stamped document whose rupee value was edited gets repaired rather than skipped', () => {
    // 1. Initial backfill migration stamps all docs
    const initReport = db.runPaiseMigration();
    expect(initReport.success).toBe(true);
    expect(initReport.totalMigrated).toBe(9);

    // 2. Simulate stale twin on PUR-TEST-001 (Talukder Hardware scenario):
    // Rupee paidAmount edited 41000 -> 35000, balanceAmount edited 0 -> 6000,
    // split amount edited 41000 -> 35000 + added credit split 6000, while twins stayed at 4100000 / 0.
    const purchases = db.getPurchases();
    const stalePurchase = {
      ...purchases[0],
      paidAmount: 35000,
      balanceAmount: 6000,
      paidAmountPaise: 4100000, // stale twin
      balanceAmountPaise: 0,    // stale twin
      paymentSplits: [
        { id: 's1', mode: 'CASH', amount: 35000, amountPaise: 4100000 }, // stale twin
        { id: 's2', mode: 'CREDIT', amount: 6000 },
      ],
    };
    db.set(STORAGE_KEYS.PURCHASES, [stalePurchase]);

    // verifyPaiseIntegrity detects the stale twins
    const preCheck = db.verifyPaiseIntegrity();
    expect(preCheck.length).toBeGreaterThan(0);
    expect(preCheck.some((d) => d.id === stalePurchase.id && d.path === 'paidAmount')).toBe(true);

    // 3. Re-run migration: doc should be repaired, NOT skipped
    const repairReport = db.runPaiseMigration();
    expect(repairReport.success).toBe(true);
    expect(repairReport.totalMigrated).toBe(0);
    expect(repairReport.totalRepaired).toBe(1);
    expect(repairReport.totalSkipped).toBe(0);
    expect(repairReport.totalDivergences).toBeGreaterThan(0);

    // Check entity report
    const purchaseResult = repairReport.entities.find((e) => e.entity === 'purchase');
    expect(purchaseResult?.repaired).toBe(1);
    expect(purchaseResult?.skipped).toBe(0);

    // 4. Verify stored doc now has correct refreshed twins
    const storedPurchase = db.getPurchases()[0];
    expect(Reflect.get(storedPurchase, 'paidAmountPaise')).toBe(3500000);
    expect(Reflect.get(storedPurchase, 'balanceAmountPaise')).toBe(600000);
    expect((storedPurchase.paymentSplits as any[])[0].amountPaise).toBe(3500000);
    expect((storedPurchase.paymentSplits as any[])[1].amountPaise).toBe(600000);

    // 5. Subsequent integrity check is clean
    expect(db.verifyPaiseIntegrity()).toEqual([]);
  });

  it('10. Sub-paise precision on unitPrice (W2): derived per-unit rate stamps as best-effort projection and is excluded from verify round-trip mismatches', () => {
    // Seed an invoice with fractional unitPrice (e.g. 733.3333 with 4 decimals from lineTotal / quantity)
    const fractionalInvoice = {
      ...sampleInvoice,
      id: 'INV-FRACTIONAL-001',
      items: [
        {
          itemId: 'ITEM-FRAC-1',
          name: 'Mustard Oil Fractional',
          quantity: 1.5,
          unit: 'LTR',
          unitPrice: 733.3333, // 4 decimal derived rate
          discountAmount: 0,
          taxableAmount: 1100,
          gstRate: 18,
          cgstAmount: 99,
          sgstAmount: 99,
          utgstAmount: 0,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 1298,
        },
      ],
      totalGrossAmount: 1100,
      totalDiscount: 0,
      totalTaxableAmount: 1100,
      totalCgst: 99,
      totalSgst: 99,
      totalTax: 198,
      grandTotal: 1298,
      balanceAmount: 1298,
    };
    db.set(STORAGE_KEYS.INVOICES, [fractionalInvoice]);

    // Backfill migration stamps it
    const report = db.runPaiseMigration();
    expect(report.success).toBe(true);
    expect(report.totalMigrated).toBe(9); // 1 fractional invoice + 8 other seed docs
    expect(report.totalDivergences).toBe(0);
    expect(report.totalSkipped).toBe(0);

    // Stored doc has the best-effort integer paise twin for unitPrice
    const stored = db.getInvoices().find((i) => i.id === 'INV-FRACTIONAL-001')!;
    expect(hasCurrentPaiseSchema(stored)).toBe(true);
    expect(stored.items[0].unitPrice).toBe(733.3333);
    expect((stored.items[0] as any).unitPricePaise).toBe(73333); // Math.round(733.3333 * 100)

    // verifyPaiseIntegrity does not flag unitPrice as a divergence
    expect(db.verifyPaiseIntegrity()).toEqual([]);
  });

  it('11. Regression test (W4): editing a purchase payment via savePaymentVoucher -> applyAllocations -> savePurchase refreshes twins to match rupee values', () => {
    // 1. Create a purchase bill of grandTotal: 41000, initially unpaid
    const purId = 'PUR-REGRESSION-001';
    const testPurchase: PurchaseBill = {
      ...samplePurchase,
      purchaseType: 'BILL',
      supplierAddress: '123 Market St',
      supplierStateCode: '18',
      placeOfSupplyStateCode: '18',
      isIntraState: true,
      itcEligibility: 'ALL_OTHER_ITC',
      isRcm: false,
      items: samplePurchase.items.map((it) => ({
        ...it,
        hsnSacCode: '1234',
        unit: 'KGS' as const,
      })),
      id: purId,
      billNumber: 'BILL-TALUKDER-001',
      supplierId: 'PTY-002',
      supplierName: 'Beta Suppliers',
      grandTotal: 41000,
      paidAmount: 0,
      balanceAmount: 41000,
      paymentStatus: 'UNPAID',
      paymentMode: 'CREDIT',
      paymentSplits: [{ id: 's-bal', mode: 'CREDIT', amount: 41000 }],
    };
    db.savePurchase(testPurchase);

    // Initial payment voucher of 41000 allocates to the purchase
    const voucherId = 'VOUCHER-TALUKDER-001';
    const initialVoucher: Voucher = {
      id: voucherId,
      voucherNumber: 'PMT-2026-001',
      date: '2026-11-13',
      voucherType: 'PAYMENT',
      partyId: 'PTY-002',
      partyName: 'Beta Suppliers',
      totalAmount: 41000,
      narration: 'Initial full payment',
      createdAt: '2026-11-13T03:00:00.000Z',
      entries: [
        { accountId: 'ACC_SUPPLIER', accountName: 'Beta Suppliers', debit: 41000, credit: 0 },
        { accountId: 'ACC_CASH', accountName: 'Cash-in-hand', debit: 0, credit: 41000 },
      ],
      paymentAllocations: [
        {
          documentId: purId,
          documentType: 'PURCHASE',
          documentNumber: 'BILL-TALUKDER-001',
          amount: 41000,
        },
      ],
    };
    db.savePaymentVoucher(initialVoucher);

    // Purchase is now paid in full (41000) with matching twins
    let storedPur = db.getPurchases().find((p) => p.id === purId)!;
    expect(storedPur.paidAmount).toBe(41000);
    expect(storedPur.balanceAmount).toBe(0);
    expect(Reflect.get(storedPur, 'paidAmountPaise')).toBe(4100000);
    expect(Reflect.get(storedPur, 'balanceAmountPaise')).toBe(0);

    // 2. Now EDIT the payment voucher from 41000 down to 35000 (Talukder Hardware scenario):
    // Voucher amount moves 41000 -> 35000.
    // savePaymentVoucher internally executes:
    // reverseAllocations -> saveVoucher -> applyAllocations -> savePurchase
    const editedVoucher: Voucher = {
      ...initialVoucher,
      totalAmount: 35000,
      narration: 'Edited payment: partial 35000',
      entries: [
        { accountId: 'ACC_SUPPLIER', accountName: 'Beta Suppliers', debit: 35000, credit: 0 },
        { accountId: 'ACC_CASH', accountName: 'Cash-in-hand', debit: 0, credit: 35000 },
      ],
      paymentAllocations: [
        {
          documentId: purId,
          documentType: 'PURCHASE',
          documentNumber: 'BILL-TALUKDER-001',
          amount: 35000,
        },
      ],
    };
    db.savePaymentVoucher(editedVoucher);

    // 3. Verify the purchase after savePaymentVoucher -> applyAllocations -> savePurchase:
    storedPur = db.getPurchases().find((p) => p.id === purId)!;
    expect(storedPur.paidAmount).toBe(35000);
    expect(storedPur.balanceAmount).toBe(6000);
    // Crucial: assert the *Paise twins match the rupee values!
    expect(Reflect.get(storedPur, 'paidAmountPaise')).toBe(3500000);
    expect(Reflect.get(storedPur, 'balanceAmountPaise')).toBe(600000);
    expect(storedPur.paymentSplits?.length).toBeGreaterThan(0);
    const split0 = storedPur.paymentSplits![0];
    expect(split0.amount).toBe(35000);
    expect((split0 as any).amountPaise).toBe(3500000);
    const split1 = storedPur.paymentSplits![1];
    expect(split1.amount).toBe(6000);
    expect((split1 as any).amountPaise).toBe(600000);

    // Integrity check clean
    expect(verifyPaiseFields(storedPur)).toEqual([]);
  });
});
