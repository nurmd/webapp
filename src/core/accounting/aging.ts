/**
 * Aging Engine for Accounts Receivable & Accounts Payable
 * Part of Milestone 2: Accounting Depth & Statutory Integrity
 */

import { addPaise, fromPaise, toPaise } from '../money.ts';

export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';

export interface AgingBracket {
  bucket: AgingBucket;
  amount: number;
  count: number;
}

export interface AgingItemInput {
  dueDate?: string;
  date: string;
  balanceDue: number;
  partyId?: string;
  partyName: string;
  phone?: string;
}

export interface PartyAgingRow {
  partyId: string;
  partyName: string;
  phone?: string;
  totalOutstanding: number;
  brackets: {
    '0-30': number;
    '31-60': number;
    '61-90': number;
    '90+': number;
  };
  billCount?: number;
}

export interface AgingBreakdownResult {
  summary: Record<AgingBucket, number>;
  parties: PartyAgingRow[];
  totalOutstanding: number;
  counts: Record<AgingBucket, number>;
}

/**
 * Normalizes date string (YYYY-MM-DD or ISO) to UTC midnight timestamp.
 */
function parseUtcMidnight(dateStr: string): number {
  if (!dateStr) return NaN;
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length !== 3) return NaN;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return NaN;
  return Date.UTC(y, m, d);
}

/**
 * Normalizes a Date instance to UTC midnight timestamp using local calendar components.
 */
function getAsOfUtcMidnight(asOfDate: Date = new Date()): number {
  return Date.UTC(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate());
}

/**
 * Determines aging bucket based on elapsed days since reference date.
 * - days <= 30: '0-30' (includes current / future due dates)
 * - 31 to 60: '31-60'
 * - 61 to 90: '61-90'
 * - > 90: '90+'
 */
export function getAgingBucket(days: number): AgingBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

/**
 * Returns the number of days a document is overdue past its due date.
 * If not overdue or due today/in future, returns 0.
 */
export function getOverdueDays(dueDateStr?: string, asOfDate: Date = new Date()): number {
  if (!dueDateStr) return 0;
  const dueUtc = parseUtcMidnight(dueDateStr);
  if (isNaN(dueUtc)) return 0;
  const asOfUtc = getAsOfUtcMidnight(asOfDate);
  const diffDays = Math.floor((asOfUtc - dueUtc) / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

interface PartyAgingAccumulator {
  partyId: string;
  partyName: string;
  phone?: string;
  totalOutstanding: number;
  brackets: {
    '0-30': number;
    '31-60': number;
    '61-90': number;
    '90+': number;
  };
  billCount?: number;
}

/**
 * Computes receivables or payables aging breakdown across all parties and aging buckets.
 * Filters out settled documents (balanceDue <= 0.01).
 * Falls back to document date if dueDate is omitted.
 */
export function computeAgingBreakdown(
  items: AgingItemInput[],
  asOfDate: Date = new Date()
): AgingBreakdownResult {
  const summaryPaise: Record<AgingBucket, number> = {
    '0-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
  };

  const counts: Record<AgingBucket, number> = {
    '0-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
  };

  const partyMap: Map<string, PartyAgingAccumulator> = new Map();
  const asOfUtc = getAsOfUtcMidnight(asOfDate);

  for (const item of items) {
    const balancePaise = toPaise(item.balanceDue || 0);
    // Ignore settled documents (<= 1 paise)
    if (balancePaise <= 1) continue;

    const refDateStr = item.dueDate || item.date;
    const refUtc = parseUtcMidnight(refDateStr);
    const diffDays = isNaN(refUtc) ? 0 : Math.floor((asOfUtc - refUtc) / (1000 * 60 * 60 * 24));
    const bucket = getAgingBucket(diffDays);

    summaryPaise[bucket] = addPaise(summaryPaise[bucket], balancePaise);
    counts[bucket] += 1;

    const partyKey = item.partyId || item.partyName || 'UNKNOWN';
    let partyRow = partyMap.get(partyKey);
    if (!partyRow) {
      partyRow = {
        partyId: item.partyId || partyKey,
        partyName: item.partyName || 'Unknown Party',
        phone: item.phone,
        totalOutstanding: 0,
        brackets: {
          '0-30': 0,
          '31-60': 0,
          '61-90': 0,
          '90+': 0,
        },
        billCount: 0,
      };
      partyMap.set(partyKey, partyRow);
    }

    partyRow.brackets[bucket] = addPaise(partyRow.brackets[bucket], balancePaise);
    partyRow.totalOutstanding = addPaise(partyRow.totalOutstanding, balancePaise);
    partyRow.billCount = (partyRow.billCount || 0) + 1;
    if (!partyRow.phone && item.phone) {
      partyRow.phone = item.phone;
    }
  }

  const totalOutstandingPaise = addPaise(
    addPaise(summaryPaise['0-30'], summaryPaise['31-60']),
    addPaise(summaryPaise['61-90'], summaryPaise['90+'])
  );

  const summary: Record<AgingBucket, number> = {
    '0-30': fromPaise(summaryPaise['0-30']),
    '31-60': fromPaise(summaryPaise['31-60']),
    '61-90': fromPaise(summaryPaise['61-90']),
    '90+': fromPaise(summaryPaise['90+']),
  };

  const parties: PartyAgingRow[] = Array.from(partyMap.values())
    .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
    .map((row) => ({
      partyId: row.partyId,
      partyName: row.partyName,
      phone: row.phone,
      totalOutstanding: fromPaise(row.totalOutstanding),
      brackets: {
        '0-30': fromPaise(row.brackets['0-30']),
        '31-60': fromPaise(row.brackets['31-60']),
        '61-90': fromPaise(row.brackets['61-90']),
        '90+': fromPaise(row.brackets['90+']),
      },
      billCount: row.billCount,
    }));

  return {
    summary,
    parties,
    totalOutstanding: fromPaise(totalOutstandingPaise),
    counts,
  };
}
