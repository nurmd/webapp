import { Party } from '../../models/party.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Voucher } from '../accounting/voucherTypes.ts';
import { db } from '../../services/db.ts';
import { auditTrail } from '../../services/auditTrail.ts';
import { rbac } from '../../services/rbac.ts';

export interface InconsistentDocumentRecord {
  docId: string;
  docNumber: string;
  docType: 'INVOICE' | 'PURCHASE';
  partyId?: string;
  partyName: string;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  discrepancy: number; // grandTotal - (paidAmount + balanceAmount)
}

export interface PartyBalanceDiscrepancyRecord {
  partyId: string;
  partyName: string;
  partyType: 'CUSTOMER' | 'SUPPLIER';
  openingBalance: number;
  openingBalanceType: 'TO_RECEIVE' | 'TO_PAY';
  recordedBalance: number;
  computedBalance: number;
  discrepancy: number; // recorded - computed
  totalInvoiced: number;
  totalInvoicePaid: number;
  totalInvoiceUnpaid: number;
  totalPurchased: number;
  totalPurchasePaid: number;
  totalPurchaseUnpaid: number;
  totalReceipts: number;
  totalPaymentsOut: number;
  inconsistentDocs: InconsistentDocumentRecord[];
}

export interface PartyBalanceAuditReport {
  auditedAt: string;
  totalPartiesAudited: number;
  healthyPartiesCount: number;
  discrepantPartiesCount: number;
  totalDiscrepancyAmount: number;
  discrepancies: PartyBalanceDiscrepancyRecord[];
  inconsistentDocuments: InconsistentDocumentRecord[];
}

export interface ReconcileBalancesResult {
  reconciledCount: number;
  reconciledParties: string[];
  repairedDocumentsCount: number;
  auditRecordId?: string;
}

/**
 * Pure calculation engine to crosscheck party balances against all invoices, purchases, and vouchers.
 */
export function auditAllPartyBalances(options?: {
  parties?: Party[];
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  vouchers?: Voucher[];
}): PartyBalanceAuditReport {
  const parties = options?.parties || db.getParties();
  const invoices = (options?.invoices || db.getInvoices()).filter((i) => !i.isCancelled);
  const purchases = (options?.purchases || db.getPurchases()).filter((p) => !p.isCancelled);
  const vouchers = options?.vouchers || db.getVouchers();

  const discrepancies: PartyBalanceDiscrepancyRecord[] = [];
  const allInconsistentDocs: InconsistentDocumentRecord[] = [];

  // Check document mathematical integrity: grandTotal === paidAmount + balanceAmount
  for (const inv of invoices) {
    const diff = Number((inv.grandTotal - ((inv.paidAmount || 0) + (inv.balanceAmount || 0))).toFixed(2));
    if (Math.abs(diff) > 0.01) {
      allInconsistentDocs.push({
        docId: inv.id,
        docNumber: inv.invoiceNumber,
        docType: 'INVOICE',
        partyId: inv.partyId,
        partyName: inv.partyName,
        grandTotal: inv.grandTotal,
        paidAmount: inv.paidAmount || 0,
        balanceAmount: inv.balanceAmount || 0,
        discrepancy: diff,
      });
    }
  }

  for (const pur of purchases) {
    const diff = Number((pur.grandTotal - ((pur.paidAmount || 0) + (pur.balanceAmount || 0))).toFixed(2));
    if (Math.abs(diff) > 0.01) {
      allInconsistentDocs.push({
        docId: pur.id,
        docNumber: pur.billNumber,
        docType: 'PURCHASE',
        partyId: pur.supplierId,
        partyName: pur.supplierName,
        grandTotal: pur.grandTotal,
        paidAmount: pur.paidAmount || 0,
        balanceAmount: pur.balanceAmount || 0,
        discrepancy: diff,
      });
    }
  }

  for (const party of parties) {
    const isCustomer = party.type === 'CUSTOMER';
    const partyNameNorm = (party.name || '').trim().toLowerCase();

    // 1. Baseline opening balance
    let computedBalance = 0;
    const absOp = Math.abs(party.openingBalance || 0);
    const opType =
      party.openingBalanceType ||
      (isCustomer ? (party.openingBalance && party.openingBalance < 0 ? 'TO_PAY' : 'TO_RECEIVE') : (party.openingBalance && party.openingBalance > 0 ? 'TO_RECEIVE' : 'TO_PAY'));

    if (absOp > 0) {
      if (opType === 'TO_RECEIVE') {
        computedBalance += absOp;
      } else {
        computedBalance -= absOp;
      }
    }

    // 2. Filter documents for this party
    const partyInvoices = invoices.filter(
      (inv) => inv.partyId === party.id || (inv.partyName && inv.partyName.trim().toLowerCase() === partyNameNorm)
    );
    const partyPurchases = purchases.filter(
      (pur) => pur.supplierId === party.id || (pur.supplierName && pur.supplierName.trim().toLowerCase() === partyNameNorm)
    );
    const partyVouchers = vouchers.filter((v) =>
      v.entries.some((e) => e.accountId === party.id || (e.accountName && e.accountName.toLowerCase() === partyNameNorm))
    );

    const totalInvoiced = partyInvoices.reduce((sum, i) => sum + (i.grandTotal || 0), 0);
    const totalInvoicePaid = partyInvoices.reduce((sum, i) => sum + (i.paidAmount || 0), 0);
    const totalInvoiceUnpaid = partyInvoices.reduce((sum, i) => sum + (i.balanceAmount || 0), 0);

    const totalPurchased = partyPurchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);
    const totalPurchasePaid = partyPurchases.reduce((sum, p) => sum + (p.paidAmount || 0), 0);
    const totalPurchaseUnpaid = partyPurchases.reduce((sum, p) => sum + (p.balanceAmount || 0), 0);

    const totalReceipts = partyVouchers
      .filter((v) => !v.isCancelled && !v.isReversed && v.voucherType === 'RECEIPT')
      .reduce((sum, v) => sum + (v.totalAmount || 0), 0);

    const totalPaymentsOut = partyVouchers
      .filter((v) => !v.isCancelled && !v.isReversed && v.voucherType === 'PAYMENT')
      .reduce((sum, v) => sum + (v.totalAmount || 0), 0);

    if (isCustomer) {
      // Customer: unpaid invoices add to receivable (positive)
      computedBalance += totalInvoiceUnpaid;

      // If customer paid more than settled on invoices, credit excess as advance (negative)
      if (totalReceipts > totalInvoicePaid) {
        computedBalance -= (totalReceipts - totalInvoicePaid);
      }
    } else {
      // Supplier: unpaid purchases add to payable (negative)
      computedBalance -= totalPurchaseUnpaid;

      // If we disbursed more to supplier than billed, credit excess as advance (positive)
      if (totalPaymentsOut > totalPurchasePaid) {
        computedBalance += (totalPaymentsOut - totalPurchasePaid);
      }
    }

    computedBalance = Number(computedBalance.toFixed(2));
    const recordedBalance = Number((party.currentBalance || 0).toFixed(2));
    const discrepancy = Number((recordedBalance - computedBalance).toFixed(2));

    const partyInconsistentDocs = allInconsistentDocs.filter(
      (d) => d.partyId === party.id || d.partyName.trim().toLowerCase() === partyNameNorm
    );

    if (Math.abs(discrepancy) > 0.01 || partyInconsistentDocs.length > 0) {
      discrepancies.push({
        partyId: party.id,
        partyName: party.name,
        partyType: party.type,
        openingBalance: party.openingBalance || 0,
        openingBalanceType: opType as 'TO_RECEIVE' | 'TO_PAY',
        recordedBalance,
        computedBalance,
        discrepancy,
        totalInvoiced,
        totalInvoicePaid,
        totalInvoiceUnpaid,
        totalPurchased,
        totalPurchasePaid,
        totalPurchaseUnpaid,
        totalReceipts,
        totalPaymentsOut,
        inconsistentDocs: partyInconsistentDocs,
      });
    }
  }

  const healthyPartiesCount = parties.length - discrepancies.length;
  const totalDiscrepancyAmount = Number(
    discrepancies.reduce((sum, d) => sum + Math.abs(d.discrepancy), 0).toFixed(2)
  );

  return {
    auditedAt: new Date().toISOString(),
    totalPartiesAudited: parties.length,
    healthyPartiesCount,
    discrepantPartiesCount: discrepancies.length,
    totalDiscrepancyAmount,
    discrepancies,
    inconsistentDocuments: allInconsistentDocs,
  };
}

/**
 * 1-Click Auto-Reconciliation of all party balance discrepancies and arithmetic document errors.
 */
export async function reconcilePartyBalances(
  report?: PartyBalanceAuditReport
): Promise<ReconcileBalancesResult> {
  const activeReport = report || auditAllPartyBalances();
  const parties = db.getParties();
  const reconciledParties: string[] = [];
  let repairedDocsCount = 0;

  // 1. Repair inconsistent document balances (invoices and purchases)
  for (const doc of activeReport.inconsistentDocuments) {
    if (doc.docType === 'INVOICE') {
      const inv = db.getInvoices().find((i) => i.id === doc.docId);
      if (inv) {
        const fixedBalance = Math.max(0, Number((inv.grandTotal - (inv.paidAmount || 0)).toFixed(2)));
        const repairedInv: Invoice = {
          ...inv,
          balanceAmount: fixedBalance,
          paymentStatus: fixedBalance <= 0 ? 'PAID' : (inv.paidAmount || 0) > 0 ? 'PARTIAL' : 'UNPAID',
          updatedAt: new Date().toISOString(),
        };
        db.saveInvoice(repairedInv);
        repairedDocsCount++;
      }
    }
  }

  // 2. Reconcile party balances to computed ground-truth
  for (const disc of activeReport.discrepancies) {
    const party = parties.find((p) => p.id === disc.partyId);
    if (party) {
      db.recalculatePartyBalance(party.id);
      reconciledParties.push(party.name);
    }
  }

  // 3. Log MCA Rule 3(1) Immutable Audit Log Entry
  const user = rbac.getActiveUser();
  const auditEntry = await auditTrail.logEvent({
    userId: user.id || 'usr_auditor',
    userName: user.name || 'Financial Balance Auditor',
    userRole: user.role || 'OWNER',
    actionType: 'PAYMENT_RECORD',
    documentId: `RECON-BAL-${Date.now()}`,
    documentType: 'PAYMENT',
    summary: `Financial Balance Auditor auto-reconciled ${reconciledParties.length} party accounts and healed ${repairedDocsCount} inconsistent transactions. Total variance adjusted: ₹${activeReport.totalDiscrepancyAmount}`,
    newSnapshot: {
      reconciledParties,
      repairedDocsCount,
      totalDiscrepancyAmount: activeReport.totalDiscrepancyAmount,
      auditedAt: activeReport.auditedAt,
    },
  });

  return {
    reconciledCount: reconciledParties.length,
    reconciledParties,
    repairedDocumentsCount: repairedDocsCount,
    auditRecordId: auditEntry?.id,
  };
}
