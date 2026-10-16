/**
 * Invoice Number Management & Uniqueness Engine
 * 
 * Enforces GST Rule 46 compliance:
 * - Consecutive serial numbers unique across a financial year.
 * - Intelligent sequential number generation with prefix and year matching.
 * - Conflict detection to strictly prevent duplicate invoice numbers.
 */

export interface InvoiceLike {
  id?: string;
  invoiceNumber: string;
  partyName?: string;
  date?: string;
}

/**
 * Normalizes an invoice number for comparison (trims and converts to uppercase).
 */
export function normalizeInvoiceNumber(invNum: string | null | undefined): string {
  if (!invNum) return '';
  return invNum.trim().toUpperCase();
}

/**
 * Checks whether an invoice number candidate conflicts with any existing invoice.
 * 
 * @param candidate - The invoice number to test.
 * @param currentInvoiceId - The ID of the invoice currently being edited (exempt from collision).
 * @param invoices - List of all existing invoices in the database.
 */
export function isInvoiceNumberConflicting(
  candidate: string | null | undefined,
  currentInvoiceId: string | undefined,
  invoices: InvoiceLike[] = []
): boolean {
  const normalizedCandidate = normalizeInvoiceNumber(candidate);
  if (!normalizedCandidate) return true; // Empty string is invalid / treated as conflicting

  return invoices.some((inv) => {
    if (currentInvoiceId && inv.id === currentInvoiceId) return false;
    return normalizeInvoiceNumber(inv.invoiceNumber) === normalizedCandidate;
  });
}

/**
 * Finds the existing invoice that causes a conflict with the candidate number.
 */
export function findConflictingInvoice<T extends InvoiceLike>(
  candidate: string | null | undefined,
  currentInvoiceId: string | undefined,
  invoices: T[] = []
): T | undefined {
  const normalizedCandidate = normalizeInvoiceNumber(candidate);
  if (!normalizedCandidate) return undefined;

  return invoices.find((inv) => {
    if (currentInvoiceId && inv.id === currentInvoiceId) return false;
    return normalizeInvoiceNumber(inv.invoiceNumber) === normalizedCandidate;
  });
}

/**
 * Generates the next sequential unique invoice number.
 * 
 * Looks at existing invoices that match the format `${prefix}${year}-${number}` or `${prefix}${number}`,
 * identifies the highest current serial number, and returns the next unused unique number.
 * 
 * Guaranteed to never return a conflicting invoice number.
 */
export function generateNextInvoiceNumber(
  prefix: string = 'INV-',
  invoices: InvoiceLike[] = [],
  year: number = new Date().getFullYear()
): string {
  const cleanPrefix = (prefix || 'INV-').trim();
  const yearStr = String(year);

  // Collect all existing numbers normalized
  const existingSet = new Set<string>();
  invoices.forEach((inv) => {
    if (inv.invoiceNumber) {
      existingSet.add(normalizeInvoiceNumber(inv.invoiceNumber));
    }
  });

  // Regular expression to match standard prefixes with optional year and sequence:
  // Examples:
  // "INV-2026-001" -> year 2026, seq 1
  // "INV-2024-042" -> year 2024, seq 42
  // "POS-1005" -> seq 1005
  // "BILL/2026/015" -> year 2026, seq 15
  let maxSeq = 0;
  let hasMatchingYearPattern = false;

  const yearPattern = new RegExp(
    `^${escapeRegExp(cleanPrefix)}${yearStr}[-/]?(\\d+)$`,
    'i'
  );

  const fallbackPattern = new RegExp(
    `^${escapeRegExp(cleanPrefix)}[-/]?(\\d+)$`,
    'i'
  );

  invoices.forEach((inv) => {
    const raw = inv.invoiceNumber ? inv.invoiceNumber.trim() : '';
    if (!raw) return;

    const yearMatch = raw.match(yearPattern);
    if (yearMatch && yearMatch[1]) {
      hasMatchingYearPattern = true;
      const seq = parseInt(yearMatch[1], 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
      return;
    }

    if (!hasMatchingYearPattern) {
      const fallbackMatch = raw.match(fallbackPattern);
      if (fallbackMatch && fallbackMatch[1]) {
        const seq = parseInt(fallbackMatch[1], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
  });

  // Format base: use prefix + year if not already included in prefix
  const includeYearInPattern = !cleanPrefix.includes(yearStr);
  const basePrefix = includeYearInPattern ? `${cleanPrefix}${yearStr}-` : cleanPrefix;

  let candidateSeq = maxSeq + 1;
  const paddingLength = Math.max(3, String(candidateSeq).length);

  while (true) {
    const padded = String(candidateSeq).padStart(paddingLength, '0');
    const candidate = `${basePrefix}${padded}`;
    if (!existingSet.has(normalizeInvoiceNumber(candidate))) {
      return candidate;
    }
    candidateSeq++;
  }
}

/**
 * Suggests the next available unique invoice number starting from a conflicting candidate.
 * 
 * Example:
 * If "INV-2026-001" is taken, suggests "INV-2026-002", "INV-2026-003", etc.
 */
export function suggestNextUniqueInvoiceNumber(
  candidate: string,
  currentInvoiceId: string | undefined,
  invoices: InvoiceLike[] = []
): string {
  const trimmed = (candidate || '').trim();
  if (!trimmed) {
    return generateNextInvoiceNumber('INV-', invoices);
  }

  // Check if candidate ends with digits
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    let seq = parseInt(match[2], 10);
    const padLen = match[2].length;

    while (true) {
      seq++;
      const candidateSuggest = `${prefix}${String(seq).padStart(padLen, '0')}`;
      if (!isInvoiceNumberConflicting(candidateSuggest, currentInvoiceId, invoices)) {
        return candidateSuggest;
      }
    }
  }

  // If no trailing numbers, append -001, -002...
  let seq = 1;
  while (true) {
    const candidateSuggest = `${trimmed}-${String(seq).padStart(3, '0')}`;
    if (!isInvoiceNumberConflicting(candidateSuggest, currentInvoiceId, invoices)) {
      return candidateSuggest;
    }
    seq++;
  }
}

import {
  CompanyProfile,
  DocumentSeriesConfig,
  DocumentSeriesType,
  SeriesYearFormat,
  SeriesSeparator,
} from '../../models/company.ts';

export const DOCUMENT_SERIES_LABELS: Record<DocumentSeriesType, { title: string; shortCode: string; icon: string; description: string }> = {
  SALES_INVOICE: {
    title: 'Tax Invoice (B2B / B2C)',
    shortCode: 'INV',
    icon: 'receipt_long',
    description: 'Standard GST tax invoice and cash memo billing',
  },
  POS_INVOICE: {
    title: 'POS Retail Counter Sale',
    shortCode: 'POS',
    icon: 'point_of_sale',
    description: 'Quick barcode POS cash receipt',
  },
  ESTIMATE: {
    title: 'Quotation / Estimate',
    shortCode: 'EST',
    icon: 'request_quote',
    description: 'Quotation, price estimation, and proforma invoices',
  },
  DELIVERY_CHALLAN: {
    title: 'Delivery Challan',
    shortCode: 'DC',
    icon: 'local_shipping',
    description: 'Goods transit dispatch under GST Rule 55',
  },
  CREDIT_NOTE: {
    title: 'Credit Note',
    shortCode: 'CN',
    icon: 'assignment_return',
    description: 'Sales return / discount credit note (Table 9B)',
  },
  DEBIT_NOTE: {
    title: 'Debit Note',
    shortCode: 'DN',
    icon: 'post_add',
    description: 'Supplemental charge / price revision debit note',
  },
  PURCHASE_BILL: {
    title: 'Purchase Bill / PO',
    shortCode: 'PUR',
    icon: 'shopping_cart',
    description: 'Inward vendor procurement bill & purchase order',
  },
  PAYMENT_RECEIPT: {
    title: 'Receipt / Payment Voucher',
    shortCode: 'REC',
    icon: 'payments',
    description: 'Cash / Bank money receipt voucher',
  },
};

export const DEFAULT_SERIES_CONFIGS: Record<DocumentSeriesType, DocumentSeriesConfig> = {
  SALES_INVOICE: {
    prefix: 'INV',
    separator: '-',
    yearFormat: 'YYYY',
    paddingDigits: 4,
    startingNumber: 1,
  },
  POS_INVOICE: {
    prefix: 'POS',
    separator: '-',
    yearFormat: 'NONE',
    paddingDigits: 4,
    startingNumber: 1,
  },
  ESTIMATE: {
    prefix: 'EST',
    separator: '-',
    yearFormat: 'YYYY',
    paddingDigits: 4,
    startingNumber: 1,
  },
  DELIVERY_CHALLAN: {
    prefix: 'DC',
    separator: '/',
    yearFormat: 'YY_YY',
    paddingDigits: 4,
    startingNumber: 1,
  },
  CREDIT_NOTE: {
    prefix: 'CN',
    separator: '-',
    yearFormat: 'YYYY',
    paddingDigits: 4,
    startingNumber: 1,
  },
  DEBIT_NOTE: {
    prefix: 'DN',
    separator: '-',
    yearFormat: 'YYYY',
    paddingDigits: 4,
    startingNumber: 1,
  },
  PURCHASE_BILL: {
    prefix: 'PUR',
    separator: '-',
    yearFormat: 'YYYY',
    paddingDigits: 4,
    startingNumber: 1,
  },
  PAYMENT_RECEIPT: {
    prefix: 'REC',
    separator: '-',
    yearFormat: 'NONE',
    paddingDigits: 4,
    startingNumber: 1,
  },
};

/**
 * Returns Indian Financial Year string, e.g. "26-27" if date is in FY 2026-27 (Apr 1, 2026 - Mar 31, 2027)
 */
export function getFinancialYearString(date: Date = new Date()): string {
  const month = date.getMonth(); // 0 = Jan, 3 = Apr
  const fullYear = date.getFullYear();
  const startYear = month >= 3 ? fullYear : fullYear - 1;
  const endYear = startYear + 1;
  const yy1 = String(startYear).slice(-2);
  const yy2 = String(endYear).slice(-2);
  return `${yy1}-${yy2}`;
}

/**
 * Formats a document number based on series configuration
 */
export function formatDocumentNumberPreview(
  config: DocumentSeriesConfig,
  sequence: number,
  date: Date = new Date()
): string {
  const prefix = (config.prefix || '').trim();
  const sep = config.separator ?? '-';
  let yearPart = '';

  if (config.yearFormat === 'YYYY') {
    yearPart = `${date.getFullYear()}`;
  } else if (config.yearFormat === 'YY_YY') {
    yearPart = getFinancialYearString(date);
  }

  const pad = Math.max(1, Math.min(8, config.paddingDigits || 4));
  const numPart = String(Math.max(1, sequence)).padStart(pad, '0');

  let result = prefix;
  if (yearPart) {
    if (result && sep) result += sep;
    result += yearPart;
  }
  if (result && sep) result += sep;
  result += numPart;
  return result;
}

/**
 * Resolves the active series configuration for a document type.
 * Respects custom settings in company.documentSeries, with fallback to legacy company.invoicePrefix or defaults.
 */
export function getDocumentSeriesConfig(
  company: Partial<CompanyProfile> | undefined,
  docType: DocumentSeriesType
): DocumentSeriesConfig {
  const userConfig = company?.documentSeries?.[docType];
  if (userConfig) {
    return {
      prefix: userConfig.prefix?.trim() || DEFAULT_SERIES_CONFIGS[docType].prefix,
      separator: userConfig.separator ?? DEFAULT_SERIES_CONFIGS[docType].separator,
      yearFormat: userConfig.yearFormat || DEFAULT_SERIES_CONFIGS[docType].yearFormat,
      paddingDigits: userConfig.paddingDigits || DEFAULT_SERIES_CONFIGS[docType].paddingDigits,
      startingNumber: userConfig.startingNumber ?? DEFAULT_SERIES_CONFIGS[docType].startingNumber,
    };
  }

  // Backwards compatibility for SALES_INVOICE: parse legacy invoicePrefix if defined
  if (docType === 'SALES_INVOICE' && company?.invoicePrefix) {
    const raw = company.invoicePrefix.trim();
    // If raw looks like "INV-2026-" or "INV-"
    const matchYear = raw.match(/^(.*?)[-/](\d{4})[-/]?$/);
    if (matchYear) {
      return {
        prefix: matchYear[1] || 'INV',
        separator: raw.includes('/') ? '/' : '-',
        yearFormat: 'YYYY',
        paddingDigits: 4,
        startingNumber: 1,
      };
    }
    const cleanPfx = raw.replace(/[-/.]+$/, '');
    const sep: SeriesSeparator = raw.endsWith('/') ? '/' : raw.endsWith('.') ? '.' : raw.endsWith('-') ? '-' : '';
    return {
      prefix: cleanPfx || 'INV',
      separator: sep || '-',
      yearFormat: 'YYYY',
      paddingDigits: 4,
      startingNumber: 1,
    };
  }

  return { ...DEFAULT_SERIES_CONFIGS[docType] };
}

/**
 * Generates the next sequential unique number for any document type according to its configured series.
 */
export function generateNextDocumentNumber(
  docType: DocumentSeriesType,
  company: Partial<CompanyProfile> | undefined,
  existingInvoices: InvoiceLike[] = [],
  date: Date = new Date()
): string {
  const config = getDocumentSeriesConfig(company, docType);
  const prefix = (config.prefix || '').trim();
  const sep = config.separator ?? '-';
  let yearPart = '';

  if (config.yearFormat === 'YYYY') {
    yearPart = `${date.getFullYear()}`;
  } else if (config.yearFormat === 'YY_YY') {
    yearPart = getFinancialYearString(date);
  }

  // Construct base prefix regex pattern
  let baseRegexStr = `^${escapeRegExp(prefix)}`;
  if (yearPart) {
    if (prefix && sep) {
      baseRegexStr += escapeRegExp(sep);
    }
    baseRegexStr += escapeRegExp(yearPart);
  }
  if ((prefix || yearPart) && sep) {
    baseRegexStr += escapeRegExp(sep);
  }
  baseRegexStr += `(\\d+)$`;

  const regex = new RegExp(baseRegexStr, 'i');

  // Existing numbers set for collision avoidance
  const existingSet = new Set<string>();
  existingInvoices.forEach((inv) => {
    if (inv.invoiceNumber) {
      existingSet.add(normalizeInvoiceNumber(inv.invoiceNumber));
    }
  });

  let maxSeq = 0;
  existingInvoices.forEach((inv) => {
    const raw = inv.invoiceNumber ? inv.invoiceNumber.trim() : '';
    if (!raw) return;
    const m = raw.match(regex);
    if (m && m[1]) {
      const s = parseInt(m[1], 10);
      if (!isNaN(s) && s > maxSeq) {
        maxSeq = s;
      }
    }
  });

  const padLen = Math.max(1, Math.min(8, config.paddingDigits || 4));
  let candidateSeq = Math.max(config.startingNumber || 1, maxSeq + 1);

  while (true) {
    const candidate = formatDocumentNumberPreview(config, candidateSeq, date);
    if (!existingSet.has(normalizeInvoiceNumber(candidate))) {
      return candidate;
    }
    candidateSeq++;
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

