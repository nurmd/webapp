import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function getSourceFiles(dir: string, fileList: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        getSourceFiles(fullPath, fileList);
      }
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const srcDir = path.resolve(__dirname, '..');
const allSrcFiles = getSourceFiles(srcDir);
const nonTestFiles = allSrcFiles.filter(
  (f) => !f.includes('__tests__') && !f.includes('.test.') && !f.includes('.spec.')
);

describe('Accessibility Invariants (Audit Finding 4.15)', () => {
  it('ensures zero occurrences of key={index} in src (excluding tests)', () => {
    const violations: string[] = [];
    const keyIndexRegex = /\bkey=\{index\}/;

    for (const file of nonTestFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (keyIndexRegex.test(line)) {
          const relPath = path.relative(srcDir, file);
          violations.push(`${relPath}:${idx + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('ensures zero occurrences of icon-only buttons without aria-label in src (excluding tests)', () => {
    const violations: string[] = [];
    // Regex matching an opening <button ...> tag and its immediate icon-only content
    const iconOnlyButtonRegex =
      /<button\b([^<]*?)>\s*(?:<span\b[^<]*?material-symbols-outlined[^<]*?>[^<]*?<\/span>\s*)+<\/button>/g;

    for (const file of nonTestFiles) {
      const content = fs.readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = iconOnlyButtonRegex.exec(content)) !== null) {
        const [, attrs] = match;
        if (!/aria-label=/i.test(attrs)) {
          const relPath = path.relative(srcDir, file);
          violations.push(`${relPath}: ${match[0].replace(/\s+/g, ' ').slice(0, 100)}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('ensures regression floor of at least 348 aria-labels across src', () => {
    let ariaLabelCount = 0;
    const ariaLabelRegex = /aria-label=/g;

    for (const file of allSrcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const matches = content.match(ariaLabelRegex);
      if (matches) {
        ariaLabelCount += matches.length;
      }
    }

    expect(ariaLabelCount).toBeGreaterThanOrEqual(348);
  });
});
