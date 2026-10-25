import type { BankAccount, UnifiedLedgerEntry } from '../../models/bankAccount.ts';
import type { CashBankFinancialSummary } from './cashBankCalculator.ts';
import { formatINR } from '../utils/formatters.ts';

export interface ReconciliationIssue {
  code:
    | 'NEGATIVE_OPENING_BALANCE'
    | 'NEGATIVE_LEDGER_BALANCE'
    | 'NO_RECORDED_INFLOW'
    | 'UNCONFIGURED_ACCOUNT'
    | 'LEDGER_MISMATCH'
    | 'DUPLICATE_OUTFLOW_CANDIDATE';
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface ReconciliationBreakdown {
  source: 'SALE' | 'PURCHASE' | 'EXPENSE' | 'PARTY_RECEIPT' | 'PARTY_PAYMENT' | 'CONTRA' | 'DIRECT_IN' | 'DIRECT_OUT' | 'OTHER';
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  count: number;
}

export interface AccountReconciliation {
  accountId: string;
  accountName: string;
  accountType: 'CASH' | 'BANK' | 'UNKNOWN';
  isConfigured: boolean;
  openingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  netMovement: number;
  computedClosing: number;
  ledgerClosing: number;
  difference: number;
  entryCount: number;
  status: 'balanced' | 'negative' | 'review';
  issues: ReconciliationIssue[];
  breakdown: ReconciliationBreakdown[];
  explanation: string;
}

export interface DuplicateOutflowCandidate {
  accountId: string;
  accountName: string;
  date: string;
  amount: number;
  referenceNo: string;
  entryIds: string[];
  descriptions: string[];
}

export interface CashBankReconciliationReport {
  generatedAt: string;
  accounts: AccountReconciliation[];
  negativeAccountIds: string[];
  unconfiguredAccountIds: string[];
  duplicateCandidates: DuplicateOutflowCandidate[];
  totalLiquidBalance: number;
  totalCashBalance: number;
  totalBankBalance: number;
}

const SOURCE_LABELS: Record<string, string> = {
  SALE: 'Sales receipts',
  PURCHASE: 'Purchase payments',
  EXPENSE: 'Expenses',
  PARTY_RECEIPT: 'Party receipts (vouchers)',
  PARTY_PAYMENT: 'Party payments (vouchers)',
  CONTRA: 'Contra transfers',
  DIRECT_IN: 'Direct inflows',
  DIRECT_OUT: 'Direct outflows',
  OTHER: 'Other entries',
};

const ORDERED_SOURCES: Array<ReconciliationBreakdown['source']> = [
  'SALE',
  'PURCHASE',
  'EXPENSE',
  'PARTY_RECEIPT',
  'PARTY_PAYMENT',
  'CONTRA',
  'DIRECT_IN',
  'DIRECT_OUT',
  'OTHER',
];

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function buildCashBankReconciliation(params: {
  accounts: BankAccount[];
  summary: Pick<
    CashBankFinancialSummary,
    'accountBalances' | 'ledgerEntries' | 'totalLiquidBalance' | 'totalCashBalance' | 'totalBankBalance'
  >;
}): CashBankReconciliationReport {
  const accountsInput = params.accounts || [];
  const accountBalances = params.summary?.accountBalances || {};
  const ledgerEntries = params.summary?.ledgerEntries || [];

  // Track configured accounts
  const configuredAccountMap = new Map<string, BankAccount>();
  for (const acc of accountsInput) {
    if (acc && acc.id) {
      configuredAccountMap.set(acc.id, acc);
    }
  }

  // Find all distinct account IDs across configured accounts, balances, and ledger entries
  const allAccountIds = new Set<string>();
  for (const acc of accountsInput) {
    if (acc && acc.id) allAccountIds.add(acc.id);
  }
  for (const [accId, balance] of Object.entries(accountBalances)) {
    // computeCashBankSummary always creates a zero ACC_CASH placeholder when
    // no cash account is configured. Do not report that empty placeholder as
    // an unconfigured account; only include balances that actually hold money.
    if (accId && Math.abs(Number(balance) || 0) >= 0.005) {
      allAccountIds.add(accId);
    }
  }
  for (const entry of ledgerEntries) {
    if (entry && entry.accountId) allAccountIds.add(entry.accountId);
  }

  // Detect duplicate outflow candidates across ledger entries:
  // Only OUT entries that are not CONTRA, where at least two entries share the same
  // accountId, date, amount (2-decimal), and a non-empty normalized referenceNo.
  const duplicateCandidates: DuplicateOutflowCandidate[] = [];
  const duplicateCandidatesByAccount = new Map<string, DuplicateOutflowCandidate[]>();

  const outGroupMap = new Map<string, UnifiedLedgerEntry[]>();
  for (const entry of ledgerEntries) {
    if (!entry) continue;
    if (entry.flow === 'OUT' && entry.type !== 'CONTRA') {
      const ref = (entry.referenceNo || '').trim();
      if (!ref) continue; // Do not flag groups without a reference number
      const amtStr = round2(entry.amount || 0).toFixed(2);
      const groupKey = `${entry.accountId}||${entry.date || ''}||${amtStr}||${ref.toLowerCase()}`;
      const existing = outGroupMap.get(groupKey);
      if (existing) {
        existing.push(entry);
      } else {
        outGroupMap.set(groupKey, [entry]);
      }
    }
  }

  for (const group of outGroupMap.values()) {
    if (group.length >= 2) {
      const first = group[0];
      const configured = configuredAccountMap.get(first.accountId);
      const accountName = first.accountName || configured?.accountName || first.accountId;
      const candidate: DuplicateOutflowCandidate = {
        accountId: first.accountId,
        accountName,
        date: first.date || '',
        amount: round2(first.amount || 0),
        referenceNo: (first.referenceNo || '').trim(),
        entryIds: group.map((e) => e.id),
        descriptions: group.map((e) => e.description || e.counterpartyOrTitle || ''),
      };
      duplicateCandidates.push(candidate);

      const accCandidates = duplicateCandidatesByAccount.get(first.accountId) || [];
      accCandidates.push(candidate);
      duplicateCandidatesByAccount.set(first.accountId, accCandidates);
    }
  }

  // Build reconciliation per account
  const accountReconciliations: AccountReconciliation[] = [];
  const negativeAccountIds: string[] = [];
  const unconfiguredAccountIds: string[] = [];

  // Order: configured accounts in original order first, then unconfigured accounts
  const processedAccountIds = new Set<string>();
  const orderedIds: string[] = [];

  for (const acc of accountsInput) {
    if (acc && acc.id && !processedAccountIds.has(acc.id)) {
      processedAccountIds.add(acc.id);
      orderedIds.push(acc.id);
    }
  }

  for (const accId of allAccountIds) {
    if (!processedAccountIds.has(accId)) {
      processedAccountIds.add(accId);
      orderedIds.push(accId);
    }
  }

  for (const accId of orderedIds) {
    const configuredAcc = configuredAccountMap.get(accId);
    const isConfigured = Boolean(configuredAcc);

    // Entries for this account
    const entries = ledgerEntries.filter((e) => e && e.accountId === accId);
    const firstEntry = entries[0];

    const accountName = configuredAcc
      ? configuredAcc.accountName
      : (firstEntry?.accountName ||
        (accId === 'ACC_CASH'
          ? 'Cash in Hand'
          : accId === 'ACC_BANK_DEFAULT'
            ? 'Primary Bank Account'
            : accId));

    let accountType: 'CASH' | 'BANK' | 'UNKNOWN' = 'UNKNOWN';
    if (configuredAcc) {
      accountType = configuredAcc.accountType === 'CASH' ? 'CASH' : 'BANK';
    } else if (accId === 'ACC_CASH' || firstEntry?.category === 'CASH') {
      accountType = 'CASH';
    } else if (firstEntry?.category === 'BANK') {
      accountType = 'BANK';
    }

    const openingBalance = round2(isConfigured ? (configuredAcc?.openingBalance || 0) : 0);

    let totalInflow = 0;
    let totalOutflow = 0;
    const breakdownAgg: Record<string, { inflow: number; outflow: number; count: number }> = {};

    for (const e of entries) {
      const amt = e.amount || 0;
      const typeKey = (e.type && SOURCE_LABELS[e.type]) ? e.type : 'OTHER';
      if (!breakdownAgg[typeKey]) {
        breakdownAgg[typeKey] = { inflow: 0, outflow: 0, count: 0 };
      }
      breakdownAgg[typeKey].count += 1;

      if (e.flow === 'IN') {
        totalInflow += amt;
        breakdownAgg[typeKey].inflow += amt;
      } else if (e.flow === 'OUT') {
        totalOutflow += amt;
        breakdownAgg[typeKey].outflow += amt;
      }
    }

    totalInflow = round2(totalInflow);
    totalOutflow = round2(totalOutflow);
    const netMovement = round2(totalInflow - totalOutflow);
    const computedClosing = round2(openingBalance + totalInflow - totalOutflow);
    const ledgerClosing = round2(accountBalances[accId] ?? 0);

    let difference = round2(ledgerClosing - computedClosing);
    if (Math.abs(difference) < 0.005) {
      difference = 0;
    }

    const issues: ReconciliationIssue[] = [];

    if (!isConfigured) {
      unconfiguredAccountIds.push(accId);
      issues.push({
        code: 'UNCONFIGURED_ACCOUNT',
        severity: 'warning',
        message: 'Account is not configured in Bank Accounts list but has transactions or a balance.',
      });
    }

    if (openingBalance < 0) {
      issues.push({
        code: 'NEGATIVE_OPENING_BALANCE',
        severity: 'warning',
        message: `Opening balance is negative (${formatINR(openingBalance)}). Verify opening passbook statement.`,
      });
    }

    if (ledgerClosing < 0) {
      negativeAccountIds.push(accId);
      issues.push({
        code: 'NEGATIVE_LEDGER_BALANCE',
        severity: 'warning',
        message: `Closing balance is negative (${formatINR(ledgerClosing)}). This reflects net recorded outflows exceeding opening funds, not a calculation error.`,
      });

      if (totalInflow === 0) {
        issues.push({
          code: 'NO_RECORDED_INFLOW',
          severity: 'info',
          message: 'No inflows have been recorded for this account. Inflows may need to be added.',
        });
      }
    }

    if (Math.abs(difference) >= 0.005) {
      issues.push({
        code: 'LEDGER_MISMATCH',
        severity: 'critical',
        message: `Computed closing balance (${formatINR(computedClosing)}) differs from ledger closing balance (${formatINR(ledgerClosing)}) by ${formatINR(difference)}.`,
      });
    }

    const accCandidates = duplicateCandidatesByAccount.get(accId);
    if (accCandidates && accCandidates.length > 0) {
      issues.push({
        code: 'DUPLICATE_OUTFLOW_CANDIDATE',
        severity: 'warning',
        message: `Found ${accCandidates.length} candidate group(s) with matching outflow date, amount, and reference number for review.`,
      });
    }

    // Status: negative when ledgerClosing < 0; otherwise review when there is a ledger mismatch or unconfigured account; otherwise balanced
    let status: 'balanced' | 'negative' | 'review' = 'balanced';
    if (ledgerClosing < 0) {
      status = 'negative';
    } else if (Math.abs(difference) >= 0.005 || !isConfigured || (accCandidates && accCandidates.length > 0)) {
      status = 'review';
    } else {
      status = 'balanced';
    }

    // Explanation
    let explanation: string;
    const equationStr = `Opening (${formatINR(openingBalance)}) + Inflows (${formatINR(totalInflow)}) − Outflows (${formatINR(totalOutflow)}) = Closing (${formatINR(ledgerClosing)})`;
    if (ledgerClosing < 0) {
      explanation = `${equationStr}. This is a real ledger position from recorded entries, not a calculation error. Possible causes include unrecorded funding or receipts, duplicate payment entries, or genuine overspend.`;
    } else if (Math.abs(difference) >= 0.005) {
      explanation = `${equationStr}. Ledger closing differs from computed equation by ${formatINR(difference)}. Review ledger transactions.`;
    } else {
      explanation = `${equationStr}. Ledger is balanced.`;
    }

    // Source breakdown in ordered sequence
    const breakdown: ReconciliationBreakdown[] = [];
    for (const src of ORDERED_SOURCES) {
      const agg = breakdownAgg[src];
      if (agg && agg.count > 0) {
        breakdown.push({
          source: src,
          label: SOURCE_LABELS[src] || 'Other entries',
          inflow: round2(agg.inflow),
          outflow: round2(agg.outflow),
          net: round2(agg.inflow - agg.outflow),
          count: agg.count,
        });
      }
    }

    accountReconciliations.push({
      accountId: accId,
      accountName,
      accountType,
      isConfigured,
      openingBalance,
      totalInflow,
      totalOutflow,
      netMovement,
      computedClosing,
      ledgerClosing,
      difference,
      entryCount: entries.length,
      status,
      issues,
      breakdown,
      explanation,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    accounts: accountReconciliations,
    negativeAccountIds,
    unconfiguredAccountIds,
    duplicateCandidates,
    totalLiquidBalance: round2(params.summary?.totalLiquidBalance || 0),
    totalCashBalance: round2(params.summary?.totalCashBalance || 0),
    totalBankBalance: round2(params.summary?.totalBankBalance || 0),
  };
}

export function buildReconciliationCsvRows(
  report: CashBankReconciliationReport
): { headers: string[]; rows: (string | number)[][] } {
  const headers = [
    'Section',
    'Account ID',
    'Account / Entity Name',
    'Type / Source',
    'Opening Balance',
    'Inflow',
    'Outflow',
    'Net / Amount',
    'Closing Balance',
    'Status / Reference',
    'Issues / Details',
  ];

  const rows: (string | number)[][] = [];

  // 1. Account Summary Rows
  for (const acc of report.accounts) {
    const issueText = acc.issues.map((i) => `[${i.severity.toUpperCase()}] ${i.message}`).join('; ');
    const detailText = [acc.explanation, issueText].filter(Boolean).join(' | ') || 'No issues';
    rows.push([
      'Account Summary',
      acc.accountId,
      acc.accountName,
      acc.accountType,
      acc.openingBalance,
      acc.totalInflow,
      acc.totalOutflow,
      acc.netMovement,
      acc.ledgerClosing,
      acc.status,
      detailText,
    ]);
  }

  // 2. Source Breakdown Rows
  for (const acc of report.accounts) {
    for (const b of acc.breakdown) {
      rows.push([
        'Source Breakdown',
        acc.accountId,
        acc.accountName,
        b.label,
        '',
        b.inflow,
        b.outflow,
        b.net,
        '',
        `${b.count} entries`,
        '',
      ]);
    }
  }

  // 3. Duplicate Candidate Rows
  for (const dup of report.duplicateCandidates) {
    rows.push([
      'Duplicate Candidate',
      dup.accountId,
      dup.accountName,
      'Duplicate Candidate',
      '',
      '',
      '',
      dup.amount,
      '',
      `Ref: ${dup.referenceNo}`,
      `Date: ${dup.date}, Entries: ${dup.entryIds.join(', ')}`,
    ]);
  }

  return { headers, rows };
}
