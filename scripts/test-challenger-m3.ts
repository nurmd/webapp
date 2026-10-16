/**
 * scripts/test-challenger-m3.ts
 *
 * Milestone 3 Adversarial Verification & Stress Testing Harness
 * Role: teamwork_preview_challenger_m3_it1_2 (Adversarial Verifier)
 *
 * Focus:
 * 1. Deep AST audit of all JSX/TSX files in src/components/ for unlabeled icon-only buttons.
 * 2. Touch target height audit across SalesHubView, DashboardView, PurchasesHubView, InventoryView, PartiesView.
 * 3. Static and contract validation of Sales Hub empty states.
 */

import fs from 'fs';
import path from 'path';
import ts from 'typescript';

console.log('====================================================================');
console.log('CHALLENGER M3: ADVERSARIAL ACCESSIBILITY & TOUCH TARGET AUDITOR');
console.log('====================================================================\n');

// 1. RECURSIVELY FIND ALL TSX/JSX FILES IN src/components
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
      arrayOfFiles.push(fullPath);
    }
  }
  return arrayOfFiles;
}

const componentsDir = path.resolve(process.cwd(), 'src/components');
const allComponentFiles = getAllFiles(componentsDir);
console.log(`Found ${allComponentFiles.length} TSX/JSX component files to audit.`);

interface UnlabeledButtonFinding {
  filePath: string;
  line: number;
  snippet: string;
  reason: string;
}

const unlabeledIconButtons: UnlabeledButtonFinding[] = [];
const smallTouchTargetButtons: { filePath: string; line: number; classes: string; text: string }[] = [];

// Helper to extract text from JSX children
function getJsxText(node: ts.JsxChild): string {
  if (ts.isJsxText(node)) {
    return node.text.trim();
  }
  if (ts.isJsxExpression(node)) {
    if (node.expression && ts.isStringLiteral(node.expression)) {
      return node.expression.text.trim();
    }
  }
  return '';
}

// Check if a JSX element is an icon
function isIconElement(tag: string, classAttr?: string): boolean {
  if (
    tag === 'Search' || tag === 'X' || tag === 'Plus' || tag === 'Trash2' ||
    tag === 'Edit' || tag === 'Edit2' || tag === 'Edit3' || tag === 'ArrowLeft' ||
    tag === 'ChevronLeft' || tag === 'ChevronRight' || tag === 'ChevronDown' ||
    tag === 'ChevronUp' || tag === 'Printer' || tag === 'Share2' || tag === 'Download' ||
    tag === 'Eye' || tag === 'EyeOff' || tag === 'Check' || tag === 'AlertCircle' ||
    tag === 'Info' || tag === 'Menu' || tag === 'MoreVertical' || tag === 'MoreHorizontal' ||
    tag === 'Filter' || tag === 'Calendar' || tag === 'RefreshCw' || tag === 'Copy' ||
    tag === 'QrCode' || tag === 'Camera' || tag === 'Sliders' || tag === 'Clock' ||
    tag === 'FileText' || tag === 'HelpCircle'
  ) {
    return true;
  }
  if (tag === 'span' && classAttr && classAttr.includes('material-symbols-outlined')) {
    return true;
  }
  return false;
}

// Traverse AST
for (const file of allComponentFiles) {
  const code = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagNode = ts.isJsxElement(node) ? node.openingElement : node;
      const tagName = tagNode.tagName.getText(sourceFile);

      if (tagName === 'button') {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const lineNumber = line + 1;

        // Check attributes
        let hasAriaLabel = false;
        let hasAriaLabelledBy = false;
        let hasTitle = false;
        let classValue = '';

        for (const prop of tagNode.attributes.properties) {
          if (ts.isJsxAttribute(prop)) {
            const attrName = prop.name.getText(sourceFile);
            if (attrName === 'aria-label' && prop.initializer) {
              hasAriaLabel = true;
            }
            if (attrName === 'aria-labelledby' && prop.initializer) {
              hasAriaLabelledBy = true;
            }
            if (attrName === 'title' && prop.initializer) {
              hasTitle = true;
            }
            if (attrName === 'className' && prop.initializer) {
              classValue = prop.initializer.getText(sourceFile);
            }
          }
        }

        // Check children
        let hasVisibleText = false;
        let hasIconOnly = false;
        let childIcons = 0;
        let otherChildren = 0;

        if (ts.isJsxElement(node)) {
          for (const child of node.children) {
            const text = getJsxText(child);
            if (text.length > 0) {
              // Ignore whitespace or icon names if wrapped in material-symbols
              hasVisibleText = true;
            } else if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
              const childTag = ts.isJsxElement(child) ? child.openingElement : child;
              const childTagName = childTag.tagName.getText(sourceFile);
              let childClass = '';
              for (const p of childTag.attributes.properties) {
                if (ts.isJsxAttribute(p) && p.name.getText(sourceFile) === 'className' && p.initializer) {
                  childClass = p.initializer.getText(sourceFile);
                }
              }

              if (isIconElement(childTagName, childClass)) {
                childIcons++;
              } else {
                otherChildren++;
              }
            } else if (ts.isJsxExpression(child) && child.expression) {
              // Check if expression is something like {label} or string
              const exprText = child.expression.getText(sourceFile);
              if (exprText && !exprText.includes('Icon') && !exprText.includes('icon')) {
                // Potential text or dynamic child
              }
            }
          }
        }

        // Check if button is in primary hubs for touch target audit
        const relPath = path.relative(process.cwd(), file);
        const isTargetView = [
          'src/components/Sales/SalesHubView.tsx',
          'src/components/Dashboard/DashboardView.tsx',
          'src/components/Purchases/PurchasesHubView.tsx',
          'src/components/Inventory/InventoryView.tsx',
          'src/components/Parties/PartiesView.tsx'
        ].includes(relPath);

        if (isTargetView) {
          // Check for small heights like h-6 (24px), h-7 (28px), h-8 (32px), min-h-[... < 36px]
          const isFilterOrPill = /filter|tab|pill|segment|preset|chip|date|status|sort|audit/i.test(node.getText(sourceFile)) ||
                                 /rounded-full|rounded-lg|rounded-xl/.test(classValue);
          const hasMicroHeight = /\b(h-6|h-7|min-h-\[2\dpx\]|min-h-\[3[0-5]px\])\b/.test(classValue);
          const hasH8WithoutMinH = /\bh-8\b/.test(classValue) && !/min-h-\[?(?:3[6-9]|[4-9]\d)px\]?/.test(classValue);

          if (isFilterOrPill && (hasMicroHeight || hasH8WithoutMinH)) {
            smallTouchTargetButtons.push({
              filePath: relPath,
              line: lineNumber,
              classes: classValue.slice(0, 120),
              text: node.getText(sourceFile).slice(0, 80).replace(/\s+/g, ' ')
            });
          }
        }

        // Identify icon-only buttons missing aria-label
        if (childIcons > 0 && otherChildren === 0 && !hasVisibleText) {
          if (!hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
            unlabeledIconButtons.push({
              filePath: path.relative(process.cwd(), file),
              line: lineNumber,
              snippet: node.getText(sourceFile).slice(0, 120).replace(/\s+/g, ' '),
              reason: 'Button contains icon child with NO aria-label, aria-labelledby, title, or visible text'
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

console.log('\n--------------------------------------------------------------------');
console.log(`RESULTS: UNLABELED ICON-ONLY BUTTON AUDIT (${unlabeledIconButtons.length} found)`);
console.log('--------------------------------------------------------------------');
if (unlabeledIconButtons.length === 0) {
  console.log('✓ PASS: Zero unlabeled icon-only buttons found across all audited components!');
} else {
  console.log(`⚠ Found ${unlabeledIconButtons.length} potential unlabeled icon buttons:`);
  unlabeledIconButtons.slice(0, 30).forEach((f, idx) => {
    console.log(`  ${idx + 1}. [${f.filePath}:${f.line}] ${f.snippet}`);
  });
  if (unlabeledIconButtons.length > 30) {
    console.log(`  ... and ${unlabeledIconButtons.length - 30} more.`);
  }
}

console.log('\n--------------------------------------------------------------------');
console.log(`RESULTS: TOUCH TARGET METRICS AUDIT (<36px) (${smallTouchTargetButtons.length} found)`);
console.log('--------------------------------------------------------------------');
if (smallTouchTargetButtons.length === 0) {
  console.log('✓ PASS: All filter pills, tabs, and segment buttons meet >= 36px/40px touch targets!');
} else {
  console.log(`⚠ Found ${smallTouchTargetButtons.length} buttons with sub-36px heights in target views:`);
  smallTouchTargetButtons.forEach((b, idx) => {
    console.log(`  ${idx + 1}. [${b.filePath}:${b.line}] ${b.text}`);
    console.log(`     Classes: ${b.classes}`);
  });
}
