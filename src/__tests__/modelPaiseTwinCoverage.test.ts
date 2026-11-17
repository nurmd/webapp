import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

interface KindConfig {
  readonly topFields: readonly string[];
  readonly nestedArrays?: {
    readonly [arrayKey: string]: readonly string[];
  };
}

type KindConfigsRecord = Record<string, KindConfig>;

interface EntityTarget {
  readonly file: string;
  readonly interfaceName: string;
}

interface KindMapping {
  readonly topLevel: EntityTarget;
  readonly nestedArrays?: {
    readonly [arrayKey: string]: EntityTarget;
  };
}

/**
 * Maps each PaisePersistKind in paisePersistence.ts to its declaring model file
 * and TypeScript interface.
 */
const KIND_MAPPINGS: Record<string, KindMapping> = {
  invoice: {
    topLevel: { file: 'src/models/invoice.ts', interfaceName: 'Invoice' },
    nestedArrays: {
      items: { file: 'src/models/invoice.ts', interfaceName: 'InvoiceItemEntry' },
      paymentSplits: { file: 'src/models/invoice.ts', interfaceName: 'PaymentSplit' },
    },
  },
  purchase: {
    topLevel: { file: 'src/models/purchase.ts', interfaceName: 'PurchaseBill' },
    nestedArrays: {
      items: { file: 'src/models/purchase.ts', interfaceName: 'PurchaseItemEntry' },
      paymentSplits: { file: 'src/models/invoice.ts', interfaceName: 'PaymentSplit' },
    },
  },
  voucher: {
    topLevel: { file: 'src/core/accounting/voucherTypes.ts', interfaceName: 'Voucher' },
    nestedArrays: {
      entries: { file: 'src/core/accounting/voucherTypes.ts', interfaceName: 'JournalEntryLine' },
      paymentAllocations: { file: 'src/core/accounting/voucherTypes.ts', interfaceName: 'PaymentAllocation' },
    },
  },
  expense: {
    topLevel: { file: 'src/models/expense.ts', interfaceName: 'Expense' },
  },
  party: {
    topLevel: { file: 'src/models/party.ts', interfaceName: 'Party' },
  },
  bankAccount: {
    topLevel: { file: 'src/models/bankAccount.ts', interfaceName: 'BankAccount' },
  },
  cashBankTxn: {
    topLevel: { file: 'src/models/bankAccount.ts', interfaceName: 'CashBankTransaction' },
  },
  loan: {
    topLevel: { file: 'src/models/loan.ts', interfaceName: 'LoanAccount' },
  },
  loanTxn: {
    topLevel: { file: 'src/models/loan.ts', interfaceName: 'LoanTransaction' },
  },
};

const ALL_MODEL_FILES: readonly string[] = [
  'src/models/party.ts',
  'src/models/expense.ts',
  'src/models/bankAccount.ts',
  'src/models/loan.ts',
  'src/core/accounting/voucherTypes.ts',
  'src/models/invoice.ts',
  'src/models/purchase.ts',
];

function loadKindConfigs(): KindConfigsRecord {
  const filePath = path.resolve(__dirname, '../core/accounting/paisePersistence.ts');
  const content = fs.readFileSync(filePath, 'utf8');

  const invoiceConfigMatch = content.match(
    /const INVOICE_PURCHASE_CONFIG:\s*KindConfig\s*=\s*(\{[\s\S]*?\n\};)/
  );
  const kindConfigsMatch = content.match(
    /const KIND_CONFIGS:\s*Record<PaisePersistKind,\s*KindConfig>\s*=\s*(\{[\s\S]*?\n\};)/
  );

  if (!invoiceConfigMatch || !kindConfigsMatch) {
    throw new Error('Could not find KIND_CONFIGS in src/core/accounting/paisePersistence.ts');
  }

  const sandbox: { KIND_CONFIGS?: KindConfigsRecord } = {};
  vm.runInNewContext(
    'const INVOICE_PURCHASE_CONFIG = ' + invoiceConfigMatch[1] + '\n' +
    'const KIND_CONFIGS = ' + kindConfigsMatch[1] + '\n' +
    'this.KIND_CONFIGS = KIND_CONFIGS;',
    sandbox
  );

  if (!sandbox.KIND_CONFIGS) {
    throw new Error('Failed to evaluate KIND_CONFIGS from src/core/accounting/paisePersistence.ts');
  }

  return sandbox.KIND_CONFIGS;
}

function extractInterfaceBody(fileContent: string, interfaceName: string): string {
  const regex = new RegExp(`export\\s+interface\\s+${interfaceName}\\b[^{]*\\{([\\s\\S]*?)\\n\\}`);
  const match = fileContent.match(regex);
  if (!match) {
    throw new Error(`Could not find interface '${interfaceName}'`);
  }
  return match[1];
}

describe('modelPaiseTwinCoverage guard', () => {
  const kindConfigs = loadKindConfigs();

  it('verifies that kindConfigs has been extracted from paisePersistence.ts for all expected kinds', () => {
    const kinds = Object.keys(kindConfigs);
    expect(kinds).toContain('invoice');
    expect(kinds).toContain('purchase');
    expect(kinds).toContain('voucher');
    expect(kinds).toContain('expense');
    expect(kinds).toContain('party');
    expect(kinds).toContain('bankAccount');
    expect(kinds).toContain('cashBankTxn');
    expect(kinds).toContain('loan');
    expect(kinds).toContain('loanTxn');
    expect(kinds.length).toBe(9);
  });

  // Verify coverage for top-level fields of each kind
  for (const [kind, config] of Object.entries(kindConfigs)) {
    describe(`kind: ${kind}`, () => {
      const mapping = KIND_MAPPINGS[kind];
      if (!mapping) {
        throw new Error(`No mapping defined for kind '${kind}' in modelPaiseTwinCoverage.test.ts`);
      }

      const filePath = path.resolve(process.cwd(), mapping.topLevel.file);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const interfaceBody = extractInterfaceBody(fileContent, mapping.topLevel.interfaceName);

      for (const field of config.topFields) {
        it(`declares optional twin ${field}Paise?: number on ${mapping.topLevel.interfaceName} (${mapping.topLevel.file})`, () => {
          const expectedPattern = new RegExp(`\\b${field}Paise\\s*\\?\\s*:\\s*number\\b`);
          const matches = expectedPattern.test(interfaceBody);
          expect(
            matches,
            `Missing paise twin declaration: kind '${kind}', field '${field}' (expected '${field}Paise?: number') in interface '${mapping.topLevel.interfaceName}' in file '${mapping.topLevel.file}'`
          ).toBe(true);
        });
      }

      if (config.nestedArrays) {
        for (const [arrayKey, nestedFields] of Object.entries(config.nestedArrays)) {
          const nestedTarget = mapping.nestedArrays?.[arrayKey];
          if (!nestedTarget) {
            throw new Error(`No nested target mapping for kind '${kind}', nested array '${arrayKey}'`);
          }

          const nestedFilePath = path.resolve(process.cwd(), nestedTarget.file);
          const nestedFileContent = fs.readFileSync(nestedFilePath, 'utf8');
          const nestedBody = extractInterfaceBody(nestedFileContent, nestedTarget.interfaceName);

          for (const field of nestedFields) {
            it(`declares optional twin ${field}Paise?: number on nested ${nestedTarget.interfaceName} (${nestedTarget.file}) for array '${arrayKey}'`, () => {
              const expectedPattern = new RegExp(`\\b${field}Paise\\s*\\?\\s*:\\s*number\\b`);
              const matches = expectedPattern.test(nestedBody);
              expect(
                matches,
                `Missing paise twin declaration: kind '${kind}', nested array '${arrayKey}', field '${field}' (expected '${field}Paise?: number') in interface '${nestedTarget.interfaceName}' in file '${nestedTarget.file}'`
              ).toBe(true);
            });
          }
        }
      }
    });
  }

  it('asserts every declared *Paise field in all model files is optional (? contains)', () => {
    for (const relativePath of ALL_MODEL_FILES) {
      const absolutePath = path.resolve(process.cwd(), relativePath);
      const content = fs.readFileSync(absolutePath, 'utf8');

      // Match property lines like: "fieldNamePaise?: number;" or "fieldNamePaise: number;"
      const propRegex = /^\s*(\w+Paise)\s*(\??)\s*:\s*([^;]+);/gm;
      let match: RegExpExecArray | null;
      let count = 0;

      while ((match = propRegex.exec(content)) !== null) {
        const [fullLine, fieldName, optionalMark, typeName] = match;
        count++;

        expect(
          optionalMark,
          `In ${relativePath}, field '${fieldName}' must be optional ('?: number'). Found non-optional line: '${fullLine.trim()}'`
        ).toBe('?');

        expect(
          typeName.trim(),
          `In ${relativePath}, field '${fieldName}' must have type 'number'. Found: '${typeName.trim()}'`
        ).toBe('number');
      }

      expect(count, `Expected to find at least one *Paise twin in ${relativePath}`).toBeGreaterThan(0);
    }
  });
});
