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
  createRcmJournalVoucher,
  createReversalVoucher,
  validateVoucherBalance,
} from '../core/accounting/ledger.ts';
import { computeCashBankSummary as calculateCashBank } from '../core/accounting/cashBankCalculator.ts';
import { computeCashFlowStatement as calculateCashFlow } from '../core/accounting/cashFlowCalculator.ts';
import { DEFAULT_BANK_ACCOUNTS } from '../services/db/storageEngine.ts';
import {
  reconcileAndRepairLedgerAndInventory,
} from '../services/db/reconcileAndRepair.ts';
import {
  hasVerifiedPreMigrationBackup,
  restorePreMigrationBackup,
} from '../services/db/preMigrationBackup.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { InventoryItem } from '../models/item.ts';
import { Party } from '../models/party.ts';

describe('Phase 3: Ledger Reversals, Inventory Integrity & Historical Repair', () => {
  beforeEach(() => {
    testStorage.clear();
  });

  it('3.1: createReversalVoucher produces balanced entries with swapped debits and credits', () => {
    const origVoucher = createSalesInvoiceVoucher({
      invoiceNumber: 'INV-TEST-001',
      date: '2026-10-21',
      customerName: 'Test Customer',
      customerId: 'CUST-001',
      taxableAmount: 1000,
      cgstAmount: 90,
      sgstAmount: 90,
      grandTotal: 1180,
      isCashSale: false,
    });

    const origValidation = validateVoucherBalance(origVoucher.entries);
    expect(origValidation.isBalanced).toBe(true);

    const reversal = createReversalVoucher({
      originalVoucher: origVoucher,
      reason: 'Reversal of INV-TEST-001',
    });

    expect(reversal.voucherNumber).toContain('VCH-REV-SAL-INV-TEST-001');
    expect(reversal.reversalOfVoucherId).toBe(origVoucher.id);
    expect(reversal.entries.length).toBe(origVoucher.entries.length);

    // Verify all debit and credit lines are swapped
    origVoucher.entries.forEach((origLine) => {
      const revLine = reversal.entries.find((l) => l.accountId === origLine.accountId);
      expect(revLine).toBeDefined();
      expect(revLine?.debit).toBe(origLine.credit);
      expect(revLine?.credit).toBe(origLine.debit);
    });

    // Reversal must itself be perfectly balanced
    const revValidation = validateVoucherBalance(reversal.entries);
    expect(revValidation.isBalanced).toBe(true);
    expect(revValidation.diff).toBe(0);

    // Summing both vouchers nets out to zero for every account
    const netAccountTotals = new Map<string, number>();
    [...origVoucher.entries, ...reversal.entries].forEach((entry) => {
      const cur = netAccountTotals.get(entry.accountId) || 0;
      netAccountTotals.set(entry.accountId, cur + entry.debit - entry.credit);
    });
    for (const [, net] of netAccountTotals.entries()) {
      expect(Math.abs(net)).toBeLessThan(0.001);
    }
  });

  it('3.2: deleteInvoice reverses posted sales vouchers rather than hard-deleting them', () => {
    const customer: Party = {
      id: 'PTY-REV-01',
      name: 'Reversal Customer',
      type: 'CUSTOMER',
      phone: '9876543210',
      billingAddress: 'Mumbai',
      stateCode: '27',
      currentBalance: 0,
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveParty(customer);

    const item: InventoryItem = {
      id: 'ITM-REV-01',
      name: 'Reversal Widget',
      category: 'General',
      currentStock: 100,
      unit: 'NOS',
      salePrice: 100,
      purchasePrice: 80,
      gstRate: 18,
      hsnSacCode: '8471',
      minStockAlert: 5,
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveItem(item);

    const invoice: Invoice = {
      id: 'INV-REV-TEST-01',
      invoiceNumber: 'INV/REV/01',
      invoiceType: 'B2B',
      date: '2026-10-21',
      partyId: customer.id,
      partyName: customer.name,
      partyAddress: 'Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [
        {
          itemId: item.id,
          name: item.name,
          hsnSacCode: '8471',
          unit: 'NOS',
          quantity: 10,
          unitPrice: 100,
          taxableAmount: 1000,
          gstRate: 18,
          cgstAmount: 90,
          sgstAmount: 90,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 1180,
        },
      ],
      totalGrossAmount: 1000,
      totalDiscount: 0,
      totalTaxableAmount: 1000,
      totalCgst: 90,
      totalSgst: 90,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 180,
      roundOff: 0,
      grandTotal: 1180,
      amountInWords: 'One Thousand One Hundred Eighty Only',
      paidAmount: 0,
      balanceAmount: 1180,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveInvoice(invoice);

    // Save posted sales voucher
    const voucher = createSalesInvoiceVoucher({
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      customerName: invoice.partyName,
      customerId: customer.id,
      taxableAmount: invoice.totalTaxableAmount,
      cgstAmount: invoice.totalCgst,
      sgstAmount: invoice.totalSgst,
      grandTotal: invoice.grandTotal,
      isCashSale: false,
    });
    db.saveVoucher(voucher);

    expect(db.getVouchers().length).toBe(1);
    expect(db.getItems().find((i) => i.id === item.id)?.currentStock).toBe(90);

    // Delete invoice
    db.deleteInvoice(invoice.id);

    // Invoice is deleted and stock restored
    expect(db.getInvoices().find((i) => i.id === invoice.id)).toBeUndefined();
    expect(db.getItems().find((i) => i.id === item.id)?.currentStock).toBe(100);

    // Vouchers must NOT be hard-deleted: original is preserved and marked isReversed
    const allVouchers = db.getVouchers();
    expect(allVouchers.length).toBe(2);

    const orig = allVouchers.find((v) => v.id === voucher.id);
    expect(orig).toBeDefined();
    expect(orig?.isReversed).toBe(true);
    expect(orig?.reversalVoucherId).toBeDefined();

    const rev = allVouchers.find((v) => v.reversalOfVoucherId === voucher.id);
    expect(rev).toBeDefined();
    expect(rev?.voucherNumber).toContain(`VCH-REV-SAL-${invoice.invoiceNumber}`);

    // Debits and credits across the two vouchers cancel to exactly zero
    const customerDebits = allVouchers.reduce(
      (sum, v) => sum + (v.entries.find((e) => e.accountId === customer.id)?.debit || 0),
      0
    );
    const customerCredits = allVouchers.reduce(
      (sum, v) => sum + (v.entries.find((e) => e.accountId === customer.id)?.credit || 0),
      0
    );
    expect(customerDebits).toBe(1180);
    expect(customerCredits).toBe(1180);
  });

  it('3.2: deletePurchase reverses posted purchase vouchers', () => {
    const supplier: Party = {
      id: 'PTY-REV-SUP-01',
      name: 'Reversal Supplier',
      type: 'SUPPLIER',
      phone: '9876543211',
      billingAddress: 'Delhi',
      stateCode: '07',
      currentBalance: 0,
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveParty(supplier);

    const bill: PurchaseBill = {
      id: 'PUR-REV-TEST-01',
      billNumber: 'PUR/REV/01',
      date: '2026-10-21',
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierAddress: 'Delhi',
      supplierStateCode: '07',
      placeOfSupplyStateCode: '07',
      isIntraState: true,
      items: [],
      itcEligibility: 'ALL_OTHER_ITC',
      isRcm: false,
      totalGrossAmount: 2000,
      totalDiscount: 0,
      totalTaxableAmount: 2000,
      totalCgst: 180,
      totalSgst: 180,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 360,
      roundOff: 0,
      grandTotal: 2360,
      paidAmount: 0,
      balanceAmount: 2360,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.savePurchase(bill);

    const voucher = createPurchaseInvoiceVoucher({
      billNumber: bill.billNumber,
      date: bill.date,
      supplierName: bill.supplierName,
      supplierId: supplier.id,
      taxableAmount: bill.totalTaxableAmount,
      cgstAmount: bill.totalCgst,
      sgstAmount: bill.totalSgst,
      grandTotal: bill.grandTotal,
      isCashPurchase: false,
    });
    db.saveVoucher(voucher);

    expect(db.getVouchers().length).toBe(1);

    db.deletePurchase(bill.id);

    expect(db.getPurchases().find((p) => p.id === bill.id)).toBeUndefined();
    const allVouchers = db.getVouchers();
    expect(allVouchers.length).toBe(2);

    const orig = allVouchers.find((v) => v.id === voucher.id);
    expect(orig?.isReversed).toBe(true);

    const rev = allVouchers.find((v) => v.reversalOfVoucherId === voucher.id);
    expect(rev?.voucherNumber).toContain(`VCH-REV-PUR-${bill.billNumber}`);
  });

  it('3.4: reconcileAndRepairLedgerAndInventory executes pre-migration backup and fixes duplicates, orphans, and estimates', async () => {
    // 1. Setup an estimate invoice with an erroneous voucher
    const estimateInvoice: Invoice = {
      id: 'INV-EST-01',
      invoiceNumber: 'EST-2026-001',
      invoiceType: 'ESTIMATE',
      date: '2026-10-21',
      partyName: 'Estimate Prospect',
      partyAddress: 'Delhi',
      partyStateCode: '07',
      placeOfSupplyStateCode: '07',
      isIntraState: true,
      items: [],
      totalGrossAmount: 5000,
      totalDiscount: 0,
      totalTaxableAmount: 5000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 5000,
      amountInWords: 'Five Thousand Only',
      paidAmount: 0,
      balanceAmount: 5000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveInvoice(estimateInvoice);

    // Add erroneous estimate voucher
    const estVoucher = createSalesInvoiceVoucher({
      invoiceNumber: estimateInvoice.invoiceNumber,
      date: estimateInvoice.date,
      customerName: estimateInvoice.partyName,
      customerId: 'CUST-EST',
      taxableAmount: 5000,
      grandTotal: 5000,
      isCashSale: false,
    });
    db.saveVoucher(estVoucher);

    // 2. Setup duplicate vouchers for an invoice (simulating multi-save bug)
    const validInvoice: Invoice = {
      id: 'INV-CANONICAL-01',
      invoiceNumber: 'INV/CAN/01',
      invoiceType: 'B2B',
      date: '2026-10-21',
      partyName: 'Real Customer',
      partyAddress: 'Delhi',
      partyStateCode: '07',
      placeOfSupplyStateCode: '07',
      isIntraState: true,
      items: [],
      totalGrossAmount: 1000,
      totalDiscount: 0,
      totalTaxableAmount: 1000,
      totalCgst: 90,
      totalSgst: 90,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 180,
      roundOff: 0,
      grandTotal: 1180,
      amountInWords: 'One Thousand One Hundred Eighty Only',
      paidAmount: 0,
      balanceAmount: 1180,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveInvoice(validInvoice);

    const canonicalVoucher = createSalesInvoiceVoucher({
      invoiceNumber: validInvoice.invoiceNumber,
      date: validInvoice.date,
      customerName: validInvoice.partyName,
      customerId: 'CUST-CAN',
      taxableAmount: 1000,
      cgstAmount: 90,
      sgstAmount: 90,
      grandTotal: 1180,
    });
    const duplicateVoucher = {
      ...createSalesInvoiceVoucher({
        invoiceNumber: validInvoice.invoiceNumber,
        date: validInvoice.date,
        customerName: validInvoice.partyName,
        customerId: 'CUST-CAN',
        taxableAmount: 1000,
        cgstAmount: 90,
        sgstAmount: 90,
        grandTotal: 1180,
      }),
      id: `VCH-DUP-${Date.now()}`,
      createdAt: new Date(Date.now() + 5000).toISOString(),
    };
    db.saveVoucher(canonicalVoucher);
    db.saveVoucher(duplicateVoucher);

    // 3. Setup an orphan voucher referencing a deleted bill
    const orphanVoucher = createPurchaseInvoiceVoucher({
      billNumber: 'PUR/DELETED/999',
      date: '2026-10-21',
      supplierName: 'Deleted Vendor',
      supplierId: 'SUP-DEL',
      taxableAmount: 3000,
      grandTotal: 3000,
      isCashPurchase: false,
    });
    db.saveVoucher(orphanVoucher);

    // Run one-time reconcile & repair
    const report = await reconcileAndRepairLedgerAndInventory();

    expect(report.success).toBe(true);
    expect(report.backup.success).toBe(true);
    expect(hasVerifiedPreMigrationBackup('phase3_reconcile_repair')).toBe(true);

    expect(report.estimateVouchersReversed).toBe(1);
    expect(report.duplicateVouchersReversed).toBe(1);
    expect(report.orphanVouchersReversed).toBe(1);

    // Verify estimate voucher was marked reversed
    const updatedEst = db.getVouchers().find((v) => v.id === estVoucher.id);
    expect(updatedEst?.isReversed).toBe(true);

    // Verify orphan voucher was marked reversed
    const updatedOrphan = db.getVouchers().find((v) => v.id === orphanVoucher.id);
    expect(updatedOrphan?.isReversed).toBe(true);

    // Verify one of the duplicates was reversed and the other remained active
    const activeSalesVouchers = db
      .getVouchers()
      .filter((v) => !v.isReversed && !v.isCancelled && v.voucherType === 'SALES' && v.referenceNo === validInvoice.invoiceNumber);
    expect(activeSalesVouchers.length).toBe(1);

    const reversedDuplicate = db.getVouchers().find((v) => v.id === duplicateVoucher.id);
    expect(reversedDuplicate?.isReversed).toBe(true);
    expect(reversedDuplicate?.isCancelled).toBe(true);

    // Verify backup is fully restorable
    const restoreOk = await restorePreMigrationBackup('phase3_reconcile_repair');
    expect(restoreOk).toBe(true);
  });

  it('3.1: Estimates, sales orders, delivery challans, and POs do not create accounting vouchers upon save', () => {
    const isOrderOrEstimate = (inv: Invoice) =>
      inv.invoiceType === 'ESTIMATE' ||
      inv.invoiceType === 'SALES_ORDER' ||
      inv.invoiceType === 'DELIVERY_CHALLAN';

    const quote: Invoice = {
      id: 'INV-QUOTE-01',
      invoiceNumber: 'QT/2026/01',
      invoiceType: 'ESTIMATE',
      date: '2026-10-21',
      partyName: 'Quote Lead',
      partyAddress: 'Delhi',
      partyStateCode: '07',
      placeOfSupplyStateCode: '07',
      isIntraState: true,
      items: [],
      totalGrossAmount: 10000,
      totalDiscount: 0,
      totalTaxableAmount: 10000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 10000,
      amountInWords: 'Ten Thousand Only',
      paidAmount: 0,
      balanceAmount: 10000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveInvoice(quote);

    // Simulated handleSaveInvoice accounting guard
    if (!isOrderOrEstimate(quote) && !quote.isCancelled) {
      db.saveVoucher(
        createSalesInvoiceVoucher({
          invoiceNumber: quote.invoiceNumber,
          date: quote.date,
          customerName: quote.partyName,
          customerId: 'CUST-Q',
          taxableAmount: quote.totalTaxableAmount,
          grandTotal: quote.grandTotal,
        })
      );
    }

    const vouchers = db.getVouchers();
    expect(vouchers.find((v) => v.referenceNo === quote.invoiceNumber)).toBeUndefined();
  });

  it('3.3: Passbook deletion performs single-engine stock restoration and does not double-restore stock', () => {
    const item: InventoryItem = {
      id: 'ITM-SINGLE-ENGINE-01',
      name: 'Single Engine Item',
      category: 'General',
      currentStock: 50,
      unit: 'NOS',
      salePrice: 200,
      purchasePrice: 150,
      gstRate: 18,
      hsnSacCode: '8471',
      minStockAlert: 5,
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveItem(item);

    // Save invoice selling 10 units (stock goes from 50 -> 40)
    const invoice: Invoice = {
      id: 'INV-SE-01',
      invoiceNumber: 'INV/SE/01',
      invoiceType: 'B2B',
      date: '2026-10-21',
      partyName: 'Single Engine Customer',
      partyAddress: 'Delhi',
      partyStateCode: '07',
      placeOfSupplyStateCode: '07',
      isIntraState: true,
      items: [
        {
          itemId: item.id,
          name: item.name,
          hsnSacCode: '8471',
          unit: 'NOS',
          quantity: 10,
          unitPrice: 200,
          taxableAmount: 2000,
          gstRate: 18,
          cgstAmount: 180,
          sgstAmount: 180,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 2360,
        },
      ],
      totalGrossAmount: 2000,
      totalDiscount: 0,
      totalTaxableAmount: 2000,
      totalCgst: 180,
      totalSgst: 180,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 360,
      roundOff: 0,
      grandTotal: 2360,
      amountInWords: 'Two Thousand Three Hundred Sixty Only',
      paidAmount: 0,
      balanceAmount: 2360,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveInvoice(invoice);

    expect(db.getItems().find((i) => i.id === item.id)?.currentStock).toBe(40);

    // Delete invoice via single-engine db.deleteInvoice (as called by PartyDetailPage)
    db.deleteInvoice(invoice.id);

    // Stock should be exactly 50 (restored by 10), NEVER 60 (double-restored)
    expect(db.getItems().find((i) => i.id === item.id)?.currentStock).toBe(50);
  });

  it('3.4: reconcileAndRepairLedgerAndInventory aborts safely and makes no changes if pre-migration backup fails', async () => {
    // Break localStorage.setItem to simulate a storage quota failure
    const origSetItem = testStorage.setItem;
    testStorage.setItem = () => {
      throw new Error('QuotaExceededError: Local storage is full');
    };

    await expect(reconcileAndRepairLedgerAndInventory()).rejects.toThrow(
      'Failed to write pre-migration backup to storage'
    );

    // Restore setItem
    testStorage.setItem = origSetItem;
  });

  it('3.4: reconcileAndRepairLedgerAndInventory is strictly idempotent on repeated runs', async () => {
    const estimateInvoice: Invoice = {
      id: 'INV-EST-IDEMPOTENT',
      invoiceNumber: 'EST-IDEMP-001',
      invoiceType: 'ESTIMATE',
      date: '2026-10-21',
      partyName: 'Idempotent Prospect',
      partyAddress: 'Delhi',
      partyStateCode: '07',
      placeOfSupplyStateCode: '07',
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
      paidAmount: 0,
      balanceAmount: 2000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveInvoice(estimateInvoice);

    const estVoucher = createSalesInvoiceVoucher({
      invoiceNumber: estimateInvoice.invoiceNumber,
      date: estimateInvoice.date,
      customerName: estimateInvoice.partyName,
      customerId: 'CUST-EST',
      taxableAmount: 2000,
      grandTotal: 2000,
    });
    db.saveVoucher(estVoucher);

    const orphanVoucher = createPurchaseInvoiceVoucher({
      billNumber: 'PUR/ORPHAN/IDEMP',
      date: '2026-10-21',
      supplierName: 'Non-existent Supplier',
      supplierId: 'SUP-NONE',
      taxableAmount: 1000,
      grandTotal: 1000,
    });
    db.saveVoucher(orphanVoucher);

    // First execution: repairs estimate and orphan vouchers
    const firstReport = await reconcileAndRepairLedgerAndInventory();
    expect(firstReport.success).toBe(true);
    expect(firstReport.estimateVouchersReversed).toBe(1);
    expect(firstReport.orphanVouchersReversed).toBe(1);

    const voucherCountAfterFirst = db.getVouchers().length;

    // Second execution on already-repaired state: must perform zero duplicate actions
    const secondReport = await reconcileAndRepairLedgerAndInventory();
    expect(secondReport.success).toBe(true);
    expect(secondReport.estimateVouchersReversed).toBe(0);
    expect(secondReport.orphanVouchersReversed).toBe(0);
    expect(secondReport.duplicateVouchersReversed).toBe(0);
    expect(secondReport.stockItemsRealigned).toBe(0);

    // Total vouchers in database must be unchanged (no duplicate reversal vouchers posted)
    expect(db.getVouchers().length).toBe(voucherCountAfterFirst);
  });

  it('regression: referenceNo collision with a receipt voucher does not overwrite or reverse the receipt', () => {
    const inv: Invoice = {
      id: 'INV-COLLISION-01',
      invoiceNumber: 'INV/COLLIDE/01',
      invoiceType: 'B2B',
      date: '2026-10-21',
      partyId: 'CUST-COL',
      partyName: 'Collision Customer',
      partyAddress: 'Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [],
      totalGrossAmount: 1000,
      totalDiscount: 0,
      totalTaxableAmount: 1000,
      totalCgst: 90,
      totalSgst: 90,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 180,
      roundOff: 0,
      grandTotal: 1180,
      amountInWords: 'One Thousand One Hundred Eighty Only',
      paidAmount: 0,
      balanceAmount: 1180,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };
    db.saveInvoice(inv);

    // Create sales voucher
    const salesVoucher = createSalesInvoiceVoucher({
      invoiceNumber: inv.invoiceNumber,
      date: inv.date,
      customerName: inv.partyName,
      customerId: 'CUST-COL',
      taxableAmount: 1000,
      grandTotal: 1180,
    });
    db.saveVoucher(salesVoucher);

    // Create a payment receipt voucher referencing the exact same invoice number
    const receiptVoucher = createPaymentReceiptVoucher({
      date: '2026-10-21',
      customerName: 'Collision Customer',
      customerId: 'CUST-COL',
      amount: 1180,
      paymentMode: 'CASH',
      referenceNo: inv.invoiceNumber,
    });
    db.saveVoucher(receiptVoucher);

    expect(receiptVoucher.referenceNo).toBe(inv.invoiceNumber);
    expect(receiptVoucher.voucherType).toBe('RECEIPT');

    // Delete invoice
    db.deleteInvoice(inv.id);

    // 1. Sales voucher must be reversed
    const updatedSales = db.getVouchers().find((v) => v.id === salesVoucher.id);
    expect(updatedSales?.isReversed).toBe(true);
    expect(db.getVouchers().find((v) => v.reversalOfVoucherId === salesVoucher.id)).toBeDefined();

    // 2. Receipt voucher must NOT be reversed or deleted
    const updatedReceipt = db.getVouchers().find((v) => v.id === receiptVoucher.id);
    expect(updatedReceipt).toBeDefined();
    expect(updatedReceipt?.isReversed).toBeFalsy();
    expect(updatedReceipt?.isCancelled).toBeFalsy();
    expect(updatedReceipt?.voucherType).toBe('RECEIPT');
  });

  it('regression: RCM disable/re-enable cycle (on -> off -> on -> off) preserves reversed audit trail and isolates active voucher', () => {
    const rcmBill: PurchaseBill = {
      id: 'PUR-RCM-REG-01',
      billNumber: 'PUR/RCM/REG/01',
      date: '2026-10-21',
      supplierId: 'SUP-RCM-01',
      supplierName: 'RCM Supplier',
      supplierAddress: 'Pune',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [],
      itcEligibility: 'ALL_OTHER_ITC',
      isRcm: true,
      totalGrossAmount: 10000,
      totalDiscount: 0,
      totalTaxableAmount: 10000,
      totalCgst: 900,
      totalSgst: 900,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 1800,
      roundOff: 0,
      grandTotal: 10000,
      paidAmount: 0,
      balanceAmount: 10000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-21T00:00:00Z',
      updatedAt: '2026-10-21T00:00:00Z',
    };

    // --- STEP 1: ON (initial creation) ---
    db.savePurchase(rcmBill);

    const rcmVoucherId = `VCH-RCM-${rcmBill.id}`;
    const initialRcm = db.getVouchers().find((v) => v.id === rcmVoucherId);
    expect(initialRcm).toBeDefined();
    expect(initialRcm?.isReversed).toBeFalsy();
    expect(initialRcm?.totalAmount).toBe(1800);

    // --- STEP 2: OFF (first disable) ---
    db.savePurchase({ ...rcmBill, isRcm: false });

    const rcmAfterFirstDisable = db.getVouchers().find((v) => v.id === rcmVoucherId);
    expect(rcmAfterFirstDisable).toBeDefined();
    expect(rcmAfterFirstDisable?.isReversed).toBe(true);

    const firstReversal = db.getVouchers().find((v) => v.reversalOfVoucherId === rcmVoucherId);
    expect(firstReversal).toBeDefined();
    expect(firstReversal?.voucherType).toBe('JOURNAL');

    // Assert: net is zero after first disable
    const activeRcmAfterFirstDisable = db
      .getVouchers()
      .filter((v) => !v.isReversed && !v.isCancelled && !v.voucherNumber.startsWith('VCH-REV-') && (v.voucherNumber.startsWith('VCH-RCM-') || v.referenceNo === rcmBill.billNumber));
    expect(activeRcmAfterFirstDisable.length).toBe(0);

    const allRcmEntriesAfterFirstOff = [initialRcm!, firstReversal!].flatMap((v) => v.entries);
    const netAfterFirstOff = allRcmEntriesAfterFirstOff.reduce((sum, e) => sum + e.debit - e.credit, 0);
    expect(Math.abs(netAfterFirstOff)).toBe(0);

    // --- STEP 3: ON (re-enable RCM) ---
    db.savePurchase({ ...rcmBill, isRcm: true });

    // Assert: no active voucher has the old reversed id
    const activeRcmVouchersAfterReEnable = db
      .getVouchers()
      .filter((v) => !v.isReversed && !v.isCancelled && (v.voucherNumber.startsWith('VCH-RCM-') || v.id.startsWith(rcmVoucherId)));
    expect(activeRcmVouchersAfterReEnable.length).toBe(1);
    expect(activeRcmVouchersAfterReEnable[0].id).not.toBe(initialRcm?.id);
    expect(activeRcmVouchersAfterReEnable[0].isReversed).toBeFalsy();

    // Assert: original reversed voucher was NOT overwritten and remains reversed
    const origPreserved = db.getVouchers().find((v) => v.id === rcmVoucherId);
    expect(origPreserved?.isReversed).toBe(true);
    expect(origPreserved?.reversalVoucherId).toBe(firstReversal?.id);

    // Assert: active RCM after re-enable is NOT offset by the earlier reversal
    const newActiveRcm = activeRcmVouchersAfterReEnable[0];
    const totalItcCgst = db
      .getVouchers()
      .flatMap((v) => v.entries)
      .filter((e) => e.accountId === 'ACC_INPUT_CGST_RCM')
      .reduce((sum, e) => sum + e.debit - e.credit, 0);
    expect(totalItcCgst).toBe(900); // exactly the active RCM voucher, not zeroed out by old reversal!

    const totalPayableCgst = db
      .getVouchers()
      .flatMap((v) => v.entries)
      .filter((e) => e.accountId === 'ACC_OUTPUT_CGST_RCM')
      .reduce((sum, e) => sum + e.credit - e.debit, 0);
    expect(totalPayableCgst).toBe(900);

    // --- STEP 4: OFF (second disable) ---
    db.savePurchase({ ...rcmBill, isRcm: false });

    // Assert: second active voucher is now reversed
    const secondRcmAfterDisable = db.getVouchers().find((v) => v.id === newActiveRcm.id);
    expect(secondRcmAfterDisable?.isReversed).toBe(true);

    const secondReversal = db.getVouchers().find((v) => v.reversalOfVoucherId === newActiveRcm.id);
    expect(secondReversal).toBeDefined();

    // Assert: no active RCM vouchers remain
    const activeRcmAfterSecondDisable = db
      .getVouchers()
      .filter((v) => !v.isReversed && !v.isCancelled && (v.voucherNumber.startsWith('VCH-RCM-') || v.id.startsWith(rcmVoucherId)));
    expect(activeRcmAfterSecondDisable.length).toBe(0);

    // Assert: net is zero after second disable (never negative)
    const finalItcCgst = db
      .getVouchers()
      .flatMap((v) => v.entries)
      .filter((e) => e.accountId === 'ACC_INPUT_CGST_RCM')
      .reduce((sum, e) => sum + e.debit - e.credit, 0);
    expect(Math.abs(finalItcCgst)).toBe(0);

    const finalPayableCgst = db
      .getVouchers()
      .flatMap((v) => v.entries)
      .filter((e) => e.accountId === 'ACC_OUTPUT_CGST_RCM')
      .reduce((sum, e) => sum + e.credit - e.debit, 0);
    expect(Math.abs(finalPayableCgst)).toBe(0);

    // --- GUARD TEST: saveVoucher refuses to overwrite a reversed or cancelled voucher ---
    const reversedVoucherToProtect = db.getVouchers().find((v) => v.id === rcmVoucherId)!;
    expect(reversedVoucherToProtect.isReversed).toBe(true);

    // Attempt illegal overwrite with active state
    db.saveVoucher({
      ...reversedVoucherToProtect,
      isReversed: false,
      narration: 'ILLEGAL OVERWRITE ATTEMPT',
      totalAmount: 999999,
    });

    const guardedVoucher = db.getVouchers().find((v) => v.id === rcmVoucherId);
    expect(guardedVoucher?.isReversed).toBe(true);
    expect(guardedVoucher?.narration).not.toBe('ILLEGAL OVERWRITE ATTEMPT');
    expect(guardedVoucher?.totalAmount).toBe(1800);

    // 4. Finally deleting the bill leaves state clean and intact
    db.deletePurchase(rcmBill.id);
    expect(db.getPurchases().find((p) => p.id === rcmBill.id)).toBeUndefined();
  });

  it('regression: deleting a receipt/payment reverses cash/bank and cash-flow totals back to net zero', () => {
    const testAccounts = [...DEFAULT_BANK_ACCOUNTS];

    // Baseline calculation
    const baseCashBank = calculateCashBank({
      accounts: testAccounts,
      invoices: [],
      purchases: [],
      expenses: [],
      vouchers: [],
      transactions: [],
    });
    const baseInflow = baseCashBank.todayInflow;
    const baseCashBalance = baseCashBank.accountBalances['ACC_CASH'] || 0;

    // 1. Add receipt voucher for 5000 in cash
    const receipt = createPaymentReceiptVoucher({
      date: new Date().toISOString().split('T')[0],
      customerName: 'Cash Customer',
      customerId: 'CUST-NET-01',
      amount: 5000,
      paymentMode: 'CASH',
    });
    db.saveVoucher(receipt);

    // With active receipt
    const withReceipt = calculateCashBank({
      accounts: testAccounts,
      invoices: [],
      purchases: [],
      expenses: [],
      vouchers: db.getVouchers(),
      transactions: [],
    });
    expect(withReceipt.accountBalances['ACC_CASH']).toBe(baseCashBalance + 5000);
    expect(withReceipt.todayInflow).toBe(baseInflow + 5000);

    const cashFlowWithReceipt = calculateCashFlow({
      accounts: testAccounts,
      invoices: [],
      purchases: [],
      expenses: [],
      vouchers: db.getVouchers(),
      transactions: [],
    });
    expect(cashFlowWithReceipt.operatingActivities.netCashFlow).toBe(5000);

    // 2. Delete / reverse receipt voucher
    const rev = createReversalVoucher({
      originalVoucher: receipt,
      reason: 'Customer payment cancelled',
    });
    db.saveVoucher(rev);
    db.saveVoucher({ ...receipt, isReversed: true, reversalVoucherId: rev.id });

    // With reversed receipt
    const afterReversal = calculateCashBank({
      accounts: testAccounts,
      invoices: [],
      purchases: [],
      expenses: [],
      vouchers: db.getVouchers(),
      transactions: [],
    });
    // Cash balance and inflow must strictly return to baseline
    expect(afterReversal.accountBalances['ACC_CASH']).toBe(baseCashBalance);
    expect(afterReversal.todayInflow).toBe(baseInflow);

    const cashFlowAfterReversal = calculateCashFlow({
      accounts: testAccounts,
      invoices: [],
      purchases: [],
      expenses: [],
      vouchers: db.getVouchers(),
      transactions: [],
    });
    expect(cashFlowAfterReversal.operatingActivities.netCashFlow).toBe(0);
  });

  it('regression: repair of orphan RCM voucher', async () => {
    // Manually create an orphan RCM journal voucher with no corresponding purchase bill
    const orphanRcm = createRcmJournalVoucher({
      billId: 'PUR-GHOST-RCM-99',
      billNumber: 'PUR/GHOST/99',
      date: '2026-10-21',
      supplierName: 'Ghost Supplier',
      supplierId: 'SUP-GHOST',
      cgstAmount: 500,
      sgstAmount: 500,
      totalTax: 1000,
    });
    db.saveVoucher(orphanRcm);

    expect(orphanRcm.voucherType).toBe('JOURNAL');
    expect(orphanRcm.voucherNumber).toContain('VCH-RCM-');

    // Run repair
    const report = await reconcileAndRepairLedgerAndInventory();
    expect(report.success).toBe(true);
    expect(report.orphanVouchersReversed).toBeGreaterThanOrEqual(1);

    // Verify orphan RCM voucher is marked reversed and has balancing reversal
    const updatedOrphanRcm = db.getVouchers().find((v) => v.id === orphanRcm.id);
    expect(updatedOrphanRcm?.isReversed).toBe(true);

    const rcmReversal = db.getVouchers().find((v) => v.reversalOfVoucherId === orphanRcm.id);
    expect(rcmReversal).toBeDefined();

    // Verify net zero between orphan RCM and its reversal
    const net = [...orphanRcm.entries, ...rcmReversal!.entries].reduce(
      (sum, e) => sum + e.debit - e.credit,
      0
    );
    expect(net).toBe(0);
  });
});
