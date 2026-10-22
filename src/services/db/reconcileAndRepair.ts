import { db } from '../db.ts';
import {
  createAndVerifyPreMigrationBackup,
  PreMigrationBackupResult,
} from './preMigrationBackup.ts';
import { createReversalVoucher } from '../../core/accounting/ledger.ts';
import {
  auditAllItemStock,
  reconcileItemStock,
} from '../../core/audit/inventoryStockAuditor.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { migrateLegacyPaymentSplits } from './migrateLegacySplits.ts';

export interface LedgerRepairReport {
  success: boolean;
  backup: PreMigrationBackupResult;
  duplicateVouchersReversed: number;
  orphanVouchersReversed: number;
  estimateVouchersReversed: number;
  stockItemsRealigned: number;
  splitsMigrated: number;
  totalVouchersAudited: number;
}

/**
 * Phase 3: Comprehensive Ledger & Inventory State Repair Engine.
 * 
 * Invariants:
 * 1. Pre-migration backup is mandatory and verified before any mutations occur.
 * 2. Posted vouchers are never hard-deleted; reversals are posted with swapped debits/credits.
 * 3. Identifies and consolidates duplicate vouchers created by invoice multi-edits.
 * 4. Reverses orphan vouchers referencing deleted invoices/bills.
 * 5. Reverses invalid vouchers generated for non-taxable Estimates/Quotes or POs.
 * 6. Audits and realigns inventory stocks inflated by legacy passbook double-restorations.
 * 7. Synchronizes all party balances using verified linear O(P+I+V+U) reconciler.
 */
export async function reconcileAndRepairLedgerAndInventory(): Promise<LedgerRepairReport> {
  // 1. Mandatory restorable pre-migration backup snapshot
  const backup = createAndVerifyPreMigrationBackup('phase3_reconcile_repair');
  if (!backup.success) {
    throw new Error('Mandatory pre-migration backup failed or could not be verified.');
  }

  let duplicateVouchersReversed = 0;
  let orphanVouchersReversed = 0;
  let estimateVouchersReversed = 0;

  const invoices = db.getInvoices();
  const purchases = db.getPurchases();
  const allVouchers = [...db.getVouchers()];

  const invoiceNumberSet = new Set(invoices.map((i) => i.invoiceNumber));
  const billNumberSet = new Set(purchases.map((p) => p.billNumber));

  // Sets of estimate and order document numbers that must not have active accounting vouchers
  const estimateInvoiceNumbers = new Set(
    invoices
      .filter(
        (i) =>
          i.invoiceType === 'ESTIMATE' ||
          i.invoiceType === 'SALES_ORDER' ||
          i.invoiceType === 'DELIVERY_CHALLAN'
      )
      .map((i) => i.invoiceNumber)
  );

  const poBillNumbers = new Set(
    purchases.filter((p) => p.purchaseType === 'PO').map((p) => p.billNumber)
  );

  // Group active vouchers by doc reference (invoiceNumber or billNumber)
  const activeSalesVouchersByRef = new Map<string, Voucher[]>();
  const activePurchaseVouchersByRef = new Map<string, Voucher[]>();
  const activeRcmVouchersByRef = new Map<string, Voucher[]>();

  for (const v of allVouchers) {
    if (v.isReversed || v.isCancelled) continue;

    const ref = v.referenceNo || '';
    const cleanSalRef = ref || v.voucherNumber.replace(/^VCH-SAL-/, '');
    const cleanPurRef = ref || v.voucherNumber.replace(/^VCH-PUR-/, '');

    // A. Prune vouchers erroneously generated for non-taxable Estimates / Orders
    if (
      v.voucherType === 'SALES' &&
      (estimateInvoiceNumbers.has(ref) || estimateInvoiceNumbers.has(cleanSalRef))
    ) {
      const rev = createReversalVoucher({
        originalVoucher: v,
        reason: `Auto-repair: Reversal of voucher created for non-taxable Estimate/Order #${ref || cleanSalRef}`,
      });
      db.saveVoucher(rev);
      db.saveVoucher({ ...v, isReversed: true, isCancelled: true, reversalVoucherId: rev.id });
      estimateVouchersReversed++;
      continue;
    }

    if (
      v.voucherType === 'PURCHASE' &&
      (poBillNumbers.has(ref) || poBillNumbers.has(cleanPurRef))
    ) {
      const rev = createReversalVoucher({
        originalVoucher: v,
        reason: `Auto-repair: Reversal of voucher created for non-inward PO #${ref || cleanPurRef}`,
      });
      db.saveVoucher(rev);
      db.saveVoucher({ ...v, isReversed: true, isCancelled: true, reversalVoucherId: rev.id });
      estimateVouchersReversed++;
      continue;
    }

    // B. Check for Orphan vouchers (source invoice/bill was deleted)
    if (v.voucherType === 'SALES') {
      if (cleanSalRef && !invoiceNumberSet.has(cleanSalRef)) {
        const rev = createReversalVoucher({
          originalVoucher: v,
          reason: `Auto-repair: Reversal of orphan voucher #${v.voucherNumber} for deleted invoice #${cleanSalRef}`,
        });
        db.saveVoucher(rev);
        db.saveVoucher({ ...v, isReversed: true, isCancelled: true, reversalVoucherId: rev.id });
        orphanVouchersReversed++;
        continue;
      }

      if (cleanSalRef) {
        const existing = activeSalesVouchersByRef.get(cleanSalRef) || [];
        existing.push(v);
        activeSalesVouchersByRef.set(cleanSalRef, existing);
      }
    } else if (v.voucherType === 'PURCHASE') {
      if (cleanPurRef && !billNumberSet.has(cleanPurRef)) {
        const rev = createReversalVoucher({
          originalVoucher: v,
          reason: `Auto-repair: Reversal of orphan voucher #${v.voucherNumber} for deleted bill #${cleanPurRef}`,
        });
        db.saveVoucher(rev);
        db.saveVoucher({ ...v, isReversed: true, isCancelled: true, reversalVoucherId: rev.id });
        orphanVouchersReversed++;
        continue;
      }

      if (cleanPurRef) {
        const existing = activePurchaseVouchersByRef.get(cleanPurRef) || [];
        existing.push(v);
        activePurchaseVouchersByRef.set(cleanPurRef, existing);
      }
    } else if (v.voucherType === 'JOURNAL' && v.voucherNumber.startsWith('VCH-RCM-')) {
      const rcmBillRef = v.referenceNo || v.voucherNumber.replace(/^VCH-RCM-/, '');
      if (rcmBillRef && !billNumberSet.has(rcmBillRef)) {
        const rev = createReversalVoucher({
          originalVoucher: v,
          reason: `Auto-repair: Reversal of orphan RCM voucher #${v.voucherNumber} for deleted bill #${rcmBillRef}`,
        });
        db.saveVoucher(rev);
        db.saveVoucher({ ...v, isReversed: true, isCancelled: true, reversalVoucherId: rev.id });
        orphanVouchersReversed++;
        continue;
      }

      if (rcmBillRef) {
        const existing = activeRcmVouchersByRef.get(rcmBillRef) || [];
        existing.push(v);
        activeRcmVouchersByRef.set(rcmBillRef, existing);
      }
    }
  }

  // C. Deduplicate repeated vouchers for the same invoice/bill (from legacy repeated edit saves)
  // Sort oldest first: preserve original canonical voucher, reverse subsequent duplicate copies
  for (const [, vList] of activeSalesVouchersByRef.entries()) {
    if (vList.length > 1) {
      vList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const [, ...duplicates] = vList;
      for (const dup of duplicates) {
        const rev = createReversalVoucher({
          originalVoucher: dup,
          reason: `Auto-repair: Reversal of redundant duplicate sales voucher #${dup.voucherNumber}`,
        });
        db.saveVoucher(rev);
        db.saveVoucher({ ...dup, isReversed: true, isCancelled: true, reversalVoucherId: rev.id });
        duplicateVouchersReversed++;
      }
    }
  }

  for (const [, vList] of activePurchaseVouchersByRef.entries()) {
    if (vList.length > 1) {
      vList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const [, ...duplicates] = vList;
      for (const dup of duplicates) {
        const rev = createReversalVoucher({
          originalVoucher: dup,
          reason: `Auto-repair: Reversal of redundant duplicate purchase voucher #${dup.voucherNumber}`,
        });
        db.saveVoucher(rev);
        db.saveVoucher({ ...dup, isReversed: true, isCancelled: true, reversalVoucherId: rev.id });
        duplicateVouchersReversed++;
      }
    }
  }

  for (const [, vList] of activeRcmVouchersByRef.entries()) {
    if (vList.length > 1) {
      vList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const [, ...duplicates] = vList;
      for (const dup of duplicates) {
        const rev = createReversalVoucher({
          originalVoucher: dup,
          reason: `Auto-repair: Reversal of redundant duplicate RCM voucher #${dup.voucherNumber}`,
        });
        db.saveVoucher(rev);
        db.saveVoucher({ ...dup, isReversed: true, isCancelled: true, reversalVoucherId: rev.id });
        duplicateVouchersReversed++;
      }
    }
  }

  // D. Stock inventory audit and auto-reconciliation
  const stockAudit = auditAllItemStock();
  let stockItemsRealigned = 0;
  if (stockAudit.discrepantItemsCount > 0) {
    const reconResult = await reconcileItemStock(stockAudit);
    stockItemsRealigned = reconResult.reconciledCount;
  }

  // E. Migrate legacy payment splits to ensure accountId/accountName persistence
  const splitMigrationResult = await migrateLegacyPaymentSplits();
  const splitsMigrated = splitMigrationResult.totalSplitsUpdated;

  // F. Synchronize all party balances
  db.syncAllPartyBalances();

  return {
    success: true,
    backup,
    duplicateVouchersReversed,
    orphanVouchersReversed,
    estimateVouchersReversed,
    stockItemsRealigned,
    splitsMigrated,
    totalVouchersAudited: allVouchers.length,
  };
}
