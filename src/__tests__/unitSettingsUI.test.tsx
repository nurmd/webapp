import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ItemSettingsTab } from '../components/Settings/ItemSettingsTab.tsx';
import { resetUnits } from '../services/db/unitSettings.ts';
import { db } from '../services/db.ts';

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Units of Measurement Settings UI (Part A2)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    resetUnits();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
  });

  it('renders the Units of Measurement card with seed units and badges', () => {
    act(() => {
      root!.render(
        <ItemSettingsTab
          allowNegativeStock={false}
          onToggleNegativeStock={vi.fn()}
          showBuyPricesGlobally={true}
          onToggleBuyPrices={vi.fn()}
        />
      );
    });

    expect(container!.textContent).toContain('Units of Measurement');
    expect(container!.textContent).toContain('Manage standard and custom units for items and line billing');
    expect(container!.textContent).toContain('13 Units (13 Active)');
    expect(container!.textContent).toContain('PCS');
    expect(container!.textContent).toContain('BOX');
    expect(container!.textContent).toContain('Standard');
    expect(container!.textContent).toContain('Active');
  });

  it('allows adding a new custom unit and displays it with Custom badge', () => {
    act(() => {
      root!.render(
        <ItemSettingsTab
          allowNegativeStock={false}
          onToggleNegativeStock={vi.fn()}
          showBuyPricesGlobally={true}
          onToggleBuyPrices={vi.fn()}
        />
      );
    });

    const codeInput = container!.querySelector('input[placeholder="e.g. DOZEN, BRL"]') as HTMLInputElement;
    const labelInput = container!.querySelector('input[placeholder="e.g. Dozen, Barrels"]') as HTMLInputElement;
    const form = container!.querySelector('form') as HTMLFormElement;

    expect(codeInput).toBeTruthy();
    expect(labelInput).toBeTruthy();
    expect(form).toBeTruthy();

    act(() => {
      setInputValue(codeInput, 'DOZEN');
      setInputValue(labelInput, 'Dozen Pack');
    });

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container!.textContent).toContain('DOZEN');
    expect(container!.textContent).toContain('Dozen Pack');
    expect(container!.textContent).toContain('Custom');
    expect(container!.textContent).toContain('Unit "DOZEN" added successfully.');
  });

  it('shows error when adding a duplicate unit', () => {
    act(() => {
      root!.render(
        <ItemSettingsTab
          allowNegativeStock={false}
          onToggleNegativeStock={vi.fn()}
          showBuyPricesGlobally={true}
          onToggleBuyPrices={vi.fn()}
        />
      );
    });

    const codeInput = container!.querySelector('input[placeholder="e.g. DOZEN, BRL"]') as HTMLInputElement;
    const form = container!.querySelector('form') as HTMLFormElement;

    act(() => {
      setInputValue(codeInput, 'PCS');
    });

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container!.textContent).toContain('already exists');
  });

  it('allows deactivating and reactivating a custom unit', () => {
    db.addUnit('BUNDLE', 'Bundle Pack');

    act(() => {
      root!.render(
        <ItemSettingsTab
          allowNegativeStock={false}
          onToggleNegativeStock={vi.fn()}
          showBuyPricesGlobally={true}
          onToggleBuyPrices={vi.fn()}
        />
      );
    });

    expect(container!.textContent).toContain('BUNDLE');

    const deactivateBtn = container!.querySelector('button[title="Deactivate BUNDLE"]') as HTMLButtonElement;
    expect(deactivateBtn).toBeTruthy();

    act(() => {
      deactivateBtn.click();
    });

    expect(container!.textContent).toContain('Inactive');

    const activateBtn = container!.querySelector('button[title="Reactivate BUNDLE"]') as HTMLButtonElement;
    expect(activateBtn).toBeTruthy();

    act(() => {
      activateBtn.click();
    });

    expect(container!.querySelector('button[title="Deactivate BUNDLE"]')).toBeTruthy();
  });
});
