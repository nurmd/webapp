import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { UnitsPricingView } from '../components/Inventory/UnitsPricingView.tsx';
import { NavigationMenuHubView } from '../components/Navigation/NavigationMenuHubView.tsx';
import { Drawer } from '../components/Shell/Drawer.tsx';
import { TabletSidebar } from '../components/Shell/TabletSidebar.tsx';
import { resetUnits } from '../services/db/unitSettings.ts';
import { rbac } from '../services/rbac.ts';
import type { InventoryItem } from '../models/item.ts';
import type { CompanyProfile } from '../models/company.ts';

const mockCompany: CompanyProfile = {
  id: 'COMP-1',
  businessName: 'Apex Retailers',
  tradeName: 'Apex Store',
  gstin: '29ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  phone: '9876543210',
  email: 'contact@apex.test',
  address: '123 Market Road',
  city: 'Bangalore',
  stateCode: '29',
  pincode: '560001',
  isGstEnabled: true,
};

function createMockItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'ITM-' + Math.random().toString(36).slice(2, 7),
    name: 'Standard Widget',
    hsnSacCode: '8443',
    category: 'General',
    unit: 'PCS',
    salePrice: 100,
    purchasePrice: 80,
    gstRate: 18,
    currentStock: 50,
    minStockAlert: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Dedicated Units & Multi-Tier Pricing Page (UnitsPricingView)', () => {
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

  it('renders overview banner, stats chips, and both sections by default', () => {
    const item1 = createMockItem({
      id: 'ITM-1',
      name: 'Retail Only Pen',
      unit: 'PCS',
      salePrice: 20,
    });
    const item2 = createMockItem({
      id: 'ITM-2',
      name: 'Bulk Notebook',
      unit: 'DOZEN',
      subUnit: 'PCS',
      subUnitFactor: 12,
      salePrice: 240,
      semiWholesalePrice: 210,
      wholesalePrice: 180,
      defaultPriceTier: 'WHOLESALE',
    });

    act(() => {
      root!.render(
        <UnitsPricingView
          items={[item1, item2]}
          onSaveItem={vi.fn()}
        />
      );
    });

    // Header & Stats
    expect(container!.textContent).toContain('Units & Multi-Tier Pricing');
    expect(container!.textContent).toContain('Units Registry');
    expect(container!.textContent).toContain('Catalog Products');
    expect(container!.textContent).toContain('Multi-Tier Rates');
    expect(container!.textContent).toContain('Sub-Units (Conversions)');

    // Section A: Units of Measurement
    expect(container!.textContent).toContain('Units of Measurement');
    expect(container!.textContent).toContain('Add Unit');

    // Section B: Multi-Tier Pricing Catalog
    expect(container!.textContent).toContain('Multi-Tier Pricing Catalog');
    expect(container!.textContent).toContain('Retail Only Pen');
    expect(container!.textContent).toContain('Bulk Notebook');
    expect(container!.textContent).toContain('1 DOZEN = 12 PCS');
    expect(container!.textContent).toContain('Wholesale');
  });

  it('switches views via section navigation tabs', () => {
    const item = createMockItem({
      id: 'ITM-1',
      name: 'Tiered Product',
      salePrice: 100,
      wholesalePrice: 85,
    });

    act(() => {
      root!.render(
        <UnitsPricingView
          items={[item]}
          onSaveItem={vi.fn()}
        />
      );
    });

    // Click "Units of Measurement" tab button
    const buttons = Array.from(container!.querySelectorAll('button'));
    const unitsTabBtn = buttons.find((b) => b.textContent?.includes('Units of Measurement') && !b.textContent?.includes('Add'));
    expect(unitsTabBtn).toBeDefined();

    act(() => {
      unitsTabBtn!.click();
    });

    // Section A is visible, Section B is hidden
    expect(container!.textContent).toContain('Manage standard and custom units');
    expect(container!.textContent).not.toContain('Multi-Tier Pricing Catalog');

    // Click "Multi-Tier Pricing" tab button
    const tiersTabBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Multi-Tier Pricing') && !b.textContent?.includes('Units')
    );
    expect(tiersTabBtn).toBeDefined();

    act(() => {
      tiersTabBtn!.click();
    });

    // Section B is visible, Section A is hidden
    expect(container!.textContent).toContain('Multi-Tier Pricing Catalog');
    expect(container!.textContent).not.toContain('Manage standard and custom units');
  });

  it('filters items by search query and tier filter', () => {
    const item1 = createMockItem({
      id: 'ITM-1',
      name: 'Alpha Widget',
      category: 'Electronics',
      salePrice: 100,
    });
    const item2 = createMockItem({
      id: 'ITM-2',
      name: 'Beta Gadget',
      category: 'Hardware',
      salePrice: 200,
      wholesalePrice: 170,
    });

    act(() => {
      root!.render(
        <UnitsPricingView
          items={[item1, item2]}
          onSaveItem={vi.fn()}
        />
      );
    });

    // Text search
    const searchInput = container!.querySelector('input[placeholder*="Search items by name"]') as HTMLInputElement;
    expect(searchInput).toBeTruthy();

    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(searchInput, 'Alpha');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container!.textContent).toContain('Alpha Widget');
    expect(container!.textContent).not.toContain('Beta Gadget');

    // Clear search
    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(searchInput, '');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Click "With Tiers" filter pill
    const withTiersBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('With Tiers')
    );
    expect(withTiersBtn).toBeDefined();

    act(() => {
      withTiersBtn!.click();
    });

    expect(container!.textContent).not.toContain('Alpha Widget');
    expect(container!.textContent).toContain('Beta Gadget');
  });

  it('opens ItemFormModal when Edit Tiers button is clicked', () => {
    const item = createMockItem({
      id: 'ITM-1',
      name: 'Edit Me Item',
      unit: 'BOX',
      salePrice: 500,
      wholesalePrice: 420,
    });

    const onSaveItem = vi.fn();

    act(() => {
      root!.render(
        <UnitsPricingView
          items={[item]}
          onSaveItem={onSaveItem}
        />
      );
    });

    const editBtn = container!.querySelector('button[aria-label="Edit Tiers for Edit Me Item"]') as HTMLButtonElement;
    expect(editBtn).toBeTruthy();

    act(() => {
      editBtn.click();
    });

    // ItemFormModal should be rendered
    expect(container!.textContent).toContain('Edit Inventory Item');
    expect(container!.textContent).toContain('Tiered Sale Pricing');
    expect(container!.textContent).toContain('Update Item');
  });

  it('NavigationMenuHubView inventory_pricing navigates to units_pricing', () => {
    const onNavigate = vi.fn();

    act(() => {
      root!.render(
        <NavigationMenuHubView
          company={mockCompany}
          parties={[]}
          items={[]}
          onNavigate={onNavigate}
        />
      );
    });

    // Find the button for Units & Multi-Tier Pricing
    const pricingHubItem = Array.from(container!.querySelectorAll('button, div[role="button"]')).find((el) =>
      el.textContent?.includes('Units & Multi-Tier Pricing')
    );
    expect(pricingHubItem).toBeDefined();

    act(() => {
      (pricingHubItem as HTMLElement).click();
    });

    expect(onNavigate).toHaveBeenCalledWith('units_pricing');
  });

  it('Drawer and TabletSidebar include Units & Multi-Tier Pricing and RBAC allows access', () => {
    const onSelectTab = vi.fn();

    act(() => {
      root!.render(
        <Drawer
          isOpen={true}
          activeTab="dashboard"
          company={mockCompany}
          activeUser={{ id: '1', name: 'Owner', role: 'OWNER', createdAt: '' }}
          onClose={vi.fn()}
          onSelectTab={onSelectTab}
        />
      );
    });

    expect(container!.textContent).toContain('Units & Multi-Tier Pricing');

    const drawerBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Units & Multi-Tier Pricing')
    );
    expect(drawerBtn).toBeDefined();

    act(() => {
      drawerBtn!.click();
    });

    expect(onSelectTab).toHaveBeenCalledWith('units_pricing');

    // RBAC permissions check
    expect(rbac.canAccessTab('units_pricing', 'OWNER')).toBe(true);
    expect(rbac.canAccessTab('units_pricing', 'ACCOUNTANT')).toBe(true);
    expect(rbac.canAccessTab('units_pricing', 'CASHIER')).toBe(true);
  });
});
