import { describe, it, expect, beforeEach } from 'vitest';

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

import { db } from '../services/db.ts';
import {
  createSalesInvoiceVoucher,
  createPurchaseInvoiceVoucher,
  createPaymentReceiptVoucher,
  createPaymentOutVoucher,
  resolveAccountForSplit,
  validateVoucherBalance,
} from '../core/accounting/ledger.ts';
import {
  derivePaymentSettlement,
  parseSplitsFromInvoice,
  parseSplitsFromPurchase,
} from '../core/accounting/paymentSplitUtils.ts';
import { computeCashBankSummary } from '../core/accounting/cashBankCalculator.ts';
import { migrateLegacyPaymentSplits } from '../services/db/migrateLegacySplits.ts';
import { reconcileAndRepairLedgerAndInventory } from '../services/db/reconcileAndRepair.ts';
import { Invoice, PaymentSplit } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { BankAccount } from '../models/bankAccount.ts';

describe('Phase 4: Split-Bank Architecture & Legacy Migration Suite', () => {
  beforeEach(() => {
    testStorage.clear();
  });

  const customBank: BankAccount = {
    id: 'ACC_HDFC_CORP_01',
    accountName: 'HDFC Corporate Current A/C',
    accountType: 'BANK',
    accountNumber: '50200012345678',
    ifscCode: 'HDFC0001234',
    branchName: 'Nariman Point',
    openingBalance: 50000,
    isDefault: false,
    createdAt: '2026-10-21T00:00:00Z',
    updatedAt: '2026-10-21T00:00:00Z',
  };

  it('4.1: resolveAccountForSplit resolves explicit accountId and falls back appropriately', () => {
    // Explicit custom bank account on split
    const resolvedCustom = resolveAccountForSplit({
      mode: 'UPI',
      accountId: 'ACC_HDFC_CORP_01',
      accountName: 'HDFC Corporate Current A/C',
    });
    expect(resolvedCustom.accountId).toBe('ACC_HDFC_CORP_01');
    expect(resolvedCustom.accountName).toBe('HDFC Corporate Current A/C');

    // Split without accountId uses fallback default bank
    const resolvedFallback = resolveAccountForSplit(
      { mode: 'BANK' },
      'ACC_ICICI_DEF',
      'ICICI Primary Bank'
    );
    expect(resolvedFallback.accountId).toBe('ACC_ICICI_DEF');
    expect(resolvedFallback.accountName).toBe('ICICI Primary Bank');

    // Cash mode always resolves to ACC_CASH
    const resolvedCash = resolveAccountForSplit({
      mode: 'CASH',
    });
    expect(resolvedCash.accountId).toBe('ACC_CASH');
    expect(resolvedCash.accountName).toBe('Cash-in-hand');
  });

  it('4.2: custom bank account split produces voucher entries on that specific account', () => {
    db.saveBankAccount(customBank);

    const splits: PaymentSplit[] = [
      {
        id: 'split-cash',
        mode: 'CASH',
        amount: 300,
        accountId: 'ACC_CASH',
        accountName: 'Cash-in-hand',
      },
      {
        id: 'split-hdfc',
        mode: 'UPI',
        amount: 880,
        accountId: customBank.id,
        accountName: customBank.accountName,
        reference: 'UPI/HDFC/998877',
      },
    ];

    // Sales Invoice Voucher
    const salesVoucher = createSalesInvoiceVoucher({
      invoiceNumber: 'INV/2026/001',
      date: '2026-10-21',
      customerName: 'Enterprise Client',
      customerId: 'CUST-ENT-01',
      taxableAmount: 1000,
      cgstAmount: 90,
      sgstAmount: 90,
      grandTotal: 1180,
      isCashSale: false,
      paymentSplits: splits,
    });

    const validation = validateVoucherBalance(salesVoucher.entries);
    expect(validation.isBalanced).toBe(true);

    const hdfcEntry = salesVoucher.entries.find((e) => e.accountId === customBank.id);
    expect(hdfcEntry).toBeDefined();
    expect(hdfcEntry?.accountName).toBe('HDFC Corporate Current A/C');
    expect(hdfcEntry?.debit).toBe(880);

    const cashEntry = salesVoucher.entries.find((e) => e.accountId === 'ACC_CASH');
    expect(cashEntry).toBeDefined();
    expect(cashEntry?.debit).toBe(300);

    // No entry should hit generic ACC_BANK
    const genericBank = salesVoucher.entries.find((e) => e.accountId === 'ACC_BANK');
    expect(genericBank).toBeUndefined();

    // Purchase Invoice Voucher
    const purchaseVoucher = createPurchaseInvoiceVoucher({
      billNumber: 'PUR/2026/001',
      date: '2026-10-21',
      supplierName: 'Wholesale Supplier',
      supplierId: 'SUP-WHOLE-01',
      taxableAmount: 1000,
      cgstAmount: 90,
      sgstAmount: 90,
      grandTotal: 1180,
      paymentSplits: splits,
    });

    const purValidation = validateVoucherBalance(purchaseVoucher.entries);
    expect(purValidation.isBalanced).toBe(true);

    const purHdfcEntry = purchaseVoucher.entries.find((e) => e.accountId === customBank.id);
    expect(purHdfcEntry).toBeDefined();
    expect(purHdfcEntry?.credit).toBe(880);

    // Payment Receipt Voucher
    const receiptVoucher = createPaymentReceiptVoucher({
      receiptNumber: 'RCP/2026/001',
      date: '2026-10-21',
      customerId: 'CUST-ENT-01',
      customerName: 'Enterprise Client',
      amount: 880,
      paymentSplits: [splits[1]], // HDFC split
    });
    expect(receiptVoucher.entries.find((e) => e.accountId === customBank.id)?.debit).toBe(880);

    // Payment Out Voucher
    const paymentOutVoucher = createPaymentOutVoucher({
      voucherNumber: 'PAY/2026/001',
      date: '2026-10-21',
      supplierId: 'SUP-WHOLE-01',
      supplierName: 'Wholesale Supplier',
      amount: 880,
      paymentSplits: [splits[1]],
    });
    expect(paymentOutVoucher.entries.find((e) => e.accountId === customBank.id)?.credit).toBe(880);
  });

  it('4.3: computeCashBankSummary routes split tenders to their designated bank accounts', () => {
    db.saveBankAccount(customBank);

    const invoice: Invoice = {
      id: 'INV-SPLIT-BANK-01',
      invoiceNumber: 'INV/SB/01',
      invoiceType: 'B2B',
      date: '2026-10-21',
      partyName: 'Corporate Buyer',
      partyAddress: 'Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [],
      totalGrossAmount: 2000,
      totalDiscount: 0,
      totalTaxableAmount: 2000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 2000,
      amountInWords: 'Two Thousand Only',
      paidAmount: 2000,
      balanceAmount: 0,
      paymentMode: 'SPLIT',
      paymentStatus: 'PAID',
      paymentSplits: [
        { id: 's1', mode: 'CASH', amount: 500, accountId: 'ACC_CASH', accountName: 'Cash-in-hand' },
        { id: 's2', mode: 'UPI', amount: 1500, accountId: customBank.id, accountName: customBank.accountName },
      ],
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveInvoice(invoice);

    const summary = computeCashBankSummary({
      accounts: db.getBankAccounts(),
      invoices: db.getInvoices(),
      purchases: db.getPurchases(),
      expenses: db.getExpenses(),
      vouchers: db.getVouchers(),
      transactions: db.getCashBankTransactions(),
    });
    // Opening balance 50,000 + 1,500 UPI = 51,500
    expect(summary.accountBalances[customBank.id]).toBe(51500);

    // Cash inflow of ₹500
    expect(summary.accountBalances['ACC_CASH']).toBe(500);
  });

  it('4.4: accountId, accountName, and references survive save -> read -> edit -> save cycle', () => {
    const inv: Invoice = {
      id: 'INV-PERSIST-01',
      invoiceNumber: 'INV/PER/01',
      invoiceType: 'B2B',
      date: '2026-10-21',
      partyName: 'Persistence Check',
      partyAddress: 'Pune',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [],
      totalGrossAmount: 3000,
      totalDiscount: 0,
      totalTaxableAmount: 3000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 3000,
      amountInWords: 'Three Thousand Only',
      paidAmount: 2000,
      balanceAmount: 1000,
      paymentMode: 'SPLIT',
      paymentStatus: 'PARTIAL',
      paymentSplits: [
        {
          id: 'sp-1',
          mode: 'CASH',
          amount: 500,
          accountId: 'ACC_CASH',
          accountName: 'Cash-in-hand',
          reference: 'COUNTER-01',
        },
        {
          id: 'sp-2',
          mode: 'CARD',
          amount: 1500,
          accountId: customBank.id,
          accountName: customBank.accountName,
          reference: 'TXN-CARD-9911',
          referenceNo: 'TXN-CARD-9911',
        },
        {
          id: 'sp-3',
          mode: 'CREDIT',
          amount: 1000,
        },
      ],
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };

    // 1. Initial Save
    db.saveInvoice(inv);

    // 2. Read back
    const stored = db.getInvoices().find((i) => i.id === inv.id);
    expect(stored).toBeDefined();
    expect(stored?.paymentSplits?.length).toBe(3);
    expect(stored?.paymentSplits?.[1].accountId).toBe(customBank.id);
    expect(stored?.paymentSplits?.[1].accountName).toBe(customBank.accountName);
    expect(stored?.paymentSplits?.[1].reference).toBe('TXN-CARD-9911');

    // 3. Edit invoice and re-save
    const edited: Invoice = {
      ...stored!,
      notes: 'Customer requested GST invoice copy',
      updatedAt: '2026-10-21T01:00:00Z',
    };
    db.saveInvoice(edited);

    // 4. Read back edited invoice
    const storedAgain = db.getInvoices().find((i) => i.id === inv.id);
    expect(storedAgain?.paymentSplits?.[1].accountId).toBe(customBank.id);
    expect(storedAgain?.paymentSplits?.[1].accountName).toBe(customBank.accountName);
    expect(storedAgain?.paymentSplits?.[1].reference).toBe('TXN-CARD-9911');

    // Test the same cycle for PurchaseBill
    const bill: PurchaseBill = {
      id: 'PUR-PERSIST-01',
      billNumber: 'BILL/PER/01',
      supplierId: 'SUP-PER-01',
      supplierName: 'Persistence Supplier',
      supplierAddress: 'Pune',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      itcEligibility: 'ALL_OTHER_ITC',
      isRcm: false,
      items: [],
      date: '2026-10-21',
      totalGrossAmount: 1200,
      totalDiscount: 0,
      totalTaxableAmount: 1200,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 1200,
      paidAmount: 1200,
      balanceAmount: 0,
      paymentMode: 'UPI',
      paymentStatus: 'PAID',
      paymentSplits: [
        {
          id: 'sp-pur-1',
          mode: 'UPI',
          amount: 1200,
          accountId: customBank.id,
          accountName: customBank.accountName,
          reference: 'UPI-SUP-4455',
        },
      ],
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };

    db.savePurchase(bill);
    const storedBill = db.getPurchases().find((p) => p.id === bill.id);
    expect(storedBill?.paymentSplits?.[0].accountId).toBe(customBank.id);
    expect(storedBill?.paymentSplits?.[0].accountName).toBe(customBank.accountName);
    expect(storedBill?.paymentSplits?.[0].reference).toBe('UPI-SUP-4455');
  });

  it('4.5: derivePaymentSettlement correctly handles full, partial, credit-only, and overpaid tenders', () => {
    // A. Overpaid tender: Grand Total 420, Tendered 500 in Cash
    const overpaidSettlement = derivePaymentSettlement({
      grandTotal: 420,
      paidAmount: 500,
      balanceAmount: 0,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paymentSplits: [{ id: 's1', mode: 'CASH', amount: 500 }],
    });
    // Paid amount clamped to grandTotal
    expect(overpaidSettlement.paidAmount).toBe(420);
    expect(overpaidSettlement.balanceAmount).toBe(0);
    expect(overpaidSettlement.paymentStatus).toBe('PAID');
    // Cash split clamped to exclude returned change
    expect(overpaidSettlement.paymentSplits?.[0].amount).toBe(420);
    expect(overpaidSettlement.notes).toContain('Cash ₹420');

    // B. Partial tender: Grand Total 1000, Paid 400, Credit 600
    const partialSettlement = derivePaymentSettlement({
      grandTotal: 1000,
      paidAmount: 400,
      balanceAmount: 600,
      paymentMode: 'SPLIT',
      paymentStatus: 'PARTIAL',
      paymentSplits: [
        { id: 's1', mode: 'CASH', amount: 400 },
        { id: 's2', mode: 'CREDIT', amount: 600 },
      ],
    });
    expect(partialSettlement.paidAmount).toBe(400);
    expect(partialSettlement.balanceAmount).toBe(600);
    expect(partialSettlement.paymentStatus).toBe('PARTIAL');
    expect(partialSettlement.paymentMode).toBe('SPLIT');

    // C. Credit-only tender: caller mistakenly supplies CASH mode and PAID status
    const creditSettlement = derivePaymentSettlement({
      grandTotal: 1500,
      paidAmount: 0,
      balanceAmount: 1500,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paymentSplits: [{ id: 's1', mode: 'CREDIT', amount: 1500 }],
    });
    expect(creditSettlement.paidAmount).toBe(0);
    expect(creditSettlement.balanceAmount).toBe(1500);
    expect(creditSettlement.paymentStatus).toBe('UNPAID');
    expect(creditSettlement.paymentMode).toBe('CREDIT');

    // D. Full single-mode bank tender: Grand Total 2500
    const fullSettlement = derivePaymentSettlement({
      grandTotal: 2500,
      paidAmount: 2500,
      balanceAmount: 0,
      paymentMode: 'UPI',
      paymentStatus: 'PAID',
      bankAccountId: customBank.id,
      bankAccountName: customBank.accountName,
    });
    expect(fullSettlement.paidAmount).toBe(2500);
    expect(fullSettlement.balanceAmount).toBe(0);
    expect(fullSettlement.paymentStatus).toBe('PAID');
    expect(fullSettlement.paymentSplits?.[0].accountId).toBe(customBank.id);

    // E. Partial CREDIT tender preserves paidAmount: Grand Total 1000, paidAmount 200 -> balance 800, status PARTIAL
    const partialCreditSettlement = derivePaymentSettlement({
      grandTotal: 1000,
      paidAmount: 200,
      balanceAmount: 800,
      paymentMode: 'CREDIT',
      paymentStatus: 'PARTIAL',
    });
    expect(partialCreditSettlement.paidAmount).toBe(200);
    expect(partialCreditSettlement.balanceAmount).toBe(800);
    expect(partialCreditSettlement.paymentStatus).toBe('PARTIAL');
  });

  it('4.6: parseSplitsFromInvoice and parseSplitsFromPurchase preserve existing split account metadata', () => {
    const existingSplits: PaymentSplit[] = [
      {
        id: 'split-1',
        mode: 'UPI',
        amount: 800,
        accountId: 'ACC_HDFC_01',
        accountName: 'HDFC Bank',
        reference: 'UPI/REF/11',
      },
      {
        id: 'split-2',
        mode: 'CASH',
        amount: 200,
        accountId: 'ACC_CASH',
        accountName: 'Cash-in-hand',
      },
    ];

    const parsedInvoiceSplits = parseSplitsFromInvoice(
      { paymentSplits: existingSplits } as any,
      1000
    );
    expect(parsedInvoiceSplits.length).toBe(2);
    expect(parsedInvoiceSplits[0].accountId).toBe('ACC_HDFC_01');
    expect(parsedInvoiceSplits[0].accountName).toBe('HDFC Bank');
    expect(parsedInvoiceSplits[0].reference).toBe('UPI/REF/11');

    const parsedPurchaseSplits = parseSplitsFromPurchase(
      { paymentSplits: existingSplits } as any,
      1000
    );
    expect(parsedPurchaseSplits.length).toBe(2);
    expect(parsedPurchaseSplits[0].accountId).toBe('ACC_HDFC_01');
    expect(parsedPurchaseSplits[0].accountName).toBe('HDFC Bank');
    expect(parsedPurchaseSplits[0].reference).toBe('UPI/REF/11');
  });

  it('4.7: migrateLegacyPaymentSplits is idempotent, fills missing account metadata, and gates with pre-migration backup', async () => {
    // Set up default bank
    db.saveBankAccount({
      id: 'ACC_DEFAULT_BANK',
      accountName: 'Primary Business Bank',
      accountType: 'BANK',
      accountNumber: '9998887771',
      ifscCode: 'ICIC0000001',
      branchName: 'Main',
      openingBalance: 10000,
      isDefault: true,
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    });

    // 1. Create a legacy invoice with notes-based split but no structured paymentSplits
    const legacyInv: Invoice = {
      id: 'INV-LEGACY-01',
      invoiceNumber: 'INV/LEG/01',
      invoiceType: 'B2B',
      date: '2026-10-21',
      partyName: 'Legacy Customer',
      partyAddress: 'Delhi',
      partyStateCode: '07',
      placeOfSupplyStateCode: '07',
      isIntraState: true,
      items: [],
      totalGrossAmount: 1000,
      totalDiscount: 0,
      totalTaxableAmount: 1000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 1000,
      amountInWords: 'One Thousand Only',
      paidAmount: 1000,
      balanceAmount: 0,
      paymentMode: 'SPLIT',
      paymentStatus: 'PAID',
      notes: 'Split: CASH: ₹400, UPI: ₹600',
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveInvoice(legacyInv);

    // 2. Create a legacy purchase bill with raw splits lacking accountId
    const legacyBill: PurchaseBill = {
      id: 'PUR-LEGACY-01',
      billNumber: 'BILL/LEG/01',
      supplierId: 'SUP-LEG-01',
      supplierName: 'Legacy Supplier',
      supplierAddress: 'Delhi',
      supplierStateCode: '07',
      placeOfSupplyStateCode: '07',
      isIntraState: true,
      itcEligibility: 'ALL_OTHER_ITC',
      isRcm: false,
      items: [],
      date: '2026-10-21',
      totalGrossAmount: 1500,
      totalDiscount: 0,
      totalTaxableAmount: 1500,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 1500,
      paidAmount: 1500,
      balanceAmount: 0,
      paymentMode: 'SPLIT',
      paymentStatus: 'PAID',
      paymentSplits: [
        { id: 's1', mode: 'CASH', amount: 500 },
        { id: 's2', mode: 'BANK', amount: 1000 },
      ],
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.savePurchase(legacyBill);

    // First migration run: must create verified backup and migrate documents
    const firstMigration = await migrateLegacyPaymentSplits();
    expect(firstMigration.success).toBe(true);
    expect(firstMigration.backupCreated).toBe(true);
    expect(firstMigration.invoicesMigrated).toBe(1);
    expect(firstMigration.purchasesMigrated).toBe(1);
    expect(firstMigration.totalSplitsUpdated).toBeGreaterThanOrEqual(4);

    // Verify migrated invoice splits
    const migratedInv = db.getInvoices().find((i) => i.id === legacyInv.id);
    expect(migratedInv?.paymentSplits?.length).toBe(2);
    const invCashSplit = migratedInv?.paymentSplits?.find((s) => s.mode === 'CASH');
    expect(invCashSplit?.accountId).toBe('ACC_CASH');
    const invUpiSplit = migratedInv?.paymentSplits?.find((s) => s.mode === 'UPI');
    expect(invUpiSplit?.accountId).toBe('ACC_DEFAULT_BANK');
    expect(invUpiSplit?.accountName).toBe('Primary Business Bank');

    // Verify migrated purchase splits
    const migratedBill = db.getPurchases().find((p) => p.id === legacyBill.id);
    expect(migratedBill?.paymentSplits?.length).toBe(2);
    const billBankSplit = migratedBill?.paymentSplits?.find((s) => s.mode === 'BANK');
    expect(billBankSplit?.accountId).toBe('ACC_DEFAULT_BANK');

    // Second migration run: strictly idempotent (zero modifications, no duplicate backup)
    const secondMigration = await migrateLegacyPaymentSplits();
    expect(secondMigration.success).toBe(true);
    expect(secondMigration.backupCreated).toBe(false);
    expect(secondMigration.invoicesMigrated).toBe(0);
    expect(secondMigration.purchasesMigrated).toBe(0);
    expect(secondMigration.totalSplitsUpdated).toBe(0);

    // Running reconcileAndRepairLedgerAndInventory should also report 0 additional split migrations
    const repairReport = await reconcileAndRepairLedgerAndInventory();
    expect(repairReport.success).toBe(true);
    expect(repairReport.splitsMigrated).toBe(0);
  });
});
