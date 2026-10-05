/**
 * Date Filtering & Preset Calculation Utilities for Indian Accounting & GST Ledgers
 */

export type DatePreset =
  | 'ALL_TIME'
  | 'TODAY'
  | 'YESTERDAY'
  | 'THIS_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'THIS_QUARTER'
  | 'THIS_FY'
  | 'CUSTOM';

export interface DateFilterRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  label: string;
}

export function getDateFilterBounds(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string
): DateFilterRange {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const todayStr = toYMD(now);
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1; // 1 to 12

  switch (preset) {
    case 'TODAY':
      return { start: todayStr, end: todayStr, label: 'Today' };

    case 'YESTERDAY': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toYMD(y);
      return { start: yStr, end: yStr, label: 'Yesterday' };
    }

    case 'THIS_WEEK': {
      const day = now.getDay(); // 0 is Sunday
      const diffToMon = day === 0 ? -6 : 1 - day;
      const mon = new Date(now);
      mon.setDate(now.getDate() + diffToMon);
      return { start: toYMD(mon), end: todayStr, label: 'This Week' };
    }

    case 'THIS_MONTH': {
      const start = `${curYear}-${pad(curMonth)}-01`;
      const lastDay = new Date(curYear, curMonth, 0).getDate();
      return { start, end: `${curYear}-${pad(curMonth)}-${pad(lastDay)}`, label: 'This Month' };
    }

    case 'LAST_MONTH': {
      const lastMonthDate = new Date(curYear, now.getMonth() - 1, 1);
      const lmYear = lastMonthDate.getFullYear();
      const lmMonth = lastMonthDate.getMonth() + 1;
      const lastDay = new Date(lmYear, lmMonth, 0).getDate();
      return {
        start: `${lmYear}-${pad(lmMonth)}-01`,
        end: `${lmYear}-${pad(lmMonth)}-${pad(lastDay)}`,
        label: 'Last Month',
      };
    }

    case 'THIS_QUARTER': {
      let qStartM = 1;
      let qEndM = 3;
      let qName = 'Q4';
      if (curMonth >= 4 && curMonth <= 6) {
        qStartM = 4;
        qEndM = 6;
        qName = 'Q1';
      } else if (curMonth >= 7 && curMonth <= 9) {
        qStartM = 7;
        qEndM = 9;
        qName = 'Q2';
      } else if (curMonth >= 10 && curMonth <= 12) {
        qStartM = 10;
        qEndM = 12;
        qName = 'Q3';
      }
      const qYear = curYear;
      const lastDay = new Date(qYear, qEndM, 0).getDate();
      return {
        start: `${qYear}-${pad(qStartM)}-01`,
        end: `${qYear}-${pad(qEndM)}-${pad(lastDay)}`,
        label: `This Quarter (${qName})`,
      };
    }

    case 'THIS_FY': {
      const fyStartYear = curMonth >= 4 ? curYear : curYear - 1;
      const fyEndYear = fyStartYear + 1;
      return {
        start: `${fyStartYear}-04-01`,
        end: `${fyEndYear}-03-31`,
        label: `FY ${fyStartYear}-${String(fyEndYear).slice(-2)}`,
      };
    }

    case 'CUSTOM': {
      let label = 'Custom Range';
      if (customStart && customEnd) {
        label = `${customStart} to ${customEnd}`;
      } else if (customStart) {
        label = `From ${customStart}`;
      } else if (customEnd) {
        label = `Until ${customEnd}`;
      }
      return {
        start: customStart || '',
        end: customEnd || '',
        label,
      };
    }

    case 'ALL_TIME':
    default:
      return { start: '', end: '', label: 'All Time' };
  }
}

/**
 * Checks whether an ISO or YYYY-MM-DD date string falls within start and end bounds
 */
export function isDateInRange(dateStr: string, start?: string, end?: string): boolean {
  if (!dateStr) return false;
  const target = dateStr.slice(0, 10);
  if (start && target < start) return false;
  if (end && target > end) return false;
  return true;
}

export type LedgerSortOption =
  | 'NEWEST'
  | 'OLDEST'
  | 'AMOUNT_HIGH'
  | 'AMOUNT_LOW'
  | 'NAME_AZ'
  | 'NAME_ZA'
  | 'DOC_NUM';

export const LEDGER_SORT_LABELS: Record<LedgerSortOption, string> = {
  NEWEST: 'Newest First (Default)',
  OLDEST: 'Oldest First',
  AMOUNT_HIGH: 'Amount: High to Low',
  AMOUNT_LOW: 'Amount: Low to High',
  NAME_AZ: 'Party Name: A to Z',
  NAME_ZA: 'Party Name: Z to A',
  DOC_NUM: 'Doc / Invoice Number',
};
