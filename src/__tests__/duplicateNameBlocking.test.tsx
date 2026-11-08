import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ItemFormModal } from '../components/Inventory/ItemFormModal.tsx';
import { AddEditPartyModal } from '../components/Parties/AddEditPartyModal.tsx';
import type { InventoryItem } from '../models/item.ts';
import type { Party } from '../models/party.ts';

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Duplicate Name Blocking UI Specification', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  describe('ItemFormModal UI blocking', () => {
    const existingItem: InventoryItem = {
      id: 'itm-oil-1',
      name: 'Fortune Mustard Oil 1L',
      sku: 'SKU-OIL-1',
      unit: 'PCS',
      category: 'Oil',
      salePrice: 160,
      purchasePrice: 130,
      gstRate: 5,
      hsnSacCode: '1508',
      currentStock: 25,
      minStockAlert: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('disables submit button and prevents onSaveItem from being called when name is a duplicate', async () => {
      const onSaveItem = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <ItemFormModal
            isOpen={true}
            editingItem={null}
            onSaveItem={onSaveItem}
            onClose={onClose}
            existingItems={[existingItem]}
          />
        );
      });

      const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
      expect(nameInput).toBeTruthy();

      // Enter exact duplicate name with whitespace variations
      await act(async () => {
        setNativeInputValue(nameInput, '  fortune   mustard   oil   1L  ');
      });

      // Submit button must be disabled
      const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn).toBeTruthy();
      expect(submitBtn.disabled).toBe(true);

      // Warning message should be visible
      expect(container.textContent).toContain('An item with this name already exists in inventory');

      // Attempt form submission
      const form = container.querySelector('form') as HTMLFormElement;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      // Assert callbacks were NOT called
      expect(onSaveItem).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();

      // Type a unique name
      await act(async () => {
        setNativeInputValue(nameInput, 'Fortune Sunflower Oil 1L');
      });

      expect(submitBtn.disabled).toBe(false);
      expect(container.textContent).not.toContain('An item with this name already exists in inventory');

      // Submit valid form
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(onSaveItem).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps submit button enabled and allows saving when editing an existing item whose name collides with another record (legacy duplicate)', async () => {
      const legacyItem1: InventoryItem = {
        ...existingItem,
        id: 'itm-oil-legacy-1',
        name: 'Fortune Mustard Oil 1L',
        salePrice: 150,
      };
      const legacyItem2: InventoryItem = {
        ...existingItem,
        id: 'itm-oil-legacy-2',
        name: 'Fortune Mustard Oil 1L',
        salePrice: 160,
      };

      const onSaveItem = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <ItemFormModal
            isOpen={true}
            editingItem={legacyItem1}
            onSaveItem={onSaveItem}
            onClose={onClose}
            existingItems={[legacyItem1, legacyItem2]}
          />
        );
      });

      // Submit button should be enabled
      const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn).toBeTruthy();
      expect(submitBtn.disabled).toBe(false);

      // Warning message should NOT be visible
      expect(container.textContent).not.toContain('An item with this name already exists in inventory');

      // Submit form
      const form = container.querySelector('form') as HTMLFormElement;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(onSaveItem).toHaveBeenCalledTimes(1);
      expect(onSaveItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'itm-oil-legacy-1',
          name: 'Fortune Mustard Oil 1L',
        })
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('AddEditPartyModal UI blocking', () => {
    const existingParty: Party = {
      id: 'pty-gupta-1',
      name: 'Gupta Enterprises',
      type: 'CUSTOMER',
      phone: '9811002200',
      billingAddress: 'Delhi',
      stateCode: '07',
      currentBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('disables Save Party button, shows blocking error, and prevents onSave when duplicate party name is typed', async () => {
      const onSave = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <AddEditPartyModal
            isOpen={true}
            editingParty={null}
            onClose={onClose}
            onSave={onSave}
            parties={[existingParty]}
          />
        );
      });

      const nameInput = container.querySelector('input[placeholder*="Ramesh Hardware"]') as HTMLInputElement;
      expect(nameInput).toBeTruthy();

      // Enter duplicate party name
      await act(async () => {
        setNativeInputValue(nameInput, '  gupta   enterprises  ');
      });

      // Save Party button must be disabled
      const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn).toBeTruthy();
      expect(submitBtn.disabled).toBe(true);

      // Error message is displayed
      expect(container.textContent).toContain('Another party Gupta Enterprises already exists with this name.');

      // Attempt to submit
      const form = container.querySelector('form') as HTMLFormElement;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(onSave).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();

      // Clear duplicate by changing name
      await act(async () => {
        setNativeInputValue(nameInput, 'Gupta Electricals');
      });

      expect(submitBtn.disabled).toBe(false);
      expect(container.textContent).not.toContain('already exists with this name');

      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps Save Party button enabled and allows saving when editing an existing party whose name collides with another record (legacy duplicate)', async () => {
      const legacyParty1: Party = {
        ...existingParty,
        id: 'pty-gupta-legacy-1',
        name: 'Gupta Enterprises',
        phone: '9811002201',
      };
      const legacyParty2: Party = {
        ...existingParty,
        id: 'pty-gupta-legacy-2',
        name: 'Gupta Enterprises',
        phone: '9811002202',
      };

      const onSave = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          <AddEditPartyModal
            isOpen={true}
            editingParty={legacyParty1}
            onClose={onClose}
            onSave={onSave}
            parties={[legacyParty1, legacyParty2]}
          />
        );
      });

      const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn).toBeTruthy();
      expect(submitBtn.disabled).toBe(false);

      expect(container.textContent).not.toContain('already exists with this name');

      const form = container.querySelector('form') as HTMLFormElement;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pty-gupta-legacy-1',
          name: 'Gupta Enterprises',
        })
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
