import { describe, it, expect } from 'vitest';
import {
  createPaymentReceiptVoucher,
  createPaymentOutVoucher,
  validateVoucherBalance,
} from '../core/accounting/ledger.ts';

describe('Payment In / Out Discount Accounting Suite', () => {
  it('TC-DISC-01: createPaymentReceiptVoucher properly posts cash discount allowed', () => {
    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-16',
      customerName: 'Gupta Traders',
      customerId: 'CUST-001',
      amount: 950,
      discount: 50,
      paymentMode: 'CASH',
    });

    expect(voucher.voucherType).toBe('RECEIPT');
    expect(voucher.totalAmount).toBe(1000); // 950 cash + 50 discount

    // Balanced voucher check
    const balance = validateVoucherBalance(voucher.entries);
    expect(balance.isBalanced).toBe(true);
    expect(balance.diff).toBe(0);

    // Entries inspection
    const cashEntry = voucher.entries.find((e) => e.accountId === 'ACC_CASH');
    expect(cashEntry).toBeDefined();
    expect(cashEntry?.debit).toBe(950);
    expect(cashEntry?.credit).toBe(0);

    const discountEntry = voucher.entries.find((e) => e.accountId === 'ACC_EXPENSE_DISCOUNT');
    expect(discountEntry).toBeDefined();
    expect(discountEntry?.accountName).toBe('Discount Allowed');
    expect(discountEntry?.debit).toBe(50);
    expect(discountEntry?.credit).toBe(0);

    const custEntry = voucher.entries.find((e) => e.accountId === 'CUST-001');
    expect(custEntry).toBeDefined();
    expect(custEntry?.debit).toBe(0);
    expect(custEntry?.credit).toBe(1000);
  });

  it('TC-DISC-02: createPaymentOutVoucher properly posts cash discount received', () => {
    const voucher = createPaymentOutVoucher({
      date: '2026-10-16',
      supplierName: 'Sharma Wholesalers',
      supplierId: 'SUPP-001',
      amount: 1900,
      discount: 100,
      paymentMode: 'UPI',
    });

    expect(voucher.voucherType).toBe('PAYMENT');
    expect(voucher.totalAmount).toBe(2000); // 1900 paid + 100 discount

    // Balanced voucher check
    const balance = validateVoucherBalance(voucher.entries);
    expect(balance.isBalanced).toBe(true);
    expect(balance.diff).toBe(0);

    // Supplier entry debited for full settlement
    const suppEntry = voucher.entries.find((e) => e.accountId === 'SUPP-001');
    expect(suppEntry).toBeDefined();
    expect(suppEntry?.debit).toBe(2000);
    expect(suppEntry?.credit).toBe(0);

    // Bank/UPI credited for actual cash flow
    const bankEntry = voucher.entries.find((e) => e.accountId === 'ACC_BANK');
    expect(bankEntry).toBeDefined();
    expect(bankEntry?.debit).toBe(0);
    expect(bankEntry?.credit).toBe(1900);

    // Discount Received credited as indirect income
    const discountEntry = voucher.entries.find((e) => e.accountId === 'ACC_INCOME_DISCOUNT');
    expect(discountEntry).toBeDefined();
    expect(discountEntry?.accountName).toBe('Discount Received');
    expect(discountEntry?.debit).toBe(0);
    expect(discountEntry?.credit).toBe(100);
  });

  it('TC-DISC-03: handles multi-tender split payment with discount allowed', () => {
    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-16',
      customerName: 'Metro Store',
      customerId: 'CUST-002',
      discount: 50,
      paymentSplits: [
        { id: 's1', mode: 'CASH', amount: 400 },
        { id: 's2', mode: 'UPI', amount: 550 },
      ],
    });

    expect(voucher.totalAmount).toBe(1000); // 400 + 550 + 50
    const balance = validateVoucherBalance(voucher.entries);
    expect(balance.isBalanced).toBe(true);

    const cashEntry = voucher.entries.find((e) => e.accountId === 'ACC_CASH');
    expect(cashEntry?.debit).toBe(400);

    const bankEntry = voucher.entries.find((e) => e.accountId === 'ACC_BANK');
    expect(bankEntry?.debit).toBe(550);

    const discEntry = voucher.entries.find((e) => e.accountId === 'ACC_EXPENSE_DISCOUNT');
    expect(discEntry?.debit).toBe(50);

    const custEntry = voucher.entries.find((e) => e.accountId === 'CUST-002');
    expect(custEntry?.credit).toBe(1000);
  });

  it('TC-DISC-04: zero or undefined discount does not create redundant discount lines', () => {
    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-16',
      customerName: 'Standard Customer',
      customerId: 'CUST-003',
      amount: 500,
      discount: 0,
      paymentMode: 'CASH',
    });

    expect(voucher.totalAmount).toBe(500);
    const discEntry = voucher.entries.find((e) => e.accountId === 'ACC_EXPENSE_DISCOUNT');
    expect(discEntry).toBeUndefined();
    expect(voucher.entries.length).toBe(2);
  });
});
