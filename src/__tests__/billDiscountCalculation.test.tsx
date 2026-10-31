// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { BillDiscountModal } from '../components/Common/Billing/BillDiscountModal.tsx';
import { calculateInvoice } from '../core/gst/calculator.ts';

const changeInput = (input: HTMLInputElement, value: string) => {
  const tracker = (input as any)._valueTracker;
  if (tracker) {
    tracker.setValue(value === '0' ? '1' : '0');
  }
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('BillDiscountModal & Overall Discount Calculations', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('converts entered flat discount amount to percent using pre-overall-discount taxableBaseAmount', async () => {
    const handleApply = vi.fn();
    const handleClose = vi.fn();

    // Taxable base before overall discount: 1000
    await act(async () => {
      root.render(
        <BillDiscountModal
          isOpen={true}
          overallDiscountPercent={0}
          overallDiscountAmount={0}
          taxableBaseAmount={1000}
          onApplyDiscountPercent={handleApply}
          onClose={handleClose}
        />
      );
    });

    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    expect(inputs.length).toBe(2);
    // inputs[0] is Discount (%), inputs[1] is Discount (₹)
    const amountInput = inputs[1];

    await act(async () => {
      changeInput(amountInput, '100');
    });

    // 100 / 1000 = 10%
    expect(handleApply).toHaveBeenCalledWith(10);
  });

  it('keeps accurate percent conversion when overall discount is already active', async () => {
    const handleApply = vi.fn();
    const handleClose = vi.fn();

    // Taxable base BEFORE overall discount is 1000.
    // If buggy post-discount totalTaxableAmount (900) were passed, 150 would convert to 16.67%.
    // With preOverallDiscountTaxableAmount (1000), 150 converts cleanly to 15.00%.
    await act(async () => {
      root.render(
        <BillDiscountModal
          isOpen={true}
          overallDiscountPercent={10}
          overallDiscountAmount={100}
          taxableBaseAmount={1000}
          onApplyDiscountPercent={handleApply}
          onClose={handleClose}
        />
      );
    });

    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    const amountInput = inputs[1];

    await act(async () => {
      changeInput(amountInput, '150');
    });

    // 150 / 1000 = 15%
    expect(handleApply).toHaveBeenCalledWith(15);
  });

  it('preserves user amount input without overwriting when parent passes recomputed overallDiscountAmount', async () => {
    let currentPercent = 0;
    let currentAmount = 0;
    const taxableBase = 300;

    const Wrapper = () => {
      const [pct, setPct] = React.useState(currentPercent);
      const [amt, setAmt] = React.useState(currentAmount);

      return (
        <BillDiscountModal
          isOpen={true}
          overallDiscountPercent={pct}
          overallDiscountAmount={amt}
          taxableBaseAmount={taxableBase}
          onApplyDiscountPercent={(newPct) => {
            currentPercent = newPct;
            // 300 * 16.67% = 50.01
            currentAmount = Number(((taxableBase * newPct) / 100).toFixed(2));
            setPct(newPct);
            setAmt(currentAmount);
          }}
          onClose={vi.fn()}
        />
      );
    };

    await act(async () => {
      root.render(<Wrapper />);
    });

    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    const amountInput = inputs[1];

    // User types "50"
    await act(async () => {
      changeInput(amountInput, '50');
    });

    // Parent recomputed overallDiscountAmount is 50.01, but input value must stay "50"
    expect(currentPercent).toBe(16.67);
    expect(currentAmount).toBe(50.01);
    expect(amountInput.value).toBe('50');
  });

  it('syncs amount draft when preset buttons or percent input change externally', async () => {
    let currentPercent = 0;
    let currentAmount = 0;
    const taxableBase = 1000;

    const Wrapper = () => {
      const [pct, setPct] = React.useState(currentPercent);
      const [amt, setAmt] = React.useState(currentAmount);

      return (
        <BillDiscountModal
          isOpen={true}
          overallDiscountPercent={pct}
          overallDiscountAmount={amt}
          taxableBaseAmount={taxableBase}
          onApplyDiscountPercent={(newPct) => {
            currentPercent = newPct;
            currentAmount = Number(((taxableBase * newPct) / 100).toFixed(2));
            setPct(newPct);
            setAmt(currentAmount);
          }}
          onClose={vi.fn()}
        />
      );
    };

    await act(async () => {
      root.render(<Wrapper />);
    });

    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    const percentInput = inputs[0];
    const amountInput = inputs[1];

    // Click 10% preset button
    const presetButtons = container.querySelectorAll<HTMLButtonElement>('button[type="button"]');
    const btn10 = Array.from(presetButtons).find((b) => b.textContent?.trim() === '10%');
    expect(btn10).toBeDefined();

    await act(async () => {
      btn10!.click();
    });

    expect(currentPercent).toBe(10);
    expect(currentAmount).toBe(100);
    expect(amountInput.value).toBe('100');

    // Change percent input to 20%
    await act(async () => {
      changeInput(percentInput, '20');
    });

    expect(currentPercent).toBe(20);
    expect(currentAmount).toBe(200);
    expect(amountInput.value).toBe('200');
  });

  it('compounds item-level discount and overall discount correctly in calculateInvoice', () => {
    // 1 item: qty 2, price 500, gross = 1000
    // Item discount = 10%
    // Overall discount = 10%
    // Combined discount = 100 * (1 - (1 - 0.1) * (1 - 0.1)) = 19%
    const itemDisc = 10;
    const overallDiscountPercent = 10;
    const combinedDisc = Number((100 * (1 - (1 - itemDisc / 100) * (1 - overallDiscountPercent / 100))).toFixed(4));
    expect(combinedDisc).toBe(19);

    const inputs = [
      {
        quantity: 2,
        unitPrice: 500,
        priceMode: 'EXCLUSIVE' as const,
        discountPercent: combinedDisc,
        discountAmount: undefined,
        gstRate: 18,
      },
    ];

    const summary = calculateInvoice('27', '27', inputs);
    // Gross: 1000
    // Discount: 19% of 1000 = 190
    // Taxable: 810
    // GST 18%: 145.8 (CGST 72.9, SGST 72.9)
    // Net: 955.8
    expect(summary.totalGrossAmount).toBe(1000);
    expect(summary.totalDiscount).toBe(190);
    expect(summary.totalTaxableAmount).toBe(810);
    expect(summary.totalTax).toBe(145.8);
    expect(summary.totalCgst).toBe(72.9);
    expect(summary.totalSgst).toBe(72.9);
    expect(summary.netAmount).toBe(955.8);
  });
});
