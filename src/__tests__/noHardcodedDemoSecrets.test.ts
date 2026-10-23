import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function getFilesRecursively(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        getFilesRecursively(fullPath, fileList);
      }
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx|json|sh|bash|md|html)$/.test(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

describe('No Hardcoded Demo Secrets Test', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const targetDirs = [
    path.join(rootDir, 'src'),
    path.join(rootDir, 'scripts'),
    path.join(rootDir, 'deploy'),
  ];

  const forbiddenPatterns = [
    'passwordisdemo',
  ];

  it('fails on the leaked demo password without blocking any legitimate sync host', () => {
    const allFiles = targetDirs.flatMap((d) => getFilesRecursively(d));
    expect(allFiles.length).toBeGreaterThan(50);

    const violations: { file: string; line: number; text: string; pattern: string }[] = [];

    for (const filePath of allFiles) {
      const relativePath = path.relative(rootDir, filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((lineText, idx) => {
        for (const pattern of forbiddenPatterns) {
          if (lineText.includes(pattern)) {
            // Self file
            const isSelf = relativePath === path.join('src', '__tests__', 'noHardcodedDemoSecrets.test.ts');

            if (!isSelf) {
              violations.push({
                file: relativePath,
                line: idx + 1,
                text: lineText.trim(),
                pattern,
              });
            }
          }
        }
      });
    }

    if (violations.length > 0) {
      const errorMsg = violations
        .map((v) => `[DEMO SECRET LEAK] ${v.file}:${v.line} matched "${v.pattern}": ${v.text}`)
        .join('\n');
      expect.fail(`Forbidden demo credentials found:\n${errorMsg}`);
    }

    expect(violations).toHaveLength(0);
  });
});
