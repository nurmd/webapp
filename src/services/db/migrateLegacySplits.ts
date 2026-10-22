import { db } from '../db.ts';
import { createAndVerifyPreMigrationBackup } from './preMigrationBackup.ts';
import { parseSplitsFromInvoice, parseSplitsFromPurchase } from '../../core/accounting/paymentSplitUtils.ts';
import type { PaymentSplit } from '../../models/invoice.ts';

export interface SplitMigrationReport {
  success: boolean;
  backupCreated: boolean;
  backupId?: string;
  invoicesMigrated: number;
  purchasesMigrated: number;
  totalSplitsUpdated: number;
}

/**
 * Phase 4: Idempotent Legacy Payment Split Migration.
 * 
 * Invariants:
 * 1. Safe & Gated: If mutations are required, creates and verifies an immutable pre-migration backup snapshot first.
 * 2. Idempotent: Does not rewrite, duplicate, or re-process splits that already possess an `accountId`.
 * 3. Handles legacy documents: Reconstructs structured splits from human-readable notes or legacy single-tender records.
 * 4. Resolves defaults: Maps CASH -> ACC_CASH / 'Cash-in-hand', and bank modes (UPI, CARD, BANK, NET_BANKING, CHEQUE) -> primary bank account.
 */
export async function migrateLegacyPaymentSplits(): Promise<SplitMigrationReport> {
  const invoices = db.getInvoices();
  const purchases = db.getPurchases();
  const bankAccounts = db.getBankAccounts().filter((b) => b.accountType === 'BANK');
  const defaultBank = bankAccounts.find((b) => (b as any).isDefault) || bankAccounts[0] || {
    id: 'ACC_BANK',
    accountName: 'Bank Account',
  };

  const invoiceUpdates: { index: number; splits: PaymentSplit[] }[] = [];
  const purchaseUpdates: { index: number; splits: PaymentSplit[] }[] = [];
  let totalSplitsUpdated = 0;

  // 1. Audit Invoices for legacy splits or missing account metadata
  invoices.forEach((inv, idx) => {
    let needsUpdate = false;
    let splits: PaymentSplit[];

    if (inv.paymentSplits && inv.paymentSplits.length > 0) {
      splits = inv.paymentSplits.map((s) => {
        if (s.mode === 'CREDIT' || s.accountId) {
          return { ...s };
        }
        needsUpdate = true;
        totalSplitsUpdated++;
        if (s.mode === 'CASH') {
          return {
            ...s,
            accountId: 'ACC_CASH',
            accountName: s.accountName || 'Cash-in-hand',
          };
        }
        return {
          ...s,
          accountId: defaultBank.id,
          accountName: s.accountName || defaultBank.accountName,
        };
      });
    } else if (inv.paidAmount > 0 || (inv.notes && (inv.notes.includes('Split Payment') || inv.notes.includes('Split:')))) {
      // Legacy document without structured paymentSplits
      const parsed = parseSplitsFromInvoice(inv, inv.grandTotal);
      splits = parsed.map((s) => {
        if (s.mode === 'CREDIT' || s.accountId) {
          return s;
        }
        needsUpdate = true;
        totalSplitsUpdated++;
        if (s.mode === 'CASH') {
          return {
            ...s,
            accountId: 'ACC_CASH',
            accountName: s.accountName || 'Cash-in-hand',
          };
        }
        return {
          ...s,
          accountId: defaultBank.id,
          accountName: s.accountName || defaultBank.accountName,
        };
      });
    } else {
      return;
    }

    if (needsUpdate) {
      invoiceUpdates.push({ index: idx, splits });
    }
  });

  // 2. Audit Purchases for legacy splits or missing account metadata
  purchases.forEach((pur, idx) => {
    let needsUpdate = false;
    let splits: PaymentSplit[];

    if (pur.paymentSplits && pur.paymentSplits.length > 0) {
      splits = pur.paymentSplits.map((s) => {
        if (s.mode === 'CREDIT' || s.accountId) {
          return { ...s };
        }
        needsUpdate = true;
        totalSplitsUpdated++;
        if (s.mode === 'CASH') {
          return {
            ...s,
            accountId: 'ACC_CASH',
            accountName: s.accountName || 'Cash-in-hand',
          };
        }
        return {
          ...s,
          accountId: defaultBank.id,
          accountName: s.accountName || defaultBank.accountName,
        };
      });
    } else if (pur.paidAmount > 0 || (pur.notes && (pur.notes.includes('Split Payment') || pur.notes.includes('Split:')))) {
      const parsed = parseSplitsFromPurchase(pur, pur.grandTotal);
      splits = parsed.map((s) => {
        if (s.mode === 'CREDIT' || s.accountId) {
          return s;
        }
        needsUpdate = true;
        totalSplitsUpdated++;
        if (s.mode === 'CASH') {
          return {
            ...s,
            accountId: 'ACC_CASH',
            accountName: s.accountName || 'Cash-in-hand',
          };
        }
        return {
          ...s,
          accountId: defaultBank.id,
          accountName: s.accountName || defaultBank.accountName,
        };
      });
    } else {
      return;
    }

    if (needsUpdate) {
      purchaseUpdates.push({ index: idx, splits });
    }
  });

  // If no updates needed, return immediately (strictly idempotent)
  if (invoiceUpdates.length === 0 && purchaseUpdates.length === 0) {
    return {
      success: true,
      backupCreated: false,
      invoicesMigrated: 0,
      purchasesMigrated: 0,
      totalSplitsUpdated: 0,
    };
  }

  // 3. Mandatory verified safety backup snapshot before applying mutations
  const backup = createAndVerifyPreMigrationBackup('phase4_split_migration');
  if (!backup.success) {
    throw new Error('Pre-migration backup failed or could not be verified. Aborting split migration.');
  }

  // 4. Apply updates
  for (const { index, splits } of invoiceUpdates) {
    const inv = invoices[index];
    db.saveInvoice({
      ...inv,
      paymentSplits: splits,
    });
  }

  for (const { index, splits } of purchaseUpdates) {
    const pur = purchases[index];
    db.savePurchase({
      ...pur,
      paymentSplits: splits,
    });
  }

  return {
    success: true,
    backupCreated: true,
    backupId: backup.backupKey,
    invoicesMigrated: invoiceUpdates.length,
    purchasesMigrated: purchaseUpdates.length,
    totalSplitsUpdated,
  };
}
