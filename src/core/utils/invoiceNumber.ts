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

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
