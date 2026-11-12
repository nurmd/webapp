import { toPaise, fromPaise } from '../money.ts';

export const PAISE_SCHEMA_VERSION = 1;

export type PaisePersistKind =
  | 'invoice'
  | 'purchase'
  | 'voucher'
  | 'expense'
  | 'party'
  | 'bankAccount'
  | 'cashBankTxn'
  | 'loan'
  | 'loanTxn';

export interface PaiseFieldMismatch {
  path: string;
  rupee: number;
  paise: number;
}

interface KindConfig {
  readonly topFields: readonly string[];
  readonly nestedArrays?: {
    readonly [arrayKey: string]: readonly string[];
  };
}

const INVOICE_PURCHASE_CONFIG: KindConfig = {
  topFields: [
    'totalGrossAmount', 'totalDiscount', 'totalTaxableAmount',
    'totalCgst', 'totalSgst', 'totalUtgst', 'totalIgst', 'totalCess', 'totalTax',
    'roundOff', 'shippingAmount', 'grandTotal', 'paidAmount', 'balanceAmount',
  ],
  nestedArrays: {
    items: [
      'unitPrice', 'discountAmount', 'taxableAmount',
      'cgstAmount', 'sgstAmount', 'utgstAmount', 'igstAmount', 'cessAmount', 'totalAmount',
    ],
    paymentSplits: ['amount'],
  },
};

const KIND_CONFIGS: Record<PaisePersistKind, KindConfig> = {
  invoice: INVOICE_PURCHASE_CONFIG,
  purchase: INVOICE_PURCHASE_CONFIG,
  voucher: {
    topFields: ['totalAmount'],
    nestedArrays: {
      entries: ['debit', 'credit'],
      paymentAllocations: ['amount'],
    },
  },
  expense: {
    topFields: ['amount', 'taxableAmount', 'taxAmount', 'cgstAmount', 'sgstAmount', 'igstAmount'],
  },
  party: {
    topFields: ['openingBalance', 'currentBalance'],
  },
  bankAccount: {
    topFields: ['openingBalance'],
  },
  cashBankTxn: {
    topFields: ['amount'],
  },
  loan: {
    topFields: ['sanctionAmount', 'emiAmount', 'currentPrincipalOutstanding'],
  },
  loanTxn: {
    topFields: ['principalPaid', 'interestPaid', 'chargesPaid', 'totalAmount', 'remainingPrincipal'],
  },
};

function attachFieldsToObject(
  source: Record<string, unknown>,
  fieldNames: readonly string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...source };
  for (const field of fieldNames) {
    const val = source[field];
    const paiseKey = `${field}Paise`;
    if (typeof val === 'number' && Number.isFinite(val)) {
      result[paiseKey] = toPaise(val);
    } else if (paiseKey in result) {
      delete result[paiseKey];
    }
  }
  return result;
}

/**
 * Shape of the metadata + twin fields added by `attachPaiseFields`.
 * The `${string}Paise` index signature lets callers read twins without casts.
 */
export type PaiseTwins = {
  __paiseSchema: number;
  __paiseKind: PaisePersistKind;
} & {
  [key: `${string}Paise`]: number | undefined;
};

/**
 * Recursively widens a document type with the paise twins that
 * `attachPaiseFields` adds at runtime (including nested arrays such as
 * `items`, `paymentSplits`, `entries` and `paymentAllocations`).
 */
export type PaiseAttached<T> = T extends readonly (infer U)[]
  ? PaiseAttached<U>[]
  : T extends object
    ? { [K in keyof T]: PaiseAttached<T[K]> } & PaiseTwins
    : T;

export function attachPaiseFields<T extends object>(
  doc: T,
  kind: PaisePersistKind
): PaiseAttached<T>;
export function attachPaiseFields<T extends object>(
  doc: T,
  kind: PaisePersistKind
): T {
  if (!doc || typeof doc !== 'object') {
    return doc;
  }

  const config = KIND_CONFIGS[kind];
  if (!config) {
    return doc;
  }

  const docObj = doc as Record<string, unknown>;
  const result = attachFieldsToObject(docObj, config.topFields);
  result.__paiseSchema = PAISE_SCHEMA_VERSION;
  result.__paiseKind = kind;

  if (config.nestedArrays) {
    for (const [arrKey, nestedFields] of Object.entries(config.nestedArrays)) {
      const rawArr = docObj[arrKey];
      if (Array.isArray(rawArr)) {
        result[arrKey] = rawArr.map((item) => {
          if (item && typeof item === 'object') {
            return attachFieldsToObject(item as Record<string, unknown>, nestedFields);
          }
          return item;
        });
      }
    }
  }

  return result as T;
}

function detectKind(doc: Record<string, unknown>): PaisePersistKind | null {
  const kind = doc.__paiseKind;
  if (typeof kind === 'string' && kind in KIND_CONFIGS) {
    return kind as PaisePersistKind;
  }
  if ('invoiceNumber' in doc) return 'invoice';
  if ('purchaseNumber' in doc || 'billNumber' in doc || 'purchaseType' in doc) return 'purchase';
  if ('voucherNumber' in doc || 'entries' in doc) return 'voucher';
  if ('sanctionAmount' in doc || 'emiAmount' in doc) return 'loan';
  if ('principalPaid' in doc || 'remainingPrincipal' in doc) return 'loanTxn';
  if ('fromAccountId' in doc || 'toAccountId' in doc) return 'cashBankTxn';
  if ('bankName' in doc || 'ifscCode' in doc || 'accountNumber' in doc) return 'bankAccount';
  if ('currentBalance' in doc || ('openingBalance' in doc && ('type' in doc || 'gstin' in doc))) return 'party';
  if ('expenseCategory' in doc || 'taxAmount' in doc) return 'expense';
  if ('items' in doc) return 'invoice';
  return null;
}

export function verifyPaiseFields(doc: unknown): PaiseFieldMismatch[] {
  if (!doc || typeof doc !== 'object') {
    return [];
  }
  const docObj = doc as Record<string, unknown>;
  if (docObj.__paiseSchema === undefined) {
    return [];
  }

  const kind = detectKind(docObj);
  if (!kind) {
    return [];
  }

  const config = KIND_CONFIGS[kind];
  const mismatches: PaiseFieldMismatch[] = [];

  for (const field of config.topFields) {
    const rupee = docObj[field];
    const paise = docObj[`${field}Paise`];
    if (typeof rupee === 'number' && Number.isFinite(rupee) && typeof paise === 'number' && Number.isFinite(paise)) {
      if (fromPaise(paise) !== rupee) {
        mismatches.push({ path: field, rupee, paise });
      }
    }
  }

  if (config.nestedArrays) {
    for (const [arrKey, nestedFields] of Object.entries(config.nestedArrays)) {
      const rawArr = docObj[arrKey];
      if (Array.isArray(rawArr)) {
        rawArr.forEach((item, index) => {
          if (item && typeof item === 'object') {
            const itemObj = item as Record<string, unknown>;
            for (const field of nestedFields) {
              const rupee = itemObj[field];
              const paise = itemObj[`${field}Paise`];
              if (
                typeof rupee === 'number' &&
                Number.isFinite(rupee) &&
                typeof paise === 'number' &&
                Number.isFinite(paise)
              ) {
                if (fromPaise(paise) !== rupee) {
                  mismatches.push({
                    path: `${arrKey}[${index}].${field}`,
                    rupee,
                    paise,
                  });
                }
              }
            }
          }
        });
      }
    }
  }

  return mismatches;
}

export function hasCurrentPaiseSchema(doc: unknown): boolean {
  if (!doc || typeof doc !== 'object') {
    return false;
  }
  return (doc as Record<string, unknown>).__paiseSchema === PAISE_SCHEMA_VERSION;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

/**
 * Reads an integer paise value for `field`. When __paiseSchema is current and the
 * twin `${field}Paise` matches the rupee value, the twin is returned; the rupee field
 * always wins on mismatch.
 */
export function readPaiseOr(
  doc: object | null | undefined,
  field: string,
  fallbackPaise = 0
): number {
  if (!isRecord(doc)) return fallbackPaise;
  const rupee = doc[field];
  if (typeof rupee !== 'number' || !Number.isFinite(rupee)) return fallbackPaise;
  const rupeePaise = toPaise(rupee);
  if (doc.__paiseSchema !== PAISE_SCHEMA_VERSION) return rupeePaise;
  const twin = doc[`${field}Paise`];
  if (typeof twin !== 'number' || !Number.isInteger(twin)) return rupeePaise;
  return twin === rupeePaise ? twin : rupeePaise; // Rupee always wins on mismatch
}
