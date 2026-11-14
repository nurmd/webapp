import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

describe('Data Access Standardization: Wave 1 Static Guard (Phase 2 Batch B)', () => {
  const readComponent = (relPath: string): string => {
    const fullPath = path.resolve(process.cwd(), relPath);
    expect(fs.existsSync(fullPath), `File ${relPath} should exist`).toBe(true);
    return fs.readFileSync(fullPath, 'utf-8');
  };

  it('1. Sidebar.tsx uses useCompany and does not call db.getCompany()', () => {
    const code = readComponent('src/components/Sidebar.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useCompany');
    expect(code).not.toMatch(/db\.getCompany\s*\(/);
  });

  it('2. DaybookView.tsx uses useCompany and does not call db.getCompany()', () => {
    const code = readComponent('src/components/Reports/DaybookView.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useCompany');
    expect(code).not.toMatch(/db\.getCompany\s*\(/);
  });

  it('3. ExpensesView.tsx uses useCompany and does not call db.getCompany()', () => {
    const code = readComponent('src/components/Expenses/ExpensesView.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useCompany');
    expect(code).not.toMatch(/db\.getCompany\s*\(/);
  });

  it('4. ItemDetailSheet.tsx uses useCompany and does not call db.getCompany()', () => {
    const code = readComponent('src/components/Inventory/ItemDetailSheet.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useCompany');
    expect(code).not.toMatch(/db\.getCompany\s*\(/);
  });

  it('5. Gstr1View.tsx uses useExpenses and does not call db.getExpenses()', () => {
    const code = readComponent('src/components/Reports/Gstr1View.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useExpenses');
    expect(code).not.toMatch(/db\.getExpenses\s*\(/);
  });

  it('6. SplitPaymentModal.tsx uses useBankAccounts and does not call db.getBankAccounts()', () => {
    const code = readComponent('src/components/POS/SplitPaymentModal.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useBankAccounts');
    expect(code).not.toMatch(/db\.getBankAccounts\s*\(/);
  });

  it('7. InvoicePaymentModal.tsx uses useBankAccounts and does not call db.getBankAccounts()', () => {
    const code = readComponent('src/components/Invoicing/components/InvoicePaymentModal.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useBankAccounts');
    expect(code).not.toMatch(/db\.getBankAccounts\s*\(/);
  });

  it('8. PaymentSettlementDock.tsx uses useBankAccounts and does not call db.getBankAccounts()', () => {
    const code = readComponent('src/components/Common/Billing/PaymentSettlementDock.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useBankAccounts');
    expect(code).not.toMatch(/db\.getBankAccounts\s*\(/);
  });

  it('9. ThermalPrintModal.tsx uses useParties and does not call db.getParties()', () => {
    const code = readComponent('src/components/Printing/ThermalPrintModal.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useParties');
    expect(code).not.toMatch(/db\.getParties\s*\(/);
  });

  it('10. WhatsAppShareModal.tsx uses useParties and does not call db.getParties()', () => {
    const code = readComponent('src/components/Common/WhatsAppShareModal.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useParties');
    expect(code).not.toMatch(/db\.getParties\s*\(/);
  });

  it('11. useInvoicePreviewModel.ts uses useParties and does not call db.getParties()', () => {
    const code = readComponent('src/components/Invoicing/preview/useInvoicePreviewModel.ts');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useParties');
    expect(code).not.toMatch(/db\.getParties\s*\(/);
  });

  it('12 & 13. PartyInfoCard.tsx uses usePartyGroups and usePartyCategories and does not call db.getPartyGroups() or db.getPartyCategories()', () => {
    const code = readComponent('src/components/Parties/PartyInfoCard.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('usePartyGroups');
    expect(code).toContain('usePartyCategories');
    expect(code).not.toMatch(/db\.getPartyGroups\s*\(/);
    expect(code).not.toMatch(/db\.getPartyCategories\s*\(/);
  });

  it('14. ItemSettingsTab.tsx uses useItems and does not call db.getItems()', () => {
    const code = readComponent('src/components/Settings/ItemSettingsTab.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useItems');
    expect(code).not.toMatch(/db\.getItems\s*\(/);
  });

  it('15. CustomItemModal.tsx uses useCompany and does not call db.getCompany()', () => {
    const code = readComponent('src/components/POS/CustomItemModal.tsx');
    expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
    expect(code).toContain('useCompany');
    expect(code).not.toMatch(/db\.getCompany\s*\(/);
  });

  describe('Bonus Sites', () => {
    it('Bonus 1: ItemFormModal.tsx uses useItems for duplicate validation and does not call db.getItems() in isDuplicateName', () => {
      const code = readComponent('src/components/Inventory/ItemFormModal.tsx');
      expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
      expect(code).toContain('useItems');
      expect(code).not.toMatch(/existingItems\s*\?\?\s*db\.getItems\(\)/);
    });

    it('Bonus 2: CategoryManagementModal.tsx uses useItems and does not call db.getItems()', () => {
      const code = readComponent('src/components/Settings/modals/CategoryManagementModal.tsx');
      expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
      expect(code).toContain('useItems');
      expect(code).not.toMatch(/db\.getItems\s*\(/);
    });

    it('Bonus 3: VoucherEditorModal.tsx uses useBankAccounts and does not call db.getBankAccounts() in availableBankAccounts memo', () => {
      const code = readComponent('src/components/Parties/VoucherEditorModal.tsx');
      expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
      expect(code).toContain('useBankAccounts');
      expect(code).not.toMatch(/availableBankAccounts\s*=\s*useMemo\(\(\)\s*=>\s*\{\s*const\s+all\s*=\s*db\.getBankAccounts\(\)/);
    });

    it('Bonus 4: CashBankTransactionDetailModal.tsx uses useCompany and does not pass company || db.getCompany()', () => {
      const code = readComponent('src/components/CashBank/CashBankTransactionDetailModal.tsx');
      expect(code).toMatch(/from ['"].*core\/store\/useDataStore(\.ts)?['"]/);
      expect(code).toContain('useCompany');
      expect(code).not.toMatch(/company=\{company\s*\|\|\s*db\.getCompany\(\)\}/);
    });
  });
});
