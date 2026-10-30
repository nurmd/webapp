import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { StockAdjustment, InventoryItem, UnitOfMeasurement } from '../../models/item.ts';
import { pouch } from '../pouchdb.ts';
import { auditTrail } from '../auditTrail.ts';
import { getFinancialYear } from '../../core/utils/dateFilters.ts';
import { createRcmJournalVoucher, createReversalVoucher } from '../../core/accounting/ledger.ts';
import { derivePaymentSettlement } from '../../core/accounting/paymentSplitUtils.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { applyAllocations, reverseAllocations, inferVoucherPaymentMode } from '../../core/accounting/paymentAllocation.ts';
import {
  applyInvoiceStockDecrement,
  revertInvoiceStockAdjustment,
  restoreInvoiceStock,
  applyPurchaseStockIncrement,
  applyPurchaseStockDecrement,
  revertPurchaseStockAdjustment,
  applyStockAdjustmentRecord,
  findMatchingItem,
} from '../../core/inventory/stockEngine.ts';
import { STORAGE_KEYS, DEFAULT_INVOICES } from './storageEngine.ts';
import { FinancialStorage } from './financialStorage.ts';

/**
 * Invoicing, Purchases, and Stock Adjustment domain storage.
 * Handles Sales Invoices, Credit Notes, Purchase Bills, Debit Notes,
 * statutory financial year enforcement, automated RCM double-entry journal vouchers,
 * and stock engine integration.
 */
export class InvoicePurchaseStorage extends FinancialStorage {
  // Invoices
  getInvoices(): Invoice[] {
    return this.get<Invoice[]>(STORAGE_KEYS.INVOICES, DEFAULT_INVOICES);
  }

  saveInvoice(invoice: Invoice, options?: { skipSettlementDerivation?: boolean }): void {
    const list = [...this.getInvoices()];
    // Enforce unique invoice number under GST compliance
    const norm = (invoice.invoiceNumber || '').trim().toUpperCase();
    const conflict = list.find(
      (inv) => inv.id !== invoice.id && (inv.invoiceNumber || '').trim().toUpperCase() === norm
    );
    if (conflict) {
      throw new Error(`Invoice number "${invoice.invoiceNumber}" is already in use by invoice for ${conflict.partyName}. Invoices must have unique numbers.`);
    }

    // Enforce statutory financial year (e.g. 2026-27)
    if (!invoice.financialYear) {
      invoice.financialYear = getFinancialYear(invoice.date);
    }

    if (!options?.skipSettlementDerivation) {
      // Centralize payment status & tender breakdown derivation (invariant enforcement)
      const settlement = derivePaymentSettlement({
        grandTotal: invoice.grandTotal,
        paymentMode: invoice.paymentMode,
        paymentStatus: invoice.paymentStatus,
        paidAmount: invoice.paidAmount,
        balanceAmount: invoice.balanceAmount,
        paymentSplits: invoice.paymentSplits,
        notes: invoice.notes,
        bankAccountId: (invoice as any).bankAccountId,
        bankAccountName: (invoice as any).bankAccountName,
      });
      invoice = {
        ...invoice,
        paidAmount: settlement.paidAmount,
        balanceAmount: settlement.balanceAmount,
        paymentStatus: settlement.paymentStatus,
        paymentMode: settlement.paymentMode,
        paymentSplits: settlement.paymentSplits,
        notes: settlement.notes,
      };
    }

    const idx = list.findIndex((inv) => inv.id === invoice.id);
    const prevInvoice = idx >= 0 ? list[idx] : null;

    if (idx >= 0) {
      list[idx] = invoice;
    } else {
      list.unshift(invoice);
    }
    this.removeTombstone('invoice', invoice.id);
    this.set(STORAGE_KEYS.INVOICES, list);
    this.backgroundPouchPut('invoice', invoice);
    this.broadcastChange('invoice', 'save', invoice.id, invoice);

    // Update stock levels via pure domain stockEngine (Estimates, Orders, and Delivery Challans are non-sale docs)
    const isNonSaleDoc =
      invoice.invoiceType === 'ESTIMATE' ||
      invoice.invoiceType === 'SALES_ORDER' ||
      invoice.invoiceType === 'DELIVERY_CHALLAN';
    const isCreditNote = invoice.invoiceType === 'CREDIT_NOTE';
    if (!isNonSaleDoc) {
      const allowNegativeStock = this.getAllowNegativeStock();
      const currentItems = this.getItems();
      let updatedItems: InventoryItem[];
      if (isCreditNote) {
        // Sales Return / Credit Note: restores returned goods to inventory
        updatedItems = prevInvoice
          ? revertInvoiceStockAdjustment(currentItems, invoice.items, prevInvoice.items, allowNegativeStock)
          : restoreInvoiceStock(currentItems, invoice.items);
      } else {
        updatedItems = prevInvoice
          ? revertInvoiceStockAdjustment(currentItems, prevInvoice.items, invoice.items, allowNegativeStock)
          : applyInvoiceStockDecrement(currentItems, invoice.items, allowNegativeStock);
      }

      this.persistStockUpdates(currentItems, updatedItems);
    }

    const targetPartyId =
      invoice.partyId ||
      (invoice.partyName
        ? this.getParties().find(
            (p) => p.name.trim().toLowerCase() === invoice.partyName.trim().toLowerCase()
          )?.id
        : undefined);
    if (targetPartyId) {
      this.recalculatePartyBalance(targetPartyId);
    }
    const prevPartyId =
      prevInvoice?.partyId ||
      (prevInvoice?.partyName
        ? this.getParties().find(
            (p) => p.name.trim().toLowerCase() === prevInvoice.partyName.trim().toLowerCase()
          )?.id
        : undefined);
    if (prevPartyId && prevPartyId !== targetPartyId) {
      this.recalculatePartyBalance(prevPartyId);
    }

    // MCA Audit Trail Hook
    const auditUser = this.getAuditUser();
    let actionType: 'INVOICE_CREATE' | 'INVOICE_UPDATE' | 'INVOICE_CANCEL' = 'INVOICE_CREATE';
    let summary = `Created invoice #${invoice.invoiceNumber} for ${invoice.partyName}`;
    if (prevInvoice) {
      const isNowCancelled = Boolean(invoice.isCancelled);
      const wasCancelled = Boolean(prevInvoice.isCancelled);
      if (isNowCancelled && !wasCancelled) {
        actionType = 'INVOICE_CANCEL';
        summary = `Cancelled invoice #${invoice.invoiceNumber} for ${invoice.partyName}`;
      } else {
        actionType = 'INVOICE_UPDATE';
        summary = `Updated invoice #${invoice.invoiceNumber} for ${invoice.partyName}`;
      }
    }
    auditTrail
      .logEvent({
        userId: auditUser.userId,
        userName: auditUser.userName,
        userRole: auditUser.userRole,
        actionType,
        documentId: invoice.id,
        documentType: 'INVOICE',
        previousSnapshot: prevInvoice ? JSON.parse(JSON.stringify(prevInvoice)) : undefined,
        newSnapshot: JSON.parse(JSON.stringify(invoice)),
        summary,
      })
      .catch((err) => console.error('Audit log failed for saveInvoice:', err));

    this.notifyListeners();
  }

  deleteInvoice(id: string): void {
    const inv = this.getInvoices().find((i) => i.id === id);
    if (inv) {
      const activeLinkedPaymentVouchers = this.getVouchers().filter(
        (v) =>
          !v.isReversed &&
          !v.isCancelled &&
          (v.voucherType === 'RECEIPT' || v.voucherType === 'PAYMENT') &&
          ((v.sourceDocumentType === 'INVOICE' && v.sourceDocumentId === id) ||
            v.sourceDocumentNumber === inv.invoiceNumber ||
            v.paymentAllocations?.some((a) => a.documentType === 'INVOICE' && a.documentId === id))
      );
      if (activeLinkedPaymentVouchers.length > 0) {
        const vNumbers = activeLinkedPaymentVouchers.map((v) => `#${v.voucherNumber}`).join(', ');
        throw new Error(
          `Cannot delete invoice #${inv.invoiceNumber} with active linked payment voucher(s) (${vNumbers}). Please reverse or unlink payments before deleting the invoice.`
        );
      }
    }

    const list = this.getInvoices().filter((i) => i.id !== id);
    this.recordTombstone('invoice', id);
    this.set(STORAGE_KEYS.INVOICES, list);
    this.backgroundPouchDelete('invoice', id);
    this.broadcastChange('invoice', 'delete', id);

    // Statutory Audit Trail: Reverse linked posted vouchers instead of hard-deleting
    if (inv) {
      const allVouchers = this.getVouchers();
      const linkedVouchers = allVouchers.filter(
        (v) =>
          !v.isReversed &&
          !v.isCancelled &&
          v.voucherType === 'SALES' &&
          !v.voucherNumber.startsWith('VCH-REV-') &&
          (v.referenceNo === inv.invoiceNumber ||
            v.voucherNumber === `VCH-SAL-${inv.invoiceNumber}` ||
            v.voucherNumber === `VCH-SALES-${inv.invoiceNumber}`)
      );
      for (const origVoucher of linkedVouchers) {
        const revVoucher = createReversalVoucher({
          originalVoucher: origVoucher,
          reason: `Reversal of Sales Voucher #${origVoucher.voucherNumber} upon deletion of invoice #${inv.invoiceNumber}`,
        });
        this.saveVoucher(revVoucher);
        this.saveVoucher({
          ...origVoucher,
          isReversed: true,
          reversalVoucherId: revVoucher.id,
        });
      }
    }

    // Restore stock upon invoice deletion via pure domain stockEngine
    if (
      inv &&
      inv.invoiceType !== 'ESTIMATE' &&
      inv.invoiceType !== 'SALES_ORDER' &&
      inv.invoiceType !== 'DELIVERY_CHALLAN'
    ) {
      const currentItems = this.getItems();
      const allowNegativeStock = this.getAllowNegativeStock();
      const updatedItems = inv.invoiceType === 'CREDIT_NOTE'
        ? applyInvoiceStockDecrement(currentItems, inv.items, allowNegativeStock)
        : restoreInvoiceStock(currentItems, inv.items);
      this.persistStockUpdates(currentItems, updatedItems);
    }

    const partyIdToRecalc =
      inv?.partyId ||
      (inv?.partyName
        ? this.getParties().find(
            (p) => p.name.trim().toLowerCase() === inv.partyName.trim().toLowerCase()
          )?.id
        : undefined);
    if (partyIdToRecalc) {
      this.recalculatePartyBalance(partyIdToRecalc);
    }

    // MCA Audit Trail Hook
    const auditUser = this.getAuditUser();
    auditTrail
      .logEvent({
        userId: auditUser.userId,
        userName: auditUser.userName,
        userRole: auditUser.userRole,
        actionType: 'INVOICE_DELETE',
        documentId: id,
        documentType: 'INVOICE',
        previousSnapshot: inv ? JSON.parse(JSON.stringify(inv)) : { id },
        newSnapshot: undefined,
        summary: `Deleted invoice #${inv?.invoiceNumber || id} for ${inv?.partyName || 'Unknown Party'}`,
      })
      .catch((err) => console.error('Audit log failed for deleteInvoice:', err));

    this.notifyListeners();
  }

  // Purchases
  getPurchases(): PurchaseBill[] {
    return this.get<PurchaseBill[]>(STORAGE_KEYS.PURCHASES, []);
  }

  savePurchase(bill: PurchaseBill, options?: { skipSettlementDerivation?: boolean }): void {
    if (!options?.skipSettlementDerivation) {
      // Centralize payment status & tender breakdown derivation (invariant enforcement)
      const settlement = derivePaymentSettlement({
        grandTotal: bill.grandTotal,
        paymentMode: bill.paymentMode,
        paymentStatus: bill.paymentStatus,
        paidAmount: bill.paidAmount,
        balanceAmount: bill.balanceAmount,
        paymentSplits: bill.paymentSplits,
        notes: bill.notes,
        bankAccountId: (bill as any).bankAccountId,
        bankAccountName: (bill as any).bankAccountName,
      });
      bill = {
        ...bill,
        paidAmount: settlement.paidAmount,
        balanceAmount: settlement.balanceAmount,
        paymentStatus: settlement.paymentStatus,
        paymentMode: settlement.paymentMode,
        paymentSplits: settlement.paymentSplits,
        notes: settlement.notes,
      };
    }

    const list = [...this.getPurchases()];
    const idx = list.findIndex((b) => b.id === bill.id);
    const prevBill = idx >= 0 ? list[idx] : null;

    if (idx >= 0) {
      list[idx] = bill;
    } else {
      list.unshift(bill);
    }
    this.removeTombstone('purchase', bill.id);
    this.set(STORAGE_KEYS.PURCHASES, list);
    this.backgroundPouchPut('purchase', bill);
    this.broadcastChange('purchase', 'save', bill.id, bill);

    // Adjust stock levels and update purchase prices via pure domain stockEngine
    const isPo = bill.purchaseType === 'PO';
    const isReturn = bill.purchaseType === 'RETURN';
    const isChallan = bill.purchaseType === 'CHALLAN';
    const isConvertedBill = bill.purchaseType === 'BILL' && Boolean(bill.convertedFromChallanId);
    if (!isPo) {
      const allowNegativeStock = this.getAllowNegativeStock();
      const currentItems = this.getItems();
      let updatedItems: InventoryItem[] = currentItems;
      if (isReturn) {
        // Purchase Return / Debit Note: deducts returned items from inventory
        updatedItems = prevBill
          ? revertPurchaseStockAdjustment(currentItems, bill.items, prevBill.items, allowNegativeStock)
          : applyPurchaseStockDecrement(currentItems, bill.items, allowNegativeStock);
      } else if (isChallan) {
        // Purchase Challan (GRN): increments physical inventory stock upon receipt!
        const isCancelled = Boolean(bill.isCancelled || bill.challanStatus === 'CANCELLED');
        const wasCancelled = Boolean(prevBill && (prevBill.isCancelled || prevBill.challanStatus === 'CANCELLED'));

        if (isCancelled && !wasCancelled) {
          // Newly cancelled: decrement the stock back out
          updatedItems = applyPurchaseStockDecrement(currentItems, bill.items, allowNegativeStock);
        } else if (!isCancelled && wasCancelled) {
          // Uncancelled: re-increment the stock
          updatedItems = applyPurchaseStockIncrement(currentItems, bill.items);
        } else if (!isCancelled) {
          // Active challan: normal creation or update
          updatedItems = prevBill
            ? revertPurchaseStockAdjustment(currentItems, prevBill.items, bill.items, allowNegativeStock)
            : applyPurchaseStockIncrement(currentItems, bill.items);
        }
      } else if (isConvertedBill && !prevBill) {
        // Purchase Bill newly created from a Purchase Challan:
        // Stock was ALREADY incremented by the source Challan upon receipt! Skip duplicate stock incrementation.
        updatedItems = currentItems;
      } else {
        // Standard Purchase Bill: increments inventory stock
        updatedItems = prevBill
          ? revertPurchaseStockAdjustment(currentItems, prevBill.items, bill.items, allowNegativeStock)
          : applyPurchaseStockIncrement(currentItems, bill.items);
      }

      // Auto-register any brand new purchased items not yet in catalog (only for regular inward bills or active challans)
      const finalItems = [...updatedItems];
      if (!isReturn && !(isChallan && (bill.isCancelled || bill.challanStatus === 'CANCELLED'))) {
        for (const line of bill.items) {
          const exists = findMatchingItem(finalItems, line);
          if (!exists && line.name && line.name.trim()) {
            const newId = line.itemId || `ITM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            line.itemId = newId;
            const newItem: InventoryItem = {
              id: newId,
              name: line.name.trim(),
              hsnSacCode: line.hsnSacCode || '844332',
              category: 'General',
              unit: (line.unit as UnitOfMeasurement) || 'PCS',
              salePrice: Number(((line.unitPrice || 0) * 1.2).toFixed(2)),
              purchasePrice: line.unitPrice || 0,
              gstRate: line.gstRate || 0,
              currentStock: Math.max(0, line.quantity || 0),
              minStockAlert: 5,
              isActive: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            finalItems.push(newItem);
          }
        }
      }

      this.persistStockUpdates(currentItems, finalItems);
    }

    const targetSupplierId =
      bill.supplierId ||
      (bill.supplierName
        ? this.getParties().find(
            (p) => p.name.trim().toLowerCase() === bill.supplierName.trim().toLowerCase()
          )?.id
        : undefined);
    if (targetSupplierId) {
      this.recalculatePartyBalance(targetSupplierId);
    }
    const prevSupplierId =
      prevBill?.supplierId ||
      (prevBill?.supplierName
        ? this.getParties().find(
            (p) => p.name.trim().toLowerCase() === prevBill.supplierName.trim().toLowerCase()
          )?.id
        : undefined);
    if (prevSupplierId && prevSupplierId !== targetSupplierId) {
      this.recalculatePartyBalance(prevSupplierId);
    }

    // Reverse Charge Mechanism (RCM): Paired Double-Entry Journal Voucher (only for normal purchase bills)
    const rcmVoucherId = `VCH-RCM-${bill.id}`;
    if (!isPo && !isChallan && !isReturn && bill.isRcm && (bill.totalTax || 0) > 0) {
      // Find any existing ACTIVE RCM voucher for this bill
      let existingActiveRcm = this.getVouchers().find(
        (v) =>
          !v.isReversed &&
          !v.isCancelled &&
          !v.voucherNumber.startsWith('VCH-REV-') &&
          (v.id === rcmVoucherId ||
            v.id.startsWith(`${rcmVoucherId}-`) ||
            (v.referenceNo === bill.billNumber && v.voucherNumber.startsWith('VCH-RCM-')))
      );

      // When RCM tax or key details change on an existing active voucher, reverse it first
      if (
        existingActiveRcm &&
        (Number((existingActiveRcm.totalAmount || 0).toFixed(2)) !== Number((bill.totalTax || 0).toFixed(2)) ||
          existingActiveRcm.date !== bill.date)
      ) {
        const rev = createReversalVoucher({
          originalVoucher: existingActiveRcm,
          reason: `Reversal of RCM voucher #${existingActiveRcm.voucherNumber} due to tax adjustment on bill #${bill.billNumber}`,
        });
        this.saveVoucher(rev);
        this.saveVoucher({
          ...existingActiveRcm,
          isReversed: true,
          reversalVoucherId: rev.id,
        });
        existingActiveRcm = undefined;
      }

      let targetRcmId: string;
      if (existingActiveRcm) {
        targetRcmId = existingActiveRcm.id;
      } else {
        // Ensure we never collide with or overwrite an existing (or reversed/cancelled) voucher
        const baseId = rcmVoucherId;
        const isBaseTaken = this.getVouchers().some((v) => v.id === baseId);
        targetRcmId = isBaseTaken
          ? `${baseId}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`
          : baseId;
      }

      // Final safety guard: targetRcmId must never match a reversed or cancelled voucher
      if (this.getVouchers().some((v) => v.id === targetRcmId && (v.isReversed || v.isCancelled))) {
        targetRcmId = `${rcmVoucherId}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      }

      const rcmVoucher = createRcmJournalVoucher({
        id: targetRcmId,
        billId: bill.id,
        billNumber: bill.billNumber,
        date: bill.date,
        supplierName: bill.supplierName,
        supplierId: bill.supplierId,
        cgstAmount: bill.totalCgst,
        sgstAmount: bill.totalSgst,
        igstAmount: bill.totalIgst,
        cessAmount: bill.totalCess,
        totalTax: bill.totalTax,
      });
      this.saveVoucher(rcmVoucher);
    } else {
      // If purchase is not RCM or has 0 tax, reverse any existing active RCM voucher (no hard-deletes)
      const existingRcmList = this.getVouchers().filter(
        (v) =>
          !v.isReversed &&
          !v.isCancelled &&
          !v.voucherNumber.startsWith('VCH-REV-') &&
          (v.id === rcmVoucherId ||
            v.id.startsWith(`${rcmVoucherId}-`) ||
            (v.referenceNo === bill.billNumber && v.voucherNumber.startsWith('VCH-RCM-')))
      );
      for (const existingRcm of existingRcmList) {
        const rev = createReversalVoucher({
          originalVoucher: existingRcm,
          reason: `Reversal of RCM liability & ITC journal entry for bill #${bill.billNumber} (RCM disabled)`,
        });
        this.saveVoucher(rev);
        this.saveVoucher({
          ...existingRcm,
          isReversed: true,
          reversalVoucherId: rev.id,
        });
      }
    }

    // MCA Audit Trail Hook
    const auditUser = this.getAuditUser();
    const actionType = prevBill ? 'PURCHASE_UPDATE' : 'PURCHASE_CREATE';
    const summary = `${prevBill ? 'Updated' : 'Created'} purchase bill #${bill.billNumber} from ${bill.supplierName}`;
    auditTrail
      .logEvent({
        userId: auditUser.userId,
        userName: auditUser.userName,
        userRole: auditUser.userRole,
        actionType,
        documentId: bill.id,
        documentType: 'PURCHASE',
        previousSnapshot: prevBill ? JSON.parse(JSON.stringify(prevBill)) : undefined,
        newSnapshot: JSON.parse(JSON.stringify(bill)),
        summary,
      })
      .catch((err) => console.error('Audit log failed for savePurchase:', err));

    this.notifyListeners();
  }

  deletePurchase(id: string): void {
    const bill = this.getPurchases().find((b) => b.id === id);
    if (bill) {
      const activeLinkedPaymentVouchers = this.getVouchers().filter(
        (v) =>
          !v.isReversed &&
          !v.isCancelled &&
          v.voucherType === 'PAYMENT' &&
          ((v.sourceDocumentType === 'PURCHASE' && v.sourceDocumentId === id) ||
            v.sourceDocumentNumber === bill.billNumber ||
            v.paymentAllocations?.some((a) => a.documentType === 'PURCHASE' && a.documentId === id))
      );
      if (activeLinkedPaymentVouchers.length > 0) {
        const vNumbers = activeLinkedPaymentVouchers.map((v) => `#${v.voucherNumber}`).join(', ');
        throw new Error(
          `Cannot delete purchase bill #${bill.billNumber} with active linked payment voucher(s) (${vNumbers}). Please reverse or unlink payments before deleting the bill.`
        );
      }
    }

    const list = this.getPurchases().filter((b) => b.id !== id);
    this.recordTombstone('purchase', id);
    this.set(STORAGE_KEYS.PURCHASES, list);
    this.backgroundPouchDelete('purchase', id);
    this.broadcastChange('purchase', 'delete', id);

    // Statutory Audit Trail: Reverse paired RCM journal voucher upon bill deletion (no hard-deletes)
    const rcmVoucherId = `VCH-RCM-${id}`;
    const pairedRcmVouchers = this.getVouchers().filter(
      (v) =>
        !v.isReversed &&
        !v.isCancelled &&
        !v.voucherNumber.startsWith('VCH-REV-') &&
        (v.id === rcmVoucherId ||
          v.id.startsWith(`${rcmVoucherId}-`) ||
          (bill && v.referenceNo === bill.billNumber && v.voucherNumber.startsWith('VCH-RCM-')))
    );
    for (const pairedRcm of pairedRcmVouchers) {
      const revRcm = createReversalVoucher({
        originalVoucher: pairedRcm,
        reason: `Reversal of RCM liability & ITC journal entry for deleted bill #${bill?.billNumber || id}`,
      });
      this.saveVoucher(revRcm);
      this.saveVoucher({
        ...pairedRcm,
        isReversed: true,
        reversalVoucherId: revRcm.id,
      });
    }

    // Statutory Audit Trail: Reverse linked posted purchase vouchers instead of hard-deleting
    if (bill) {
      const allVouchers = this.getVouchers();
      const linkedVouchers = allVouchers.filter(
        (v) =>
          !v.isReversed &&
          !v.isCancelled &&
          v.voucherType === 'PURCHASE' &&
          !v.voucherNumber.startsWith('VCH-REV-') &&
          !v.voucherNumber.startsWith('VCH-RCM-') &&
          (v.referenceNo === bill.billNumber ||
            v.voucherNumber === `VCH-PUR-${bill.billNumber}` ||
            v.voucherNumber === `VCH-PURCHASE-${bill.billNumber}`)
      );
      for (const origVoucher of linkedVouchers) {
        const revVoucher = createReversalVoucher({
          originalVoucher: origVoucher,
          reason: `Reversal of Purchase Voucher #${origVoucher.voucherNumber} upon deletion of bill #${bill.billNumber}`,
        });
        this.saveVoucher(revVoucher);
        this.saveVoucher({
          ...origVoucher,
          isReversed: true,
          reversalVoucherId: revVoucher.id,
        });
      }
    }

    // Revert stock upon bill deletion via pure domain stockEngine
    if (bill && bill.purchaseType !== 'PO') {
      const isBillFromChallan = bill.purchaseType === 'BILL' && Boolean(bill.convertedFromChallanId);
      const isConvertedChallan = bill.purchaseType === 'CHALLAN' && Boolean(bill.isConverted);
      const isCancelledChallan = bill.purchaseType === 'CHALLAN' && Boolean(bill.isCancelled || bill.challanStatus === 'CANCELLED');

      // Only revert stock if the stock was actually held by this document:
      // - Don't revert if this is a Bill whose stock came from a Challan (the Challan provided the stock).
      // - Don't revert if this is a Challan that was already converted to a Bill (the Bill now owns the transaction).
      // - Don't revert if this is a Challan that was already cancelled (its stock was already reverted on cancellation).
      if (!isBillFromChallan && !isConvertedChallan && !isCancelledChallan) {
        const allowNegativeStock = this.getAllowNegativeStock();
        const currentItems = this.getItems();
        const updatedItems = bill.purchaseType === 'RETURN'
          ? applyPurchaseStockIncrement(currentItems, bill.items)
          : applyPurchaseStockDecrement(currentItems, bill.items, allowNegativeStock);
        this.persistStockUpdates(currentItems, updatedItems);
      }
    }

    const supplierIdToRecalc =
      bill?.supplierId ||
      (bill?.supplierName
        ? this.getParties().find(
            (p) => p.name.trim().toLowerCase() === bill.supplierName.trim().toLowerCase()
          )?.id
        : undefined);
    if (supplierIdToRecalc) {
      this.recalculatePartyBalance(supplierIdToRecalc);
    }

    // MCA Audit Trail Hook
    const auditUser = this.getAuditUser();
    auditTrail
      .logEvent({
        userId: auditUser.userId,
        userName: auditUser.userName,
        userRole: auditUser.userRole,
        actionType: 'PURCHASE_DELETE',
        documentId: id,
        documentType: 'PURCHASE',
        previousSnapshot: bill ? JSON.parse(JSON.stringify(bill)) : { id },
        newSnapshot: undefined,
        summary: `Deleted purchase bill #${bill?.billNumber || id} from ${bill?.supplierName || 'Unknown Supplier'}`,
      })
      .catch((err) => console.error('Audit log failed for deletePurchase:', err));

    this.notifyListeners();
  }

  // Stock Adjustments
  getStockAdjustments(): StockAdjustment[] {
    return this.get<StockAdjustment[]>(STORAGE_KEYS.ADJUSTMENTS, []);
  }

  saveStockAdjustment(adj: StockAdjustment): void {
    const list = [...this.getStockAdjustments()];
    list.unshift(adj);
    this.set(STORAGE_KEYS.ADJUSTMENTS, list);
    this.backgroundPouchPut('adjustment', adj);
    this.broadcastChange('adjustment', 'save', adj.id, adj);

    // Update item stock using pure domain stockEngine
    const allowNegativeStock = this.getAllowNegativeStock();
    const currentItems = this.getItems();
    const item = currentItems.find((i) => i.id === adj.itemId);
    const prevStock = item?.currentStock ?? 0;
    const delta = adj.type === 'STOCK_IN' ? adj.quantity : -adj.quantity;
    const resultingStock = allowNegativeStock ? prevStock + delta : Math.max(0, prevStock + delta);

    const updatedItems = applyStockAdjustmentRecord(currentItems, adj, allowNegativeStock);
    this.persistStockUpdates(currentItems, updatedItems);

    // MCA Audit Trail Hook
    const auditUser = this.getAuditUser();
    auditTrail
      .logEvent({
        userId: auditUser.userId,
        userName: auditUser.userName,
        userRole: auditUser.userRole,
        actionType: 'STOCK_ADJUSTMENT',
        documentId: adj.id,
        documentType: 'ITEM',
        previousSnapshot: item ? { itemId: item.id, itemName: item.name, currentStock: prevStock, unit: item.unit } : undefined,
        newSnapshot: { ...JSON.parse(JSON.stringify(adj)), previousStock: prevStock, resultingStock },
        summary: `Stock adjustment (${adj.type}): ${adj.quantity} units for "${adj.itemName}". Reason: ${adj.reason || 'None'}`,
      })
      .catch((err) => console.error('Audit log failed for saveStockAdjustment:', err));
  }

  /**
   * Orchestrates payment voucher persistence and two-way settlement allocations with invoices/bills.
   * 0. Validates allocations in memory before touching records.
   * 1. Reverses previous voucher's allocations if editing.
   * 2. Saves voucher.
   * 3. Applies new allocations to linked invoices/bills.
   * 4. Recalculates party balance.
   * 5. Notifies listeners.
   */
  savePaymentVoucher(voucher: Voucher, options?: { skipDocumentUpdate?: boolean }): void {
    const list = this.getVouchers();
    const prevVoucher = list.find((v) => v.id === voucher.id);

    // 0. Pre-validate allocations before modifying state or reversing old allocations
    if (voucher.paymentAllocations && voucher.paymentAllocations.length > 0 && !options?.skipDocumentUpdate) {
      const inMemoryInvoices = prevVoucher?.paymentAllocations && !prevVoucher.isReversed && !prevVoucher.isCancelled
        ? reverseAllocations(this.getInvoices(), prevVoucher.paymentAllocations.filter((a) => a.documentType === 'INVOICE'))
        : this.getInvoices();
      const inMemoryPurchases = prevVoucher?.paymentAllocations && !prevVoucher.isReversed && !prevVoucher.isCancelled
        ? reverseAllocations(this.getPurchases(), prevVoucher.paymentAllocations.filter((a) => a.documentType === 'PURCHASE'))
        : this.getPurchases();

      const seenDocIds = new Set<string>();
      let sumAllocated = 0;

      for (const alloc of voucher.paymentAllocations) {
        if (seenDocIds.has(alloc.documentId)) {
          throw new Error(`Duplicate document allocation detected for #${alloc.documentNumber || alloc.documentId}.`);
        }
        seenDocIds.add(alloc.documentId);

        if (typeof alloc.amount !== 'number' || alloc.amount <= 0) {
          throw new Error(`Allocation amount for #${alloc.documentNumber || alloc.documentId} must be greater than zero.`);
        }
        sumAllocated = Number((sumAllocated + alloc.amount).toFixed(2));

        if (alloc.documentType === 'INVOICE') {
          const inv = inMemoryInvoices.find((i) => i.id === alloc.documentId);
          if (!inv) {
            const inPur = inMemoryPurchases.find((p) => p.id === alloc.documentId);
            if (inPur) {
              throw new Error(`Document #${alloc.documentNumber || alloc.documentId} is a purchase bill, but allocated as INVOICE.`);
            }
            throw new Error(`Invoice #${alloc.documentNumber || alloc.documentId} not found in outstanding records.`);
          }
          if (inv.isCancelled) {
            throw new Error(`Invoice #${alloc.documentNumber || inv.invoiceNumber} is cancelled and cannot be allocated.`);
          }
          if (
            inv.invoiceType === 'CREDIT_NOTE' ||
            inv.invoiceType === 'ESTIMATE' ||
            inv.invoiceType === 'SALES_ORDER' ||
            inv.invoiceType === 'DELIVERY_CHALLAN'
          ) {
            throw new Error(`Document #${alloc.documentNumber || inv.invoiceNumber} is a ${inv.invoiceType} and is not an outstanding payable invoice/bill.`);
          }
          const partyMatches =
            (!voucher.partyId || !inv.partyId || inv.partyId === voucher.partyId) &&
            (!voucher.partyName || !inv.partyName || inv.partyName.trim().toLowerCase() === voucher.partyName.trim().toLowerCase());
          if (!partyMatches) {
            throw new Error(`Invoice #${inv.invoiceNumber} belongs to a different party.`);
          }
          const bal = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : inv.grandTotal - (inv.paidAmount || 0);
          if (bal <= 0.01) {
            throw new Error(`Invoice #${inv.invoiceNumber} has no outstanding balance.`);
          }
          if (alloc.amount > bal + 0.01) {
            throw new Error(`Allocation amount ₹${alloc.amount.toFixed(2)} exceeds balance ₹${bal.toFixed(2)} on invoice #${inv.invoiceNumber}.`);
          }
        } else if (alloc.documentType === 'PURCHASE') {
          const pur = inMemoryPurchases.find((p) => p.id === alloc.documentId);
          if (!pur) {
            const inInv = inMemoryInvoices.find((i) => i.id === alloc.documentId);
            if (inInv) {
              throw new Error(`Document #${alloc.documentNumber || alloc.documentId} is an invoice, but allocated as PURCHASE.`);
            }
            throw new Error(`Purchase bill #${alloc.documentNumber || alloc.documentId} not found in outstanding records.`);
          }
          if (pur.isCancelled) {
            throw new Error(`Purchase bill #${alloc.documentNumber || pur.billNumber} is cancelled and cannot be allocated.`);
          }
          if (
            pur.purchaseType === 'RETURN' ||
            pur.purchaseType === 'PO' ||
            pur.purchaseType === 'CHALLAN' ||
            (pur as any).purchaseType === 'PURCHASE_ORDER' ||
            (pur as any).purchaseType === 'PURCHASE_CHALLAN' ||
            (pur as any).purchaseType === 'PURCHASE_RETURN'
          ) {
            throw new Error(`Document #${alloc.documentNumber || pur.billNumber} is a ${pur.purchaseType} and is not an outstanding payable invoice/bill.`);
          }
          const partyMatches =
            (!voucher.partyId || !pur.supplierId || pur.supplierId === voucher.partyId) &&
            (!voucher.partyName || !pur.supplierName || pur.supplierName.trim().toLowerCase() === voucher.partyName.trim().toLowerCase());
          if (!partyMatches) {
            throw new Error(`Purchase bill #${pur.billNumber} belongs to a different party.`);
          }
          const bal = typeof pur.balanceAmount === 'number' ? pur.balanceAmount : pur.grandTotal - (pur.paidAmount || 0);
          if (bal <= 0.01) {
            throw new Error(`Purchase bill #${pur.billNumber} has no outstanding balance.`);
          }
          if (alloc.amount > bal + 0.01) {
            throw new Error(`Allocation amount ₹${alloc.amount.toFixed(2)} exceeds balance ₹${bal.toFixed(2)} on purchase bill #${pur.billNumber}.`);
          }
        } else {
          throw new Error(`Invalid document type ${(alloc as any).documentType}.`);
        }
      }

      const maxAllowed = Number((voucher.totalAmount + 0.01).toFixed(2));
      if (sumAllocated > maxAllowed) {
        throw new Error(`Total allocated amount (₹${sumAllocated.toFixed(2)}) exceeds voucher total amount (₹${voucher.totalAmount.toFixed(2)}).`);
      }
    }

    // 1. Reverse old allocations if updating an existing voucher
    if (prevVoucher && prevVoucher.paymentAllocations && prevVoucher.paymentAllocations.length > 0 && !options?.skipDocumentUpdate) {
      const invAllocs = prevVoucher.paymentAllocations.filter((a) => a.documentType === 'INVOICE');
      if (invAllocs.length > 0) {
        const invoices = this.getInvoices();
        const updatedInvoices = reverseAllocations(invoices, invAllocs);
        for (const updatedInv of updatedInvoices) {
          if (invoices.some((orig) => orig.id === updatedInv.id && (orig.paidAmount !== updatedInv.paidAmount || orig.balanceAmount !== updatedInv.balanceAmount))) {
            this.saveInvoice(updatedInv, { skipSettlementDerivation: true });
          }
        }
      }

      const purAllocs = prevVoucher.paymentAllocations.filter((a) => a.documentType === 'PURCHASE');
      if (purAllocs.length > 0) {
        const purchases = this.getPurchases();
        const updatedPurchases = reverseAllocations(purchases, purAllocs);
        for (const updatedPur of updatedPurchases) {
          if (purchases.some((orig) => orig.id === updatedPur.id && (orig.paidAmount !== updatedPur.paidAmount || orig.balanceAmount !== updatedPur.balanceAmount))) {
            this.savePurchase(updatedPur, { skipSettlementDerivation: true });
          }
        }
      }
    }

    // 2. Save the voucher (handles journal entries, audit trail, pouch, etc.)
    this.saveVoucher(voucher);

    // 3. Apply new allocations
    if (voucher.paymentAllocations && voucher.paymentAllocations.length > 0 && !options?.skipDocumentUpdate) {
      const voucherMode = inferVoucherPaymentMode(voucher);
      const invAllocs = voucher.paymentAllocations.filter((a) => a.documentType === 'INVOICE');
      if (invAllocs.length > 0) {
        const invoices = this.getInvoices();
        const updatedInvoices = applyAllocations(invoices, invAllocs, { paymentMode: voucherMode });
        for (const updatedInv of updatedInvoices) {
          if (invoices.some((orig) => orig.id === updatedInv.id && (orig.paidAmount !== updatedInv.paidAmount || orig.balanceAmount !== updatedInv.balanceAmount))) {
            this.saveInvoice(updatedInv, { skipSettlementDerivation: true });
          }
        }
      }

      const purAllocs = voucher.paymentAllocations.filter((a) => a.documentType === 'PURCHASE');
      if (purAllocs.length > 0) {
        const purchases = this.getPurchases();
        const updatedPurchases = applyAllocations(purchases, purAllocs, { paymentMode: voucherMode });
        for (const updatedPur of updatedPurchases) {
          if (purchases.some((orig) => orig.id === updatedPur.id && (orig.paidAmount !== updatedPur.paidAmount || orig.balanceAmount !== updatedPur.balanceAmount))) {
            this.savePurchase(updatedPur, { skipSettlementDerivation: true });
          }
        }
      }
    }

    // 4. Recalculate party balance
    if (voucher.partyId) {
      this.recalculatePartyBalance(voucher.partyId);
    }
    if (prevVoucher?.partyId && prevVoucher.partyId !== voucher.partyId) {
      this.recalculatePartyBalance(prevVoucher.partyId);
    }

    this.notifyListeners();
  }

  /**
   * Reverses a payment/receipt voucher:
   * 1. Rejects if already reversed or cancelled.
   * 2. Creates reversal voucher via createReversalVoucher.
   * 3. Reverses original voucher's allocations, restoring linked documents' balances.
   * 4. Marks original voucher reversed and saves both.
   * 5. Recalculates party balance.
   */
  reversePaymentVoucher(voucher: Voucher, reason?: string): Voucher {
    if (voucher.isReversed || voucher.isCancelled || voucher.voucherNumber.startsWith('VCH-REV-')) {
      throw new Error(`Cannot reverse voucher #${voucher.voucherNumber}: voucher is already reversed or cancelled.`);
    }

    const rev = createReversalVoucher({
      originalVoucher: voucher,
      reason: reason || `Reversal of ${voucher.voucherType} #${voucher.voucherNumber}`,
    });

    if (voucher.paymentAllocations && voucher.paymentAllocations.length > 0) {
      const invAllocs = voucher.paymentAllocations.filter((a) => a.documentType === 'INVOICE');
      if (invAllocs.length > 0) {
        const invoices = this.getInvoices();
        const updatedInvoices = reverseAllocations(invoices, invAllocs);
        for (const updatedInv of updatedInvoices) {
          if (invoices.some((orig) => orig.id === updatedInv.id && (orig.paidAmount !== updatedInv.paidAmount || orig.balanceAmount !== updatedInv.balanceAmount))) {
            this.saveInvoice(updatedInv, { skipSettlementDerivation: true });
          }
        }
      }

      const purAllocs = voucher.paymentAllocations.filter((a) => a.documentType === 'PURCHASE');
      if (purAllocs.length > 0) {
        const purchases = this.getPurchases();
        const updatedPurchases = reverseAllocations(purchases, purAllocs);
        for (const updatedPur of updatedPurchases) {
          if (purchases.some((orig) => orig.id === updatedPur.id && (orig.paidAmount !== updatedPur.paidAmount || orig.balanceAmount !== updatedPur.balanceAmount))) {
            this.savePurchase(updatedPur, { skipSettlementDerivation: true });
          }
        }
      }
    }

    this.saveVoucher(rev);
    this.saveVoucher({
      ...voucher,
      isReversed: true,
      reversalVoucherId: rev.id,
    });

    if (voucher.partyId) {
      this.recalculatePartyBalance(voucher.partyId);
    }

    this.notifyListeners();
    return rev;
  }

  override deleteVoucher(id: string): void {
    const prevVoucher = this.getVouchers().find((v) => v.id === id);
    if (prevVoucher && prevVoucher.paymentAllocations && prevVoucher.paymentAllocations.length > 0 && !prevVoucher.isReversed && !prevVoucher.isCancelled) {
      const invAllocs = prevVoucher.paymentAllocations.filter((a) => a.documentType === 'INVOICE');
      if (invAllocs.length > 0) {
        const invoices = this.getInvoices();
        const updatedInvoices = reverseAllocations(invoices, invAllocs);
        for (const updatedInv of updatedInvoices) {
          if (invoices.some((orig) => orig.id === updatedInv.id && (orig.paidAmount !== updatedInv.paidAmount || orig.balanceAmount !== updatedInv.balanceAmount))) {
            this.saveInvoice(updatedInv);
          }
        }
      }

      const purAllocs = prevVoucher.paymentAllocations.filter((a) => a.documentType === 'PURCHASE');
      if (purAllocs.length > 0) {
        const purchases = this.getPurchases();
        const updatedPurchases = reverseAllocations(purchases, purAllocs);
        for (const updatedPur of updatedPurchases) {
          if (purchases.some((orig) => orig.id === updatedPur.id && (orig.paidAmount !== updatedPur.paidAmount || orig.balanceAmount !== updatedPur.balanceAmount))) {
            this.savePurchase(updatedPur);
          }
        }
      }
    }

    super.deleteVoucher(id);
  }

  /**
   * Unlinks a specific payment allocation from a voucher:
   * 1. Finds active voucher and matching allocation.
   * 2. Rejects if missing, reversed, or cancelled.
   * 3. Removes that allocation.
   * 4. Updates allocationMode ('UNALLOCATED' if none remain, 'MANUAL' otherwise) and clears stale source fields.
   * 5. Saves through savePaymentVoucher so original allocation is reversed and remaining re-applied.
   * 6. Restores linked document balances/status/splits.
   */
  unlinkPaymentAllocation(
    voucherId: string,
    documentType: 'INVOICE' | 'PURCHASE',
    documentId: string
  ): Voucher {
    const voucher = this.getVouchers().find((v) => v.id === voucherId);
    if (!voucher) {
      throw new Error(`Voucher #${voucherId} not found.`);
    }
    if (voucher.isReversed || voucher.isCancelled) {
      throw new Error(`Cannot unlink allocation from reversed or cancelled voucher #${voucher.voucherNumber}.`);
    }

    const allocations = voucher.paymentAllocations || [];
    const allocIndex = allocations.findIndex(
      (a) => a.documentType === documentType && a.documentId === documentId
    );
    if (allocIndex === -1) {
      throw new Error(
        `Allocation for ${documentType} #${documentId} not found on voucher #${voucher.voucherNumber}.`
      );
    }

    // Remove only that allocation
    const remainingAllocations = allocations.filter((_, idx) => idx !== allocIndex);

    const updatedVoucher: Voucher = {
      ...voucher,
      paymentAllocations: remainingAllocations,
    };

    if (remainingAllocations.length === 0) {
      updatedVoucher.allocationMode = 'UNALLOCATED';
      delete (updatedVoucher as any).sourceDocumentType;
      delete (updatedVoucher as any).sourceDocumentId;
      delete (updatedVoucher as any).sourceDocumentNumber;
    } else {
      updatedVoucher.allocationMode = 'MANUAL';
      if (
        (updatedVoucher.sourceDocumentType === documentType && updatedVoucher.sourceDocumentId === documentId) ||
        !remainingAllocations.some((a) => a.documentId === updatedVoucher.sourceDocumentId)
      ) {
        delete (updatedVoucher as any).sourceDocumentType;
        delete (updatedVoucher as any).sourceDocumentId;
        delete (updatedVoucher as any).sourceDocumentNumber;
      }
    }

    this.savePaymentVoucher(updatedVoucher);

    const saved = this.getVouchers().find((v) => v.id === voucherId);
    return saved || updatedVoucher;
  }

  /**
   * Reassigns all active linked payment vouchers from an old party to a new party:
   * 1. Finds existing invoice and all active RECEIPT/PAYMENT vouchers linked to it.
   * 2. Rejects switch if any linked voucher allocates to another document belonging to a different party.
   * 3. Updates partyId/partyName and only the party journal credit/debit line (or ACC_CASH).
   * 4. Saves via savePaymentVoucher with skipDocumentUpdate: true.
   * 5. Recalculates both old and new party balances and notifies listeners.
   */
  reassignLinkedPaymentParty(
    invoiceId: string,
    newPartyId: string,
    newPartyName: string
  ): number {
    const invoice = this.getInvoices().find((i) => i.id === invoiceId);
    if (!invoice) {
      throw new Error(`Invoice #${invoiceId} not found.`);
    }
    const oldPartyId = invoice.partyId;
    if (
      oldPartyId === newPartyId &&
      (invoice.partyName || '').trim().toLowerCase() === (newPartyName || '').trim().toLowerCase()
    ) {
      return 0;
    }

    // Find all active RECEIPT/PAYMENT vouchers linked to this invoice
    const linkedVouchers = this.getVouchers().filter(
      (v) =>
        !v.isCancelled &&
        !v.isReversed &&
        (v.voucherType === 'RECEIPT' || v.voucherType === 'PAYMENT') &&
        ((v.sourceDocumentType === 'INVOICE' && v.sourceDocumentId === invoiceId) ||
          v.paymentAllocations?.some((a) => a.documentType === 'INVOICE' && a.documentId === invoiceId))
    );

    if (linkedVouchers.length === 0) {
      return 0;
    }

    // Before changing anything, reject the switch if any linked voucher also allocates to another document
    // whose party does not match the new party.
    const invoices = this.getInvoices();
    const purchases = this.getPurchases();

    for (const v of linkedVouchers) {
      for (const alloc of v.paymentAllocations || []) {
        if (alloc.documentType === 'INVOICE' && alloc.documentId !== invoiceId) {
          const otherInv = invoices.find((i) => i.id === alloc.documentId);
          if (otherInv && otherInv.partyId !== newPartyId) {
            throw new Error(
              `Cannot change invoice party: linked payment voucher #${v.voucherNumber} is also allocated to invoice #${otherInv.invoiceNumber} which belongs to a different party. Unlink those payments first.`
            );
          }
        } else if (alloc.documentType === 'PURCHASE') {
          const otherPur = purchases.find((p) => p.id === alloc.documentId);
          if (otherPur && otherPur.supplierId !== newPartyId) {
            throw new Error(
              `Cannot change invoice party: linked payment voucher #${v.voucherNumber} is also allocated to purchase bill #${otherPur.billNumber} which belongs to a different party. Unlink those payments first.`
            );
          }
        }
      }
    }

    // Update each linked voucher
    for (const v of linkedVouchers) {
      const updatedEntries = (v.entries || []).map((entry) => {
        if (v.voucherType === 'RECEIPT') {
          // RECEIPT: credit line for old party (or ACC_CASH)
          const isPartyLine =
            entry.credit > 0 &&
            (entry.accountId === v.partyId ||
              entry.accountId === oldPartyId ||
              entry.accountId === 'ACC_CASH' ||
              (entry.accountName && (entry.accountName === v.partyName || entry.accountName === invoice.partyName)));
          if (isPartyLine) {
            return {
              ...entry,
              accountId: newPartyId || 'ACC_CASH',
              accountName: newPartyName || 'Retail Customer',
            };
          }
        } else if (v.voucherType === 'PAYMENT') {
          // PAYMENT: debit line for old party (or ACC_CASH)
          const isPartyLine =
            entry.debit > 0 &&
            (entry.accountId === v.partyId ||
              entry.accountId === oldPartyId ||
              entry.accountId === 'ACC_CASH' ||
              (entry.accountName && (entry.accountName === v.partyName || entry.accountName === invoice.partyName)));
          if (isPartyLine) {
            return {
              ...entry,
              accountId: newPartyId || 'ACC_CASH',
              accountName: newPartyName || 'Retail Customer',
            };
          }
        }
        return entry;
      });

      const updatedVoucher: Voucher = {
        ...v,
        partyId: newPartyId,
        partyName: newPartyName,
        entries: updatedEntries,
      };

      this.savePaymentVoucher(updatedVoucher, { skipDocumentUpdate: true });
    }

    if (oldPartyId && oldPartyId !== 'ACC_CASH') {
      this.recalculatePartyBalance(oldPartyId);
    }
    if (newPartyId && newPartyId !== 'ACC_CASH') {
      this.recalculatePartyBalance(newPartyId);
    }
    this.notifyListeners();
    return linkedVouchers.length;
  }
}
