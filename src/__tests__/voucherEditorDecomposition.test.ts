import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 2.3b — VoucherEditorModal Decomposition Guard', () => {
  const rootDir = path.resolve(__dirname, '..');
  const modalPath = path.join(rootDir, 'components', 'Parties', 'VoucherEditorModal.tsx');
  const formHookPath = path.join(rootDir, 'components', 'Parties', 'voucherEditor', 'useVoucherEditorForm.ts');
  const allocHookPath = path.join(rootDir, 'components', 'Parties', 'voucherEditor', 'useVoucherAllocations.ts');

  it('asserts both hook files exist and export their respective hooks', () => {
    expect(fs.existsSync(formHookPath)).toBe(true);
    expect(fs.existsSync(allocHookPath)).toBe(true);

    const formContent = fs.readFileSync(formHookPath, 'utf-8');
    const allocContent = fs.readFileSync(allocHookPath, 'utf-8');

    expect(formContent).toMatch(/export\s+function\s+useVoucherEditorForm\b/);
    expect(allocContent).toMatch(/export\s+function\s+useVoucherAllocations\b/);
  });

  it('asserts VoucherEditorModal.tsx imports both hooks', () => {
    const modalContent = fs.readFileSync(modalPath, 'utf-8');
    expect(modalContent).toMatch(/import.*useVoucherEditorForm.*from/);
    expect(modalContent).toMatch(/import.*useVoucherAllocations.*from/);
  });

  it('asserts VoucherEditorModal.tsx no longer contains useState<Record<string, number>>({}) or inline handleAutoAllocate', () => {
    const modalContent = fs.readFileSync(modalPath, 'utf-8');
    expect(modalContent).not.toContain('useState<Record<string, number>>({})');
    expect(modalContent).not.toMatch(/const\s+handleAutoAllocate\s*=/);
  });

  it('asserts VoucherEditorModal.tsx line count is strictly under 1300 lines', () => {
    const modalContent = fs.readFileSync(modalPath, 'utf-8');
    const lineCount = modalContent.split('\n').length;
    expect(lineCount).toBeLessThan(1300);
  });
});
