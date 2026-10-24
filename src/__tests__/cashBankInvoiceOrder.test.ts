import { describe, expect, it } from 'vitest';
import { computeCashBankSummary } from '../core/accounting/cashBankCalculator.ts';
import type { BankAccount, CashBankTransaction } from '../models/bankAccount.ts';
import type { Invoice } from '../models/invoice.ts';
import type { PurchaseBill } from '../models/purchase.ts';
import type { Expense } from '../models/expense.ts';
import type { Voucher } from '../core/accounting/voucherTypes.ts';

const cashAccount: BankAccount = {
  id: 'ACC_CASH',
  accountName: 'Cash in Hand',
  accountType: 'CASH',
  openingBalance: 0,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

const makeInvoice = (id: string, invoiceNumber: string, date: string, paidAmount: number): Invoice => ({
  id,
  invoiceNumber,
  date,
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: `${date}T10:00:00.000Z`,
  partyId: 'CUSTOM_PARTY',
  partyName: 'Cash Counter Customer',
  partyAddress: '',
  partyStateCode: '18',
  placeOfSupplyStateCode: '18',
  isIntraState: true,
  totalGrossAmount: paidAmount,
  items: [],
  subTotal: paidAmount,
  totalDiscount: 0,
  totalTaxableAmount: paidAmount,
  totalCgst: 0,
  totalSgst: 0,
  totalIgst: 0,
  totalCess: 0,
  totalTax: 0,
  roundOff: 0,
  grandTotal: paidAmount,
  amountInWords: '',
  paidAmount,
  balanceAmount: 0,
  paymentMode: 'CASH',
  paymentStatus: 'PAID',
  invoiceType: 'B2CS',
  paymentSplits: [{ id: `split-${id}`, mode: 'CASH', amount: paidAmount, accountId: 'ACC_CASH', accountName: 'Cash in Hand' }],
} as Invoice);

const receiptVoucher: Voucher = {
  id: 'VCH-RCPT-OLD',
  voucherNumber: 'VCH-RCPT-OLD',
  voucherType: 'RECEIPT',
  date: '2026-10-01',
  referenceNo: 'RCPT-OLD',
  narration: 'Payment received against invoice #INV-OLD',
  entries: [
    { accountId: 'ACC_CASH', accountName: 'Cash in Hand', debit: 1320, credit: 0, narration: 'Payment received via CASH' },
    { accountId: 'CUSTOM_PARTY', accountName: 'Cash Counter Customer', debit: 0, credit: 1320, narration: 'Payment received against invoice #INV-OLD' },
  ],
  totalAmount: 1320,
  createdAt: '2026-10-01T10:00:00.000Z',
} as Voucher;

const run = (invoices: Invoice[]) => computeCashBankSummary({
  accounts: [cashAccount],
  invoices,
  purchases: [] as PurchaseBill[],
  expenses: [] as Expense[],
  vouchers: [receiptVoucher],
  transactions: [] as CashBankTransaction[],
});

describe('computeCashBankSummary invoice ordering', () => {
  it('allocates an older receipt to the older invoice and keeps the newer invoice ledger row', () => {
    const older = makeInvoice('INV-OLD', 'INV-OLD', '2026-10-01', 1320);
    const newer = makeInvoice('INV-NEW', 'INV-NEW', '2026-10-23', 1320);

    const reversed = run([newer, older]);
    const chronological = run([older, newer]);

    for (const summary of [reversed, chronological]) {
      expect(summary.totalCashBalance).toBe(2640);
      expect(summary.ledgerEntries.some((entry) => entry.rawInvoiceId === 'INV-NEW')).toBe(true);
      expect(summary.ledgerEntries.some((entry) => entry.rawInvoiceId === 'INV-OLD' && entry.type === 'SALE')).toBe(false);
    }
  });
});
