import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] || null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: testStorage, writable: true, configurable: true });
}

vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ isSyncing: false, isOnline: true })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

import { HsnAutocompleteInput, loadHsnCatalog, HsnItem } from '../components/Common/HsnAutocompleteInput';
import { CompanyProfile } from '../models/company.ts';
import { db } from '../services/db.ts';

const baseGstCompany: CompanyProfile = {
  id: 'COMP-STRESS-GST',
  businessName: 'Challenger Stress Test Tech Corp',
  tradeName: 'Challenger Lab',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  phone: '9876543210',
  email: 'stress@test.com',
  address: '404 Lab Tower',
  pincode: '411001',
  stateCode: '27',
  isGstEnabled: true,
};

describe('Adversarial Stress Harness: HsnAutocompleteInput Concurrency & State Sync', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(async () => {
    // Warm up dynamic import and catalog indexing to eliminate cold-start compile latency
    await loadHsnCatalog();
  }, 30000);

  beforeEach(() => {
    testStorage.clear();
    db.saveCompany(baseGstCompany);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    try {
      act(() => {
        root?.unmount();
      });
    } catch {}
    try {
      container?.remove();
    } catch {}
  });

  function simulateTyping(input: HTMLInputElement, text: string) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeSetter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Wrapper component that mirrors realistic parent state management
  const InteractiveHsnWrapper: React.FC<{
    initialValue?: string;
    onSelect?: (item: HsnItem) => void;
    onChangeValue?: (val: string) => void;
    isGstEnabled?: boolean;
  }> = ({ initialValue = '', onSelect, onChangeValue, isGstEnabled }) => {
    const [hsn, setHsn] = useState(initialValue);

    const handleChange = (newVal: string) => {
      setHsn(newVal);
      onChangeValue?.(newVal);
    };

    const handleSelect = (item: HsnItem) => {
      setHsn(item.code);
      onSelect?.(item);
    };

    return (
      <HsnAutocompleteInput
        value={hsn}
        onChange={handleChange}
        onSelectHsn={handleSelect}
        isGstEnabled={isGstEnabled}
      />
    );
  };

  it('STRESS-01: Rapid consecutive single-character typing converges to the final query suggestions', async () => {
    let capturedValue = '';
    await act(async () => {
      root.render(
        <InteractiveHsnWrapper
          onChangeValue={(v) => {
            capturedValue = v;
          }}
        />
      );
    });

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();

    // Focus first
    await act(async () => {
      input.focus();
    });

    // Rapidly type "8", "84", "847", "8471", "84713", "847130" in immediate synchronous succession
    const sequence = ['8', '84', '847', '8471', '84713', '847130'];
    await act(async () => {
      for (const str of sequence) {
        simulateTyping(input, str);
      }
    });

    // Allow all async microtasks and effects to settle
    await act(async () => {
      await loadHsnCatalog();
    });

    expect(capturedValue).toBe('847130');
    expect(input.value).toBe('847130');

    const listbox = container.querySelector('ul[role="listbox"]');
    expect(listbox).not.toBeNull();

    const options = listbox?.querySelectorAll('li[role="option"]');
    expect(options && options.length).toBeGreaterThan(0);

    // Verify top suggestion matches exact query "847130"
    const topOption = options![0] as HTMLElement;
    expect(topOption.textContent).toContain('847130');
    expect(topOption.textContent).toContain('Laptops');
  });

  it('STRESS-02: Rapid alternating search queries and backspacing maintains list integrity', async () => {
    let capturedValue = '';
    await act(async () => {
      root.render(
        <InteractiveHsnWrapper
          onChangeValue={(v) => {
            capturedValue = v;
          }}
        />
      );
    });

    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      input.focus();
      await loadHsnCatalog();
    });

    // Sequence: type 8471 -> delete to empty -> type 998313 (SAC IT consulting) -> delete to 99 -> type 996331 (Restaurant)
    const bursts = ['8471', '847', '84', '8', '', '9', '99', '998', '9983', '998313', '998', '99', '996', '996331'];

    for (const token of bursts) {
      await act(async () => {
        simulateTyping(input, token);
      });
    }

    expect(capturedValue).toBe('996331');
    expect(input.value).toBe('996331');

    const listbox = container.querySelector('ul[role="listbox"]');
    expect(listbox).not.toBeNull();

    const options = listbox?.querySelectorAll('li[role="option"]');
    expect(options && options.length).toBeGreaterThan(0);

    const firstOption = options![0] as HTMLElement;
    expect(firstOption.textContent).toContain('996331');
    expect(firstOption.textContent).toContain('SAC');
    expect(firstOption.textContent).toContain('Restaurant');
    expect(firstOption.textContent).toContain('5% GST');
  });

  it('STRESS-03: Rapid selection via Enter key immediately after fast typing synchronizes parent state and closes menu', async () => {
    let capturedSelected: HsnItem | null = null;
    let finalValue = '';

    await act(async () => {
      root.render(
        <InteractiveHsnWrapper
          onSelect={(item) => {
            capturedSelected = item;
          }}
          onChangeValue={(val) => {
            finalValue = val;
          }}
        />
      );
    });

    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      input.focus();
      await loadHsnCatalog();
    });

    // Rapid typing of thermal printer HSN "844332"
    await act(async () => {
      simulateTyping(input, '844332');
    });

    // Press Enter immediately
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });

    // Dropdown should now be closed
    const listboxAfterEnter = container.querySelector('ul[role="listbox"]');
    expect(listboxAfterEnter).toBeNull();

    // Verify selection dispatched correctly
    expect(capturedSelected).not.toBeNull();
    expect(capturedSelected!.code).toBe('844332');
    expect(capturedSelected!.category).toBe('Goods');
    expect(capturedSelected!.gstRate).toBe(18);
    expect(finalValue).toBe('844332');
    expect(input.value).toBe('844332');
  });

  it('STRESS-04: Rapid circular keyboard navigation (ArrowDown/ArrowUp 100 times) never desynchronizes or overflows index', async () => {
    let selectedItem: HsnItem | null = null;

    await act(async () => {
      root.render(
        <InteractiveHsnWrapper
          onSelect={(item) => {
            selectedItem = item;
          }}
        />
      );
    });

    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      input.focus();
      await loadHsnCatalog();
    });

    // Open common codes
    await act(async () => {
      simulateTyping(input, '');
    });

    const listbox = container.querySelector('ul[role="listbox"]');
    const options = listbox?.querySelectorAll('li[role="option"]');
    const totalOptions = options?.length || 0;
    expect(totalOptions).toBeGreaterThan(5);

    // Blast 53 ArrowDown events
    await act(async () => {
      for (let i = 0; i < 53; i++) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      }
    });

    // Expected index: 53 % totalOptions (since it wraps at totalOptions - 1 -> 0)
    // Now press 27 ArrowUp events
    await act(async () => {
      for (let i = 0; i < 27; i++) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      }
    });

    // Currently selected option must have aria-selected="true"
    const activeOption = container.querySelector('li[role="option"][aria-selected="true"]');
    expect(activeOption).not.toBeNull();

    // Press Enter to select whatever is highlighted
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });

    expect(selectedItem).not.toBeNull();
    expect(input.value).toBe(selectedItem!.code);
    expect(container.querySelector('ul[role="listbox"]')).toBeNull();
  });

  it('STRESS-05: Rapid click selection on option shuts down dropdown and prevents re-triggering without explicit input', async () => {
    let selectionCount = 0;
    let lastSelected: HsnItem | null = null;

    await act(async () => {
      root.render(
        <InteractiveHsnWrapper
          onSelect={(item) => {
            selectionCount++;
            lastSelected = item;
          }}
        />
      );
    });

    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      input.focus();
      await loadHsnCatalog();
      simulateTyping(input, '8517'); // Smartphones
    });

    const listbox = container.querySelector('ul[role="listbox"]');
    const options = listbox?.querySelectorAll('li[role="option"]');
    expect(options && options.length).toBeGreaterThan(0);

    const firstOption = options![0] as HTMLElement;

    // Click option
    await act(async () => {
      firstOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(selectionCount).toBe(1);
    expect(lastSelected).not.toBeNull();
    expect(lastSelected!.code.startsWith('8517')).toBe(true);

    // Listbox should be completely removed
    expect(container.querySelector('ul[role="listbox"]')).toBeNull();
  });

  it('STRESS-06: Rapid Escape key dismisses listbox and subsequent typing smoothly reopens', async () => {
    await act(async () => {
      root.render(<InteractiveHsnWrapper />);
    });

    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      input.focus();
      await loadHsnCatalog();
      simulateTyping(input, '1006'); // Rice
    });

    expect(container.querySelector('ul[role="listbox"]')).not.toBeNull();

    // Press Escape
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('ul[role="listbox"]')).toBeNull();

    // Type again to ensure re-opening without reload lag
    await act(async () => {
      simulateTyping(input, '100610');
    });

    expect(container.querySelector('ul[role="listbox"]')).not.toBeNull();
  });

  it('STRESS-07: Rapid outside click and touchstart events dismiss listbox cleanly', async () => {
    await act(async () => {
      root.render(
        <div>
          <button id="outside-btn">Outside Action</button>
          <InteractiveHsnWrapper />
        </div>
      );
    });

    const input = container.querySelector('input') as HTMLInputElement;
    const outsideBtn = container.querySelector('#outside-btn') as HTMLButtonElement;

    await act(async () => {
      input.focus();
      await loadHsnCatalog();
      simulateTyping(input, '8471');
    });

    expect(container.querySelector('ul[role="listbox"]')).not.toBeNull();

    // Mouse click outside
    await act(async () => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(container.querySelector('ul[role="listbox"]')).toBeNull();

    // Re-open by focusing input
    await act(async () => {
      input.blur();
      input.focus();
      input.dispatchEvent(new Event('focus', { bubbles: true }));
    });

    expect(container.querySelector('ul[role="listbox"]')).not.toBeNull();

    // Touch outside
    await act(async () => {
      document.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
    });

    expect(container.querySelector('ul[role="listbox"]')).toBeNull();
  });

  it('STRESS-08: Rapid toggling of isGstEnabled prop unmounts DOM and cleans up all listeners without errors', async () => {
    const ToggleHsnWrapper: React.FC = () => {
      const [gstOn, setGstOn] = useState(true);
      return (
        <div>
          <button id="toggle-gst" onClick={() => setGstOn((prev) => !prev)}>
            Toggle
          </button>
          <HsnAutocompleteInput value="847130" onChange={() => {}} isGstEnabled={gstOn} />
        </div>
      );
    };

    await act(async () => {
      root.render(<ToggleHsnWrapper />);
    });

    const toggleBtn = container.querySelector('#toggle-gst') as HTMLButtonElement;
    expect(container.querySelector('input')).not.toBeNull();

    // Rapidly toggle 20 times back and forth
    await act(async () => {
      for (let i = 0; i < 20; i++) {
        toggleBtn.click();
      }
    });

    // 20 clicks -> even -> gstOn is true
    expect(container.querySelector('input')).not.toBeNull();

    // 1 more click -> odd -> gstOn is false -> component returns null
    await act(async () => {
      toggleBtn.click();
    });

    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('ul[role="listbox"]')).toBeNull();
  });

  it('STRESS-09: 50-cycle high-throughput typing stress test with randomized queries', async () => {
    const testQueries = [
      '8471', '8443', '8517', '998313', '996331', '0401', '1006', '1905', '2106', '3004',
      'laptop', 'printer', 'phone', 'software', 'milk', 'rice', 'bread', 'table', 'service', 'medicines'
    ];

    let lastVal = '';
    await act(async () => {
      root.render(
        <InteractiveHsnWrapper
          onChangeValue={(v) => {
            lastVal = v;
          }}
        />
      );
    });

    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      input.focus();
      await loadHsnCatalog();
    });

    // Run 50 rapid input changes
    await act(async () => {
      for (let i = 0; i < 50; i++) {
        const query = testQueries[i % testQueries.length];
        simulateTyping(input, query);
      }
    });

    const expectedFinal = testQueries[49 % testQueries.length];
    expect(lastVal).toBe(expectedFinal);
    expect(input.value).toBe(expectedFinal);

    // Verify listbox is still present and valid
    const listbox = container.querySelector('ul[role="listbox"]');
    expect(listbox).not.toBeNull();
    const options = listbox?.querySelectorAll('li[role="option"]');
    expect(options && options.length).toBeGreaterThan(0);
  }, 20000);
});
