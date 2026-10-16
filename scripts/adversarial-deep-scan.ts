import fs from 'fs';
import path from 'path';
import ts from 'typescript';

console.log('====================================================================');
console.log('ADVERSARIAL DEEP SCAN: EXHAUSTIVE ACCESSIBILITY & TOUCH TARGET AUDITOR');
console.log('====================================================================\n');

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

const srcDir = path.resolve(process.cwd(), 'src');
const allFiles = getAllFiles(srcDir);
console.log(`Auditing ${allFiles.length} TSX/JSX files across src/...`);

interface ButtonFinding {
  filePath: string;
  line: number;
  classes: string;
  snippet: string;
  reason: string;
}

const unlabeledButtons: ButtonFinding[] = [];
const smallTouchButtons: ButtonFinding[] = [];

// Helper to determine if a JSX node has text
function hasTextContent(node: ts.JsxChild, sourceFile: ts.SourceFile): boolean {
  if (ts.isJsxText(node)) {
    const t = node.text.trim();
    return t.length > 0;
  }
  if (ts.isJsxExpression(node)) {
    if (!node.expression) return false;
    if (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression)) {
      return node.expression.text.trim().length > 0;
    }
    const exprText = node.expression.getText(sourceFile);
    // If it's a variable or ternary like {item.name} or {isEdit ? 'Save' : 'Create'}
    if (!exprText.toLowerCase().includes('icon') && !exprText.includes('<')) {
      // Possible dynamic text
      return true;
    }
  }
  if (ts.isJsxElement(node)) {
    const tagName = node.openingElement.tagName.getText(sourceFile);
    // If span/div has material-symbols or lucide icon, it's not text
    let isIcon = false;
    for (const prop of node.openingElement.attributes.properties) {
      if (ts.isJsxAttribute(prop) && prop.name.getText(sourceFile) === 'className' && prop.initializer) {
        const c = prop.initializer.getText(sourceFile);
        if (c.includes('material-symbols') || c.includes('lucide')) {
          isIcon = true;
        }
      }
    }
    if (isIcon || tagName === 'svg') {
      return false;
    }
    // Check grandchildren
    for (const child of node.children) {
      if (hasTextContent(child, sourceFile)) return true;
    }
  }
  return false;
}

for (const file of allFiles) {
  const relPath = path.relative(process.cwd(), file);
  // Skip test files
  if (relPath.includes('__tests__') || relPath.includes('.test.') || relPath.includes('.spec.')) {
    continue;
  }

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

        let hasAriaLabel = false;
        let hasAriaLabelledBy = false;
        let hasTitle = false;
        let classValue = '';

        for (const prop of tagNode.attributes.properties) {
          if (ts.isJsxAttribute(prop)) {
            const attrName = prop.name.getText(sourceFile);
            if (attrName === 'aria-label' && prop.initializer) {
              const labelText = prop.initializer.getText(sourceFile).replace(/["'`{}]/g, '').trim();
              if (labelText.length > 0) hasAriaLabel = true;
            }
            if (attrName === 'aria-labelledby' && prop.initializer) {
              hasAriaLabelledBy = true;
            }
            if (attrName === 'title' && prop.initializer) {
              const titleText = prop.initializer.getText(sourceFile).replace(/["'`{}]/g, '').trim();
              if (titleText.length > 0) hasTitle = true;
            }
            if (attrName === 'className' && prop.initializer) {
              classValue = prop.initializer.getText(sourceFile);
            }
          }
        }

        // Check if there is text in children
        let hasVisibleText = false;
        if (ts.isJsxElement(node)) {
          for (const child of node.children) {
            if (hasTextContent(child, sourceFile)) {
              hasVisibleText = true;
              break;
            }
          }
        }

        const snippet = node.getText(sourceFile).slice(0, 140).replace(/\s+/g, ' ');

        // Check 1: Unlabeled button
        if (!hasVisibleText && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
          unlabeledButtons.push({
            filePath: relPath,
            line: lineNumber,
            classes: classValue,
            snippet,
            reason: 'Button has no visible text and no aria-label / title'
          });
        }

        // Check 2: Sub-36px touch targets
        // Look for buttons that explicitly set micro height classes like h-6, h-7, h-8, min-h-[...<36px]
        // unless they are explicitly accompanied by min-h-[36px+]
        const hasMicroHeight = /\b(h-5|h-6|h-7|min-h-\[2\dpx\]|min-h-\[3[0-5]px\])\b/.test(classValue);
        const hasH8WithoutMinH = /\bh-8\b/.test(classValue) && !/min-h-\[?(?:3[6-9]|[4-9]\d)px\]?/.test(classValue);
        const isDesktopOnly = classValue.includes('hidden md:') || classValue.includes('hidden sm:') || classValue.includes('hidden lg:');

        if ((hasMicroHeight || hasH8WithoutMinH) && !isDesktopOnly) {
          // Check if this is an interactive button on mobile
          smallTouchButtons.push({
            filePath: relPath,
            line: lineNumber,
            classes: classValue.slice(0, 100),
            snippet,
            reason: 'Explicit sub-36px height detected'
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

console.log('--------------------------------------------------------------------');
console.log(`DEEP SCAN RESULTS: UNLABELED BUTTONS (${unlabeledButtons.length} found)`);
console.log('--------------------------------------------------------------------');
if (unlabeledButtons.length === 0) {
  console.log('✓ PASS: Zero unlabeled buttons found across all files in src/!');
} else {
  unlabeledButtons.forEach((b, i) => {
    console.log(`${i + 1}. [${b.filePath}:${b.line}] ${b.snippet}`);
  });
}

console.log('\n--------------------------------------------------------------------');
console.log(`DEEP SCAN RESULTS: SUB-36PX BUTTONS (${smallTouchButtons.length} found)`);
console.log('--------------------------------------------------------------------');
if (smallTouchButtons.length === 0) {
  console.log('✓ PASS: Zero sub-36px buttons found across all files in src/!');
} else {
  smallTouchButtons.forEach((b, i) => {
    console.log(`${i + 1}. [${b.filePath}:${b.line}] ${b.snippet}`);
    console.log(`   Classes: ${b.classes}`);
  });
}
