import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HsnItem,
  getAllHsnItems,
  getHsnByCode,
  searchHsn,
  COMMON_HSN_CODES,
} from '../core/gst/hsnCatalog';

describe('Phase 2 Task P2-H: Indian GST HSN/SAC Catalog & Autocomplete Suite', () => {
  const allItems = getAllHsnItems();
  const STATUTORY_RATES = new Set([0, 0.1, 0.25, 3, 5, 12, 18, 28]);

  describe('1. Comprehensive Dataset Scale & Taxonomy Constraints', () => {
    it('contains strictly at least 5,000 authentic distinct Indian GST HSN/SAC items', () => {
      expect(allItems.length).toBeGreaterThanOrEqual(5000);
    });

    it('asserts all codes are unique with no duplicate entries', () => {
      const codeSet = new Set<string>();
      for (const item of allItems) {
        expect(codeSet.has(item.code)).toBe(false);
        codeSet.add(item.code);
      }
      expect(codeSet.size).toBe(allItems.length);
    });

    it('asserts every item has non-empty code and trade nomenclature description', () => {
      for (const item of allItems) {
        expect(item.code).toBeTruthy();
        expect(item.code.length).toBeGreaterThanOrEqual(2);
        expect(item.description).toBeTruthy();
        expect(item.description.trim().length).toBeGreaterThan(2);
      }
    });

    it('strictly maps Goods to Chapters 01-98 (excluding reserved Ch 77) and Services to Chapter 99', () => {
      let goodsCount = 0;
      let servicesCount = 0;

      for (const item of allItems) {
        if (item.code.startsWith('99')) {
          expect(item.category).toBe('Services');
          servicesCount++;
        } else {
          expect(item.category).toBe('Goods');
          const chapter = parseInt(item.code.slice(0, 2), 10);
          expect(chapter).toBeGreaterThanOrEqual(1);
          expect(chapter).toBeLessThanOrEqual(98);
          expect(chapter).not.toBe(77); // Chapter 77 is reserved in WCO/Indian tariff
          goodsCount++;
        }
      }

      expect(goodsCount).toBeGreaterThan(4500);
      expect(servicesCount).toBeGreaterThan(200);
    });

    it('verifies coverage across all active goods chapters (Ch 01-98 except Ch 77)', () => {
      const chaptersFound = new Set<number>();
      for (const item of allItems) {
        if (!item.code.startsWith('99')) {
          chaptersFound.add(parseInt(item.code.slice(0, 2), 10));
        }
      }

      // Check all chapters 1 through 98 except 77
      for (let ch = 1; ch <= 98; ch++) {
        if (ch === 77) continue;
        expect(
          chaptersFound.has(ch),
          `Expected Chapter ${ch < 10 ? '0' + ch : ch} to be represented in catalog`
        ).toBe(true);
      }
    });
  });

  describe('2. Indian Statutory GST Rates Compliance', () => {
    it('asserts every catalog item maps exclusively to one of the 8 statutory rates', () => {
      for (const item of allItems) {
        expect(
          STATUTORY_RATES.has(item.gstRate),
          `Invalid rate ${item.gstRate} for HSN ${item.code}`
        ).toBe(true);
      }
    });

    it('verifies representation of special rates (0.1%, 0.25%, 3%) in precious goods (Ch 71)', () => {
      const rate01 = allItems.filter((i) => i.gstRate === 0.1);
      const rate025 = allItems.filter((i) => i.gstRate === 0.25);
      const rate3 = allItems.filter((i) => i.gstRate === 3);

      expect(rate01.length).toBeGreaterThan(0);
      expect(rate025.length).toBeGreaterThan(0);
      expect(rate3.length).toBeGreaterThan(0);

      // Verify they are authentic precious stones/metals lines
      expect(rate01.some((i) => i.code.startsWith('71'))).toBe(true);
      expect(rate025.some((i) => i.code.startsWith('71'))).toBe(true);
      expect(rate3.some((i) => i.code.startsWith('71'))).toBe(true);
    });

    it('verifies common exempt essentials (0%) like fresh milk, salt, unbranded grains', () => {
      const exemptItems = allItems.filter((i) => i.gstRate === 0);
      expect(exemptItems.length).toBeGreaterThan(100);

      const milk = getHsnByCode('0401');
      expect(milk).toBeDefined();
      expect(milk?.gstRate).toBe(0);

      const salt = getHsnByCode('25010010');
      expect(salt).toBeDefined();
      expect(salt?.gstRate).toBe(0);
    });
  });

  describe('3. O(1) Normalized Lookup: getHsnByCode', () => {
    it('retrieves items by exact code in O(1) time', () => {
      const laptop = getHsnByCode('847130');
      expect(laptop).toBeDefined();
      expect(laptop?.code).toBe('847130');
      expect(laptop?.gstRate).toBe(18);
      expect(laptop?.category).toBe('Goods');

      const itConsulting = getHsnByCode('998313');
      expect(itConsulting).toBeDefined();
      expect(itConsulting?.category).toBe('Services');
      expect(itConsulting?.gstRate).toBe(18);
    });

    it('normalizes spaces, dots, and hyphens in the query code', () => {
      const withDots = getHsnByCode('8471.30');
      expect(withDots).toBeDefined();
      expect(withDots?.code).toBe('847130');

      const withSpaces = getHsnByCode('  9983 13  ');
      expect(withSpaces).toBeDefined();
      expect(withSpaces?.code).toBe('998313');

      const withHyphen = getHsnByCode('04-01');
      expect(withHyphen).toBeDefined();
      expect(withHyphen?.code).toBe('0401');
    });

    it('returns undefined for non-existent codes or empty inputs', () => {
      expect(getHsnByCode('')).toBeUndefined();
      expect(getHsnByCode('   ')).toBeUndefined();
      expect(getHsnByCode(undefined)).toBeUndefined();
      expect(getHsnByCode(null)).toBeUndefined();
      expect(getHsnByCode('00000000')).toBeUndefined();
    });

    it('guarantees all 21 COMMON_HSN_CODES are retrievable by code', () => {
      expect(COMMON_HSN_CODES.length).toBe(21);
      for (const common of COMMON_HSN_CODES) {
        const found = getHsnByCode(common.code);
        expect(found).toBeDefined();
        expect(found?.gstRate).toBe(common.gstRate);
      }
    });
  });

  describe('4. High Performance Sub-10ms Search: searchHsn', () => {
    it('executes 100 consecutive searches with sub-10ms average latency', () => {
      const testQueries = [
        '84',
        '8471',
        '8517',
        '9983',
        'rice',
        'cotton',
        'cement',
        'software',
        'laptop',
        'consulting',
        'hospital',
        'gold',
        'pharmaceutical',
        'fertiliser',
        'coffee',
        'tea',
        'sugar',
        'steel',
        'aluminium',
        'vehicle',
      ];

      // Warmup
      searchHsn('8471');

      const start = performance.now();
      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        const query = testQueries[i % testQueries.length];
        const res = searchHsn(query, 20);
        expect(res.length).toBeGreaterThan(0);
      }
      const totalTimeMs = performance.now() - start;
      const avgTimeMs = totalTimeMs / iterations;

      console.log(`Benchmark: 100 searches took ${totalTimeMs.toFixed(2)}ms (${avgTimeMs.toFixed(3)}ms/search)`);
      expect(avgTimeMs).toBeLessThan(10); // Strictly sub-10ms constraint
    });

    it('returns top common codes when query is empty or whitespace', () => {
      const resultsEmpty = searchHsn('');
      expect(resultsEmpty.length).toBe(10);
      expect(resultsEmpty[0].code).toBe(COMMON_HSN_CODES[0].code);

      const resultsWhitespace = searchHsn('   ', 5);
      expect(resultsWhitespace.length).toBe(5);
    });

    it('ranks exact code matches first in search results', () => {
      const results = searchHsn('847130', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].code).toBe('847130');
    });

    it('supports 2-digit chapter prefixes and 4-digit heading prefixes', () => {
      const chapter84 = searchHsn('84', 15);
      expect(chapter84.length).toBe(15);
      for (const item of chapter84) {
        expect(item.code.startsWith('84')).toBe(true);
      }

      const heading1006 = searchHsn('1006', 10);
      expect(heading1006.length).toBeGreaterThan(0);
      expect(heading1006.some((i) => i.code.startsWith('1006'))).toBe(true);
    });

    it('finds items by tokenized case-insensitive description search', () => {
      const results = searchHsn('smartphones', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((i) => i.description.toLowerCase().includes('smartphone'))).toBe(true);

      const mixedCase = searchHsn('ReStAuRaNt', 10);
      expect(mixedCase.length).toBeGreaterThan(0);
      expect(mixedCase.some((i) => i.description.toLowerCase().includes('restaurant'))).toBe(true);
    });
  });

  describe('5. UI Autocomplete Component: HsnAutocompleteInput', () => {
    let container: HTMLDivElement;
    let root: any;

    beforeEach(async () => {
      const { createRoot } = await import('react-dom/client');
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      if (root) {
        root.unmount();
      }
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    });

    it('renders input field with initial value and placeholder', async () => {
      const React = await import('react');
      const { HsnAutocompleteInput } = await import('../components/Common/HsnAutocompleteInput');
      const { act } = await import('react');

      await act(async () => {
        root.render(
          React.createElement(HsnAutocompleteInput, {
            value: '847130',
            onChange: () => {},
            placeholder: 'Search HSN',
          })
        );
      });

      const input = container.querySelector('input') as HTMLInputElement;
      expect(input).toBeDefined();
      expect(input.value).toBe('847130');
      expect(input.placeholder).toBe('Search HSN');
      expect(input.getAttribute('role')).toBe('combobox');
    });

    it('opens suggestions dropdown on focus and filters on change', async () => {
      const React = await import('react');
      const { HsnAutocompleteInput } = await import('../components/Common/HsnAutocompleteInput');
      const { act } = await import('react');

      let currentValue = '';
      let selectedItem: any = null;

      const renderComp = (val: string) => {
        return React.createElement(HsnAutocompleteInput, {
          value: val,
          onChange: (v: string) => {
            currentValue = v;
          },
          onSelectHsn: (item: any) => {
            selectedItem = item;
          },
        });
      };

      await act(async () => {
        root.render(renderComp(''));
      });

      const input = container.querySelector('input') as HTMLInputElement;

      // Focus input
      await act(async () => {
        input.focus();
      });

      const listbox = container.querySelector('ul[role="listbox"]');
      expect(listbox).toBeDefined();

      // Change input to "8471"
      await act(async () => {
        input.value = '8471';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        root.render(renderComp('8471'));
      });

      const updatedListbox = container.querySelector('ul[role="listbox"]');
      expect(updatedListbox).not.toBeNull();
      const options = updatedListbox?.querySelectorAll('li[role="option"]');
      expect(options && options.length).toBeGreaterThan(0);

      // Verify the first option text contains 8471
      const firstOption = options![0] as HTMLElement;
      expect(firstOption.textContent).toContain('8471');

      // Click first option
      await act(async () => {
        firstOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(selectedItem).toBeDefined();
      expect(selectedItem.code.startsWith('8471')).toBe(true);
      expect(selectedItem.gstRate).toBeDefined();
    });

    it('handles keyboard navigation: ArrowDown, ArrowUp, Enter, and Escape', async () => {
      const React = await import('react');
      const { HsnAutocompleteInput } = await import('../components/Common/HsnAutocompleteInput');
      const { act } = await import('react');

      let selectedItem: any = null;

      await act(async () => {
        root.render(
          React.createElement(HsnAutocompleteInput, {
            value: '998311',
            onChange: () => {},
            onSelectHsn: (item: any) => {
              selectedItem = item;
            },
          })
        );
      });

      const input = container.querySelector('input') as HTMLInputElement;

      // Focus
      await act(async () => {
        input.focus();
      });

      // Press ArrowDown
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      });

      const listbox = container.querySelector('ul[role="listbox"]');
      expect(listbox).not.toBeNull();

      // Press Enter to select
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });

      expect(selectedItem).toBeDefined();
      expect(selectedItem.code).toBe('998311');
      expect(selectedItem.gstRate).toBe(18);

      // Focus again then press Escape to close
      await act(async () => {
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(container.querySelector('ul[role="listbox"]')).toBeNull();
    });
  });
});
