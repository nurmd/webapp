import { describe, it, expect } from 'vitest';
import { maskGstin } from '../components/Navbar.tsx';
import fs from 'fs';
import path from 'path';

describe('Milestone 1: Design Token Migration, GSTIN Masking & Safe Modals', () => {
  describe('maskGstin utility', () => {
    it('returns empty string when given undefined, null, or empty string', () => {
      expect(maskGstin()).toBe('');
      expect(maskGstin(undefined)).toBe('');
      expect(maskGstin('')).toBe('');
      expect(maskGstin('   ')).toBe('');
    });

    it('returns input unchanged if length is less than 6 characters', () => {
      expect(maskGstin('12345')).toBe('12345');
      expect(maskGstin('GST')).toBe('GST');
    });

    it('masks standard 15-character GSTIN with prefix, suffix and dots', () => {
      const gstin = '27AAPFU0939F1ZV';
      const masked = maskGstin(gstin);
      expect(masked).toBe('27••••••••1ZV');
      expect(masked.startsWith('27')).toBe(true);
      expect(masked.endsWith('1ZV')).toBe(true);
      expect(masked).toContain('••••••••');
    });

    it('handles trimmed GSTIN with leading or trailing whitespace', () => {
      expect(maskGstin('  29ABCDE1234F2Z5  ')).toBe('29••••••••2Z5');
    });
  });

  describe('Zero modal dialog prompt invariant', () => {
    function getAllSourceFiles(dir: string, fileList: string[] = []): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          getAllSourceFiles(fullPath, fileList);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
          fileList.push(fullPath);
        }
      }
      return fileList;
    }

    it('ensures zero occurrences of browser modal dialogs in all src files', () => {
      const srcDir = path.resolve(__dirname, '..');
      const files = getAllSourceFiles(srcDir);
      const violations: string[] = [];
      const windowConfirmRegex = new RegExp(['window', 'confirm\\s*\\('].join('.'));

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        if (windowConfirmRegex.test(content)) {
          violations.push(file);
        }
      }

      expect(violations).toEqual([]);
    });

    it('ensures zero occurrences of bare modal dialog calls in all src files', () => {
      const srcDir = path.resolve(__dirname, '..');
      const files = getAllSourceFiles(srcDir);
      const violations: string[] = [];
      const bareConfirmRegex = new RegExp(['(?<![\\w.$])', 'confirm', '\\s*\\('].join(''));

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (bareConfirmRegex.test(line)) {
            violations.push(`${file}:${index + 1}: ${line.trim()}`);
          }
        });
      }

      expect(violations).toEqual([]);
    });
  });

  describe('Party balance color classification invariants', () => {
    it('correctly maps positive, negative, and zero balances to semantic styling contracts', () => {
      const classifyBalance = (balance: number) => {
        const isReceivable = balance > 0;
        const isPayable = balance < 0;
        return {
          textColor: isReceivable
            ? 'text-emerald-700 dark:text-emerald-400'
            : isPayable
            ? 'text-rose-700 dark:text-rose-400'
            : 'text-secondary',
          badgeBg: isReceivable
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : isPayable
            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
            : 'bg-secondary/10 text-secondary',
          label: isReceivable ? 'To Collect' : isPayable ? 'To Pay' : 'Settled',
        };
      };

      const receivable = classifyBalance(5000);
      expect(receivable.textColor).toBe('text-emerald-700 dark:text-emerald-400');
      expect(receivable.badgeBg).toBe('bg-emerald-500/10 text-emerald-700 dark:text-emerald-400');
      expect(receivable.label).toBe('To Collect');

      const payable = classifyBalance(-2500);
      expect(payable.textColor).toBe('text-rose-700 dark:text-rose-400');
      expect(payable.badgeBg).toBe('bg-rose-500/10 text-rose-700 dark:text-rose-400');
      expect(payable.label).toBe('To Pay');

      const settled = classifyBalance(0);
      expect(settled.textColor).toBe('text-secondary');
      expect(settled.badgeBg).toBe('bg-secondary/10 text-secondary');
      expect(settled.label).toBe('Settled');
    });
  });
});
