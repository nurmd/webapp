import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BottomNav } from '../components/Shell/BottomNav.tsx';
import { resetBackNavigationForTesting } from '../core/utils/backNavigation.ts';

describe('BottomNav Restock Badge & Accessibility Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    resetBackNavigationForTesting();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    resetBackNavigationForTesting();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not render restock badge when restockCount is 0 or omitted', () => {
    act(() => {
      root.render(
        <BottomNav
          activeTab="dashboard"
          onSelectTab={vi.fn()}
          onNewInvoice={vi.fn()}
        />
      );
    });

    const badge = container.querySelector('[data-testid="bottom-nav-restock-badge"]');
    expect(badge).toBeNull();

    const itemsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Items')
    );
    expect(itemsBtn).toBeDefined();
    expect(itemsBtn?.getAttribute('aria-label')).toBe('Items');
  });

  it('renders restock badge with exact count and accessible a11y label when restockCount is 1', () => {
    act(() => {
      root.render(
        <BottomNav
          activeTab="dashboard"
          onSelectTab={vi.fn()}
          onNewInvoice={vi.fn()}
          restockCount={1}
        />
      );
    });

    const badge = container.querySelector('[data-testid="bottom-nav-restock-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('1');

    const itemsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Items')
    );
    expect(itemsBtn).toBeDefined();
    expect(itemsBtn?.getAttribute('aria-label')).toBe('Items, 1 item needs restocking');
  });

  it('renders plural restock count for multiple low-stock items', () => {
    act(() => {
      root.render(
        <BottomNav
          activeTab="dashboard"
          onSelectTab={vi.fn()}
          onNewInvoice={vi.fn()}
          restockCount={12}
        />
      );
    });

    const badge = container.querySelector('[data-testid="bottom-nav-restock-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('12');

    const itemsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Items')
    );
    expect(itemsBtn?.getAttribute('aria-label')).toBe('Items, 12 items need restocking');
  });

  it('caps display at 99+ when restockCount exceeds 99', () => {
    act(() => {
      root.render(
        <BottomNav
          activeTab="dashboard"
          onSelectTab={vi.fn()}
          onNewInvoice={vi.fn()}
          restockCount={150}
        />
      );
    });

    const badge = container.querySelector('[data-testid="bottom-nav-restock-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('99+');

    const itemsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Items')
    );
    expect(itemsBtn?.getAttribute('aria-label')).toBe('Items, 150 items need restocking');
  });

  it('invokes onSelectTab when Items button with badge is clicked', () => {
    const onSelectTab = vi.fn();

    act(() => {
      root.render(
        <BottomNav
          activeTab="dashboard"
          onSelectTab={onSelectTab}
          onNewInvoice={vi.fn()}
          restockCount={5}
        />
      );
    });

    const itemsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Items')
    );
    expect(itemsBtn).toBeDefined();

    act(() => {
      itemsBtn?.click();
    });

    expect(onSelectTab).toHaveBeenCalledWith('inventory');
  });
});
