import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

import { DashboardView } from '../components/Dashboard/DashboardView.tsx';
import { SalesHubView } from '../components/Sales/SalesHubView.tsx';
import { PurchasesHubView } from '../components/Purchases/PurchasesHubView.tsx';
import { PartiesView } from '../components/Parties/PartiesView.tsx';
import { InventoryView } from '../components/Inventory/InventoryView.tsx';
import { BusinessReportsView } from '../components/Reports/BusinessReportsView.tsx';
import { CompanySettingsView } from '../components/Settings/CompanySettingsView.tsx';
import { Header } from '../components/Shell/Header.tsx';
import { TabletSidebar } from '../components/Shell/TabletSidebar.tsx';
import { BottomNav } from '../components/Shell/BottomNav.tsx';

describe('Phase 2.5: View Memoization & App Prop Stability', () => {
  const memoizedViews = [
    { name: 'DashboardView', file: 'src/components/Dashboard/DashboardView.tsx', component: DashboardView },
    { name: 'SalesHubView', file: 'src/components/Sales/SalesHubView.tsx', component: SalesHubView },
    { name: 'PurchasesHubView', file: 'src/components/Purchases/PurchasesHubView.tsx', component: PurchasesHubView },
    { name: 'PartiesView', file: 'src/components/Parties/PartiesView.tsx', component: PartiesView },
    { name: 'InventoryView', file: 'src/components/Inventory/InventoryView.tsx', component: InventoryView },
    { name: 'BusinessReportsView', file: 'src/components/Reports/BusinessReportsView.tsx', component: BusinessReportsView },
    { name: 'CompanySettingsView', file: 'src/components/Settings/CompanySettingsView.tsx', component: CompanySettingsView },
    { name: 'Header', file: 'src/components/Shell/Header.tsx', component: Header },
    { name: 'TabletSidebar', file: 'src/components/Shell/TabletSidebar.tsx', component: TabletSidebar },
    { name: 'BottomNav', file: 'src/components/Shell/BottomNav.tsx', component: BottomNav },
  ];

  describe('1. Static Code Assertions: React.memo() declarations and exports', () => {
    memoizedViews.forEach(({ name, file }) => {
      it(`${name} file (${file}) contains React.memo( and exports the memoized const`, () => {
        const filePath = path.resolve(process.cwd(), file);
        expect(fs.existsSync(filePath), `File ${file} should exist`).toBe(true);
        const source = fs.readFileSync(filePath, 'utf-8');

        // Check file contains React.memo(
        expect(source).toContain('React.memo(');

        // Check that it exports the memoized const
        const exportMemoRegex = new RegExp(`export const ${name}(?::[a-zA-Z0-9_<>\\s.]+)?\\s*=\\s*React\\.memo\\(`);
        const altExportRegex = new RegExp(`export const ${name}\\s*=\\s*React\\.memo\\(`);
        const isExported = exportMemoRegex.test(source) || altExportRegex.test(source);
        expect(isExported, `${name} must be exported as a React.memo(...) component`).toBe(true);
      });
    });
  });

  describe('2. Static Code Assertions: App.tsx prop stability (no inline arrow props)', () => {
    it('App.tsx does not pass inline arrow props (={( or ={() => or ={(x) =>) to memoized views or shell components', () => {
      const appPath = path.resolve(process.cwd(), 'src/App.tsx');
      const appSource = fs.readFileSync(appPath, 'utf-8');

      const targetComponents = [
        'DashboardView',
        'SalesHubView',
        'PurchasesHubView',
        'PartiesView',
        'InventoryView',
        'BusinessReportsView',
        'CompanySettingsView',
        'Header',
        'TabletSidebar',
        'BottomNav',
      ];

      targetComponents.forEach((compName) => {
        // Regex to extract JSX element for compName: <CompName ... />
        const tagRegex = new RegExp(`<${compName}[\\s\\S]*?\\/>`, 'g');
        const matches = appSource.match(tagRegex);
        expect(matches, `App.tsx should render <${compName}>`).not.toBeNull();

        matches?.forEach((jsxElement) => {
          // Check for inline arrow function prop assignments like:
          // prop={() => ...} or prop={(x) => ...} or prop={x => ...} or prop={(() => ...)}
          const inlinePropMatches = jsxElement.match(/\b\w+=\{\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/g);
          expect(
            inlinePropMatches,
            `Component <${compName}> in App.tsx should not receive inline arrow props, found: ${inlinePropMatches?.join(', ')} in:\n${jsxElement}`
          ).toBeNull();

          // Also check for ={( style inline anonymous functions or function expressions
          const inlineFnMatches = jsxElement.match(/\b\w+=\{\s*function\s*\(/g);
          expect(
            inlineFnMatches,
            `Component <${compName}> in App.tsx should not receive inline function expressions`
          ).toBeNull();
        });
      });
    });
  });

  describe('3. Runtime Assertions: $$typeof === Symbol.for("react.memo")', () => {
    const memoSymbol = Symbol.for('react.memo');

    memoizedViews.forEach(({ name, component }) => {
      it(`${name} runtime export is a valid React.memo component`, () => {
        expect(component).toBeDefined();
        expect(typeof component).toBe('object');
        expect((component as { $$typeof?: symbol }).$$typeof).toBe(memoSymbol);
      });
    });
  });
});
