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
