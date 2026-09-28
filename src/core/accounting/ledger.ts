import type { Voucher, JournalEntryLine, LedgerAccount } from './voucherTypes.ts';

/**
 * Validates that debit and credit amounts in a voucher match exactly.
 */
export function validateVoucherBalance(entries: JournalEntryLine[]): { isBalanced: boolean; diff: number } {
  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
  const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
  const diff = Number(Math.abs(totalDebit - totalCredit).toFixed(2));
  return {
    isBalanced: diff === 0,
    diff,
  };
}

/**
 * Generates automated Double-Entry Journal Voucher for a GST Sales Invoice.
 */
export function createSalesInvoiceVoucher(params: {
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerId: string;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  grandTotal: number;
  isCashSale: boolean;
}): Voucher {
  const entries: JournalEntryLine[] = [];

  // Debit: Cash/Bank or Customer Account
  entries.push({
    accountId: params.isCashSale ? 'ACC_CASH' : params.customerId,
    accountName: params.isCashSale ? 'Cash-in-hand' : params.customerName,
    debit: params.grandTotal,
    credit: 0,
    narration: `Sales Bill #${params.invoiceNumber}`,
  });

  // Credit: Sales Account (Taxable Value)
  entries.push({
    accountId: 'ACC_SALES',
    accountName: 'GST Sales Account',
    debit: 0,
    credit: params.taxableAmount,
    narration: `Sales Revenue against #${params.invoiceNumber}`,
  });

  // Credit: Output CGST
  if (params.cgstAmount > 0) {
    entries.push({
      accountId: 'ACC_OUTPUT_CGST',
      accountName: 'Output CGST Account',
      debit: 0,
      credit: params.cgstAmount,
    });
  }

  // Credit: Output SGST
  if (params.sgstAmount > 0) {
    entries.push({
      accountId: 'ACC_OUTPUT_SGST',
      accountName: 'Output SGST Account',
      debit: 0,
      credit: params.sgstAmount,
    });
  }

  // Credit: Output IGST
  if (params.igstAmount > 0) {
    entries.push({
      accountId: 'ACC_OUTPUT_IGST',
      accountName: 'Output IGST Account',
      debit: 0,
      credit: params.igstAmount,
    });
  }

  // Credit: Output Cess
  if (params.cessAmount > 0) {
    entries.push({
      accountId: 'ACC_OUTPUT_CESS',
      accountName: 'Output GST Cess Account',
      debit: 0,
      credit: params.cessAmount,
    });
  }

  return {
    id: `VCH-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    voucherNumber: `VCH-SAL-${params.invoiceNumber}`,
    voucherType: 'SALES',
    date: params.date,
    referenceNo: params.invoiceNumber,
    entries,
    narration: `Being goods/services sold vide invoice #${params.invoiceNumber}`,
    totalAmount: params.grandTotal,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generates automated Double-Entry Journal Voucher for a GST Inward Purchase Bill (ITC).
 */
export function createPurchaseInvoiceVoucher(params: {
  billNumber: string;
  date: string;
  supplierName: string;
  supplierId: string;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  grandTotal: number;
  isCashPurchase: boolean;
}): Voucher {
  const entries: JournalEntryLine[] = [];

  // Debit: Purchase Account (Taxable Value)
  entries.push({
    accountId: 'ACC_PURCHASE',
    accountName: 'GST Purchase Account',
    debit: params.taxableAmount,
    credit: 0,
    narration: `Purchases against bill #${params.billNumber}`,
  });

  // Debit: Input CGST (Asset / ITC Claimable)
  if (params.cgstAmount > 0) {
    entries.push({
      accountId: 'ACC_INPUT_CGST',
      accountName: 'Input CGST (ITC) Account',
      debit: params.cgstAmount,
      credit: 0,
    });
  }

  // Debit: Input SGST (Asset / ITC Claimable)
  if (params.sgstAmount > 0) {
    entries.push({
      accountId: 'ACC_INPUT_SGST',
      accountName: 'Input SGST (ITC) Account',
      debit: params.sgstAmount,
      credit: 0,
    });
  }

  // Debit: Input IGST (Asset / ITC Claimable)
  if (params.igstAmount > 0) {
    entries.push({
      accountId: 'ACC_INPUT_IGST',
      accountName: 'Input IGST (ITC) Account',
      debit: params.igstAmount,
      credit: 0,
    });
  }

  // Debit: Input Cess
  if (params.cessAmount > 0) {
    entries.push({
      accountId: 'ACC_INPUT_CESS',
      accountName: 'Input GST Cess (ITC) Account',
      debit: params.cessAmount,
      credit: 0,
    });
  }

  // Credit: Cash/Bank or Supplier Account (Liability / Creditor)
  entries.push({
    accountId: params.isCashPurchase ? 'ACC_CASH' : params.supplierId,
    accountName: params.isCashPurchase ? 'Cash-in-hand' : params.supplierName,
    debit: 0,
    credit: params.grandTotal,
    narration: `Payable for bill #${params.billNumber}`,
  });

  return {
    id: `VCH-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    voucherNumber: `VCH-PUR-${params.billNumber}`,
    voucherType: 'PURCHASE',
    date: params.date,
    referenceNo: params.billNumber,
    entries,
    narration: `Being goods/services purchased vide bill #${params.billNumber}`,
    totalAmount: params.grandTotal,
    createdAt: new Date().toISOString(),
  };
}

