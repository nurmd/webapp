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

export interface VoucherPaymentSplit {
  id?: string;
  mode: string;
  amount: number;
  accountId?: string;
  referenceNo?: string;
}

/**
 * Generates automated Double-Entry Journal Voucher for a GST Sales Invoice.
 * Supports:
 * - Section 170 CGST Act round-off balancing via ACC_ROUND_OFF
 * - Multi-tender split payment debits (Cash, Bank/UPI, Customer Credit)
 */
export function createSalesInvoiceVoucher(params: {
  invoiceId?: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerId: string;
  taxableAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  cessAmount?: number;
  grandTotal: number;
  isCashSale?: boolean;
  roundOff?: number;
  paymentSplits?: VoucherPaymentSplit[];
}): Voucher {
  const entries: JournalEntryLine[] = [];
  const cgst = params.cgstAmount || 0;
  const sgst = params.sgstAmount || 0;
  const igst = params.igstAmount || 0;
  const cess = params.cessAmount || 0;
  const totalTax = Number((cgst + sgst + igst + cess).toFixed(2));
  const netAmount = Number((params.taxableAmount + totalTax).toFixed(2));

  // Determine round-off delta
  const roundOff =
    params.roundOff !== undefined
      ? Number(params.roundOff.toFixed(2))
      : Number((params.grandTotal - netAmount).toFixed(2));

  // 1. Debits: Cash, Bank, or Customer Accounts (Split Tenders or Single Account)
  const activeSplits = (params.paymentSplits || []).filter((s) => Number(s.amount) > 0);

  if (activeSplits.length > 0) {
    let totalSplitDebit = 0;

    activeSplits.forEach((split) => {
      const splitAmount = Number(split.amount);
      totalSplitDebit = Number((totalSplitDebit + splitAmount).toFixed(2));

      if (split.mode === 'CREDIT') {
        entries.push({
          accountId: params.customerId,
          accountName: params.customerName,
          debit: splitAmount,
          credit: 0,
          narration: `Sales Bill #${params.invoiceNumber} (On Credit)`,
        });
      } else if (split.mode === 'CASH') {
        const accountId = split.accountId || 'ACC_CASH';
        entries.push({
          accountId,
          accountName: 'Cash-in-hand',
          debit: splitAmount,
          credit: 0,
          narration: `Sales Bill #${params.invoiceNumber} (Cash)`,
        });
      } else {
        const accountId = split.accountId || 'ACC_BANK';
        const accountName =
          split.mode === 'UPI'
            ? 'Bank Account (UPI)'
            : split.mode === 'CARD'
            ? 'Bank Account (Card)'
            : 'Bank Account';
        entries.push({
          accountId,
          accountName,
          debit: splitAmount,
          credit: 0,
          narration: `Sales Bill #${params.invoiceNumber} (${split.mode})`,
        });
      }
    });

    // Allocate unassigned remainder to customer receivable if no explicit credit split exists
    const hasCreditSplit = activeSplits.some((s) => s.mode === 'CREDIT');
    const remainingBalance = Number((params.grandTotal - totalSplitDebit).toFixed(2));
    if (remainingBalance > 0 && !hasCreditSplit) {
      entries.push({
        accountId: params.customerId,
        accountName: params.customerName,
        debit: remainingBalance,
        credit: 0,
        narration: `Sales Bill #${params.invoiceNumber} (Balance Due)`,
      });
    }
  } else {
    // Single debit: Cash or Customer Account
    entries.push({
      accountId: params.isCashSale ? 'ACC_CASH' : params.customerId,
      accountName: params.isCashSale ? 'Cash-in-hand' : params.customerName,
      debit: params.grandTotal,
      credit: 0,
      narration: `Sales Bill #${params.invoiceNumber}`,
    });
  }

  // 2. Round-off Debit (when roundOff < 0: discount/expense on sales)
  if (roundOff < 0) {
    entries.push({
      accountId: 'ACC_ROUND_OFF',
      accountName: 'Round Off Account',
      debit: Math.abs(roundOff),
      credit: 0,
      narration: `Round off adjustment for #${params.invoiceNumber}`,
    });
  }

  // 3. Credits: Sales Account (Taxable Value)
  entries.push({
    accountId: 'ACC_SALES',
    accountName: 'GST Sales Account',
    debit: 0,
    credit: params.taxableAmount,
    narration: `Sales Revenue against #${params.invoiceNumber}`,
  });

  // 4. Credits: Output Taxes
  if (cgst > 0) {
    entries.push({
      accountId: 'ACC_OUTPUT_CGST',
      accountName: 'Output CGST Account',
      debit: 0,
      credit: cgst,
    });
  }

  if (sgst > 0) {
    entries.push({
      accountId: 'ACC_OUTPUT_SGST',
      accountName: 'Output SGST Account',
      debit: 0,
      credit: sgst,
    });
  }

  if (igst > 0) {
    entries.push({
      accountId: 'ACC_OUTPUT_IGST',
      accountName: 'Output IGST Account',
      debit: 0,
      credit: igst,
    });
  }

  if (cess > 0) {
    entries.push({
      accountId: 'ACC_OUTPUT_CESS',
      accountName: 'Output GST Cess Account',
      debit: 0,
      credit: cess,
    });
  }

  // 5. Round-off Credit (when roundOff > 0: income on sales)
  if (roundOff > 0) {
    entries.push({
      accountId: 'ACC_ROUND_OFF',
      accountName: 'Round Off Account',
      debit: 0,
      credit: roundOff,
      narration: `Round off adjustment for #${params.invoiceNumber}`,
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
 * Supports:
 * - Section 170 CGST Act round-off balancing via ACC_ROUND_OFF
 * - Multi-tender split payment credits (Cash, Bank/UPI, Supplier Credit)
 */
export function createPurchaseInvoiceVoucher(params: {
  billId?: string;
  billNumber: string;
  date: string;
  supplierName: string;
  supplierId: string;
  taxableAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  cessAmount?: number;
  grandTotal: number;
  isCashPurchase?: boolean;
  roundOff?: number;
  paymentSplits?: VoucherPaymentSplit[];
}): Voucher {
  const entries: JournalEntryLine[] = [];
  const cgst = params.cgstAmount || 0;
  const sgst = params.sgstAmount || 0;
  const igst = params.igstAmount || 0;
  const cess = params.cessAmount || 0;
  const totalTax = Number((cgst + sgst + igst + cess).toFixed(2));
  const netAmount = Number((params.taxableAmount + totalTax).toFixed(2));

  // Determine round-off delta
  const roundOff =
    params.roundOff !== undefined
      ? Number(params.roundOff.toFixed(2))
      : Number((params.grandTotal - netAmount).toFixed(2));

  // 1. Debits: Purchase Account (Taxable Value)
  entries.push({
    accountId: 'ACC_PURCHASE',
    accountName: 'GST Purchase Account',
    debit: params.taxableAmount,
    credit: 0,
    narration: `Purchases against bill #${params.billNumber}`,
  });

  // 2. Debits: Input Taxes (ITC Asset Claims)
  if (cgst > 0) {
    entries.push({
      accountId: 'ACC_INPUT_CGST',
      accountName: 'Input CGST (ITC) Account',
      debit: cgst,
      credit: 0,
    });
  }

  if (sgst > 0) {
    entries.push({
      accountId: 'ACC_INPUT_SGST',
      accountName: 'Input SGST (ITC) Account',
      debit: sgst,
      credit: 0,
    });
  }

  if (igst > 0) {
    entries.push({
      accountId: 'ACC_INPUT_IGST',
      accountName: 'Input IGST (ITC) Account',
      debit: igst,
      credit: 0,
    });
  }

  if (cess > 0) {
    entries.push({
      accountId: 'ACC_INPUT_CESS',
      accountName: 'Input GST Cess (ITC) Account',
      debit: cess,
      credit: 0,
    });
  }

  // 3. Round-off Debit (when roundOff > 0: expense on purchase)
  if (roundOff > 0) {
    entries.push({
      accountId: 'ACC_ROUND_OFF',
      accountName: 'Round Off Account',
      debit: roundOff,
      credit: 0,
      narration: `Round off expense for bill #${params.billNumber}`,
    });
  }

  // 4. Credits: Cash, Bank, or Supplier Accounts (Split Tenders or Single Account)
  const activeSplits = (params.paymentSplits || []).filter((s) => Number(s.amount) > 0);

  if (activeSplits.length > 0) {
    let totalSplitCredit = 0;

    activeSplits.forEach((split) => {
      const splitAmount = Number(split.amount);
      totalSplitCredit = Number((totalSplitCredit + splitAmount).toFixed(2));

      if (split.mode === 'CREDIT') {
        entries.push({
          accountId: params.supplierId,
          accountName: params.supplierName,
          debit: 0,
          credit: splitAmount,
          narration: `Payable for bill #${params.billNumber} (On Credit)`,
        });
      } else if (split.mode === 'CASH') {
        const accountId = split.accountId || 'ACC_CASH';
        entries.push({
          accountId,
          accountName: 'Cash-in-hand',
          debit: 0,
          credit: splitAmount,
          narration: `Paid bill #${params.billNumber} (Cash)`,
        });
      } else {
        const accountId = split.accountId || 'ACC_BANK';
        const accountName =
          split.mode === 'UPI'
            ? 'Bank Account (UPI)'
            : split.mode === 'CARD'
            ? 'Bank Account (Card)'
            : 'Bank Account';
        entries.push({
          accountId,
          accountName,
          debit: 0,
          credit: splitAmount,
          narration: `Paid bill #${params.billNumber} (${split.mode})`,
        });
      }
    });

    // Allocate unassigned remainder to supplier liability if no explicit credit split exists
    const hasCreditSplit = activeSplits.some((s) => s.mode === 'CREDIT');
    const remainingBalance = Number((params.grandTotal - totalSplitCredit).toFixed(2));
    if (remainingBalance > 0 && !hasCreditSplit) {
      entries.push({
        accountId: params.supplierId,
        accountName: params.supplierName,
        debit: 0,
        credit: remainingBalance,
        narration: `Payable for bill #${params.billNumber} (Balance Due)`,
      });
    }
  } else {
    // Single credit: Cash or Supplier Account
    entries.push({
      accountId: params.isCashPurchase ? 'ACC_CASH' : params.supplierId,
      accountName: params.isCashPurchase ? 'Cash-in-hand' : params.supplierName,
      debit: 0,
      credit: params.grandTotal,
      narration: `Payable for bill #${params.billNumber}`,
    });
  }

  // 5. Round-off Credit (when roundOff < 0: discount/income on purchase)
  if (roundOff < 0) {
    entries.push({
      accountId: 'ACC_ROUND_OFF',
      accountName: 'Round Off Account',
      debit: 0,
      credit: Math.abs(roundOff),
      narration: `Round off income/discount for bill #${params.billNumber}`,
    });
  }

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

/**
 * Generates automated Double-Entry Journal Voucher for Payment Received (Receipt Voucher / Payment In).
 * Debit: Cash/Bank Account
 * Credit: Customer Ledger Account
 */
export function createPaymentReceiptVoucher(params: {
  receiptNumber: string;
  date: string;
  customerName: string;
  customerId: string;
  amount: number;
  paymentMode: string;
  referenceNo?: string;
  narration?: string;
  paymentSplits?: Array<{ mode: string; amount: number; accountId?: string; referenceNo?: string }>;
}): Voucher {
  const activeSplits = (params.paymentSplits || []).filter((s) => s.mode !== 'CREDIT' && s.amount > 0);
  const entries: JournalEntryLine[] = [];

  if (activeSplits.length > 0) {
    activeSplits.forEach((split) => {
      const isCash = split.mode === 'CASH';
      const accountId = split.accountId || (isCash ? 'ACC_CASH' : 'ACC_BANK');
      const accountName = isCash ? 'Cash-in-hand' : 'Bank Account';
      entries.push({
        accountId,
        accountName,
        debit: split.amount,
        credit: 0,
        narration: `Payment received via ${split.mode}`,
      });
    });
  } else {
    const accountId = params.paymentMode === 'CASH' ? 'ACC_CASH' : 'ACC_BANK';
    const accountName = params.paymentMode === 'CASH' ? 'Cash-in-hand' : 'Bank Account';
    entries.push({
      accountId,
      accountName,
      debit: params.amount,
      credit: 0,
      narration: `Payment received via ${params.paymentMode}`,
    });
  }

  entries.push({
    accountId: params.customerId,
    accountName: params.customerName,
    debit: 0,
    credit: params.amount,
    narration: params.narration || `Receipt against dues #${params.receiptNumber}`,
  });

  return {
    id: `VCH-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    voucherNumber: `VCH-RCPT-${params.receiptNumber}`,
    voucherType: 'RECEIPT',
    date: params.date,
    referenceNo: params.referenceNo || params.receiptNumber,
    entries,
    narration: params.narration || `Payment received from ${params.customerName} via ${params.paymentMode}`,
    totalAmount: params.amount,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generates automated Double-Entry Journal Voucher for Payment Made (Payment Out).
 * Debit: Supplier Ledger Account
 * Credit: Cash/Bank Account
 */
export function createPaymentOutVoucher(params: {
  voucherNumber: string;
  date: string;
  supplierName: string;
  supplierId: string;
  amount: number;
  paymentMode: string;
  referenceNo?: string;
  narration?: string;
  paymentSplits?: Array<{ mode: string; amount: number; accountId?: string; referenceNo?: string }>;
}): Voucher {
  const activeSplits = (params.paymentSplits || []).filter((s) => s.mode !== 'CREDIT' && s.amount > 0);
  const entries: JournalEntryLine[] = [
    {
      accountId: params.supplierId,
      accountName: params.supplierName,
      debit: params.amount,
      credit: 0,
      narration: params.narration || `Payment made towards dues #${params.voucherNumber}`,
    },
  ];

  if (activeSplits.length > 0) {
    activeSplits.forEach((split) => {
      const isCash = split.mode === 'CASH';
      const accountId = split.accountId || (isCash ? 'ACC_CASH' : 'ACC_BANK');
      const accountName = isCash ? 'Cash-in-hand' : 'Bank Account';
      entries.push({
        accountId,
        accountName,
        debit: 0,
        credit: split.amount,
        narration: `Paid via ${split.mode}`,
      });
    });
  } else {
    const accountId = params.paymentMode === 'CASH' ? 'ACC_CASH' : 'ACC_BANK';
    const accountName = params.paymentMode === 'CASH' ? 'Cash-in-hand' : 'Bank Account';
    entries.push({
      accountId,
      accountName,
      debit: 0,
      credit: params.amount,
      narration: `Paid via ${params.paymentMode}`,
    });
  }

  return {
    id: `VCH-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    voucherNumber: `VCH-PYMT-${params.voucherNumber}`,
    voucherType: 'PAYMENT',
    date: params.date,
    referenceNo: params.referenceNo || params.voucherNumber,
    entries,
    narration: params.narration || `Payment disbursed to ${params.supplierName} via ${params.paymentMode}`,
    totalAmount: params.amount,
    createdAt: new Date().toISOString(),
  };
}
