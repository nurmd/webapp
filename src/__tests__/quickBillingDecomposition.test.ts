import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { usePosCart } from '../components/POS/quickBilling/usePosCart.ts';
import { usePosCatalog } from '../components/POS/quickBilling/usePosCatalog.ts';
import { useHeldBills } from '../components/POS/quickBilling/useHeldBills.ts';
import { usePosTotals } from '../components/POS/quickBilling/usePosTotals.ts';

describe('Phase 2.3a — QuickBillingView Decomposition Guard', () => {
  const rootDir = path.resolve(__dirname, '..');
  const quickBillingViewPath = path.join(rootDir, 'components/POS/QuickBillingView.tsx');
  const hooksDir = path.join(rootDir, 'components/POS/quickBilling');

  it('asserts the four hook files exist and export their respective hooks', () => {
    const hookFiles = [
      'usePosCart.ts',
      'usePosCatalog.ts',
      'useHeldBills.ts',
      'usePosTotals.ts',
    ];

    for (const file of hookFiles) {
      const fullPath = path.join(hooksDir, file);
      expect(fs.existsSync(fullPath), `Expected ${file} to exist under ${hooksDir}`).toBe(true);
    }

    expect(typeof usePosCart).toBe('function');
    expect(typeof usePosCatalog).toBe('function');
    expect(typeof useHeldBills).toBe('function');
    expect(typeof usePosTotals).toBe('function');
  });

  it('asserts QuickBillingView.tsx imports all four decomposed hooks', () => {
    const content = fs.readFileSync(quickBillingViewPath, 'utf8');

    expect(content).toMatch(/import\s*\{\s*usePosCart\s*\}\s*from\s*['"]\.\/quickBilling\/usePosCart(\.ts)?['"]/);
    expect(content).toMatch(/import\s*\{\s*usePosCatalog\s*\}\s*from\s*['"]\.\/quickBilling\/usePosCatalog(\.ts)?['"]/);
    expect(content).toMatch(/import\s*\{\s*useHeldBills\s*\}\s*from\s*['"]\.\/quickBilling\/useHeldBills(\.ts)?['"]/);
    expect(content).toMatch(/import\s*\{\s*usePosTotals\s*\}\s*from\s*['"]\.\/quickBilling\/usePosTotals(\.ts)?['"]/);
  });

  it('asserts QuickBillingView.tsx no longer contains useState<PosCartItem[]> or inline filteredItems useMemo', () => {
    const content = fs.readFileSync(quickBillingViewPath, 'utf8');

    expect(content).not.toContain('useState<PosCartItem[]>');
    expect(content).not.toMatch(/const\s+filteredItems\s*=\s*useMemo\s*\(/);
  });

  it('asserts QuickBillingView.tsx line count is strictly under 1400 lines', () => {
    const content = fs.readFileSync(quickBillingViewPath, 'utf8');
    const lineCount = content.split('\n').length;

    expect(lineCount).toBeLessThan(1400);
    // Baseline check that it is within a valid non-empty range
    expect(lineCount).toBeGreaterThan(500);
  });
});
