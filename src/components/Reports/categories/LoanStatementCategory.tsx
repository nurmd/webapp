import React, { useState, useMemo, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Landmark,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import type { CompanyProfile } from '../../../models/company.ts';
import type { LoanAccount, LoanTransaction } from '../../../models/loan.ts';
import { formatINR } from '../../../core/utils/formatters.ts';
import { exportReportToCsv, printReportDocument } from '../utils/reportExportUtils.ts';
import { useBackNavigation } from '../../../core/utils/backNavigation.ts';

interface LoanStatementCategoryProps {
  company: CompanyProfile;
  loans: LoanAccount[];
  loanTransactions: LoanTransaction[];
  onSaveLoan?: (loan: LoanAccount) => void;
  onSaveLoanTransaction?: (txn: LoanTransaction) => void;
  searchQuery?: string;
  dateRangeLabel: string;
  onRegisterExportHandlers?: (handlers: { exportCsv?: () => void; exportPdf?: () => void }) => void;
}

export const LoanStatementCategory: React.FC<LoanStatementCategoryProps> = ({
  company,
  loans = [],
  loanTransactions = [],
  onSaveLoan,
  onSaveLoanTransaction,
  searchQuery = '',
  dateRangeLabel,
  onRegisterExportHandlers,
}) => {
  const [activeTab, setActiveTab] = useState<'LOANS_LIST' | 'REPAYMENT_SCHEDULE'>('LOANS_LIST');
  const [isAddLoanModalOpen, setIsAddLoanModalOpen] = useState(false);

  useBackNavigation(() => {
    setIsAddLoanModalOpen(false);
    return true;
  }, isAddLoanModalOpen, 20);

  // Form State for Adding New Loan
  const [newLoan, setNewLoan] = useState<Partial<LoanAccount>>({
    lenderName: '',
    accountNumber: '',
    loanType: 'TERM_LOAN',
    sanctionAmount: 500000,
    disbursedDate: new Date().toISOString().split('T')[0],
    interestRateAnnual: 10.5,
    tenorMonths: 36,
    emiAmount: 16250,
    currentPrincipalOutstanding: 500000,
    status: 'ACTIVE',
  });

  // Calculate Loan KPIs
  const kpis = useMemo(() => {
    let totalSanctioned = 0;
    let totalOutstanding = 0;
    let activeLoansCount = 0;

    for (const loan of loans) {
      totalSanctioned += loan.sanctionAmount || 0;
      if (loan.status === 'ACTIVE') {
        activeLoansCount++;
        totalOutstanding += loan.currentPrincipalOutstanding || 0;
      }
    }

    let totalPrincipalRepaid = 0;
    let totalInterestPaid = 0;
    for (const txn of loanTransactions) {
      totalPrincipalRepaid += txn.principalPaid || 0;
      totalInterestPaid += txn.interestPaid || 0;
    }

    return {
      totalSanctioned: Math.round(totalSanctioned * 100) / 100,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      activeLoansCount,
      totalPrincipalRepaid: Math.round(totalPrincipalRepaid * 100) / 100,
      totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
    };
  }, [loans, loanTransactions]);

  // Filtered loans based on search
  const filteredLoans = useMemo(() => {
    if (!searchQuery.trim()) return loans;
    const q = searchQuery.toLowerCase();
    return loans.filter(
      (l) =>
        l.lenderName.toLowerCase().includes(q) ||
        l.accountNumber?.toLowerCase().includes(q) ||
        l.loanType.toLowerCase().includes(q)
    );
  }, [loans, searchQuery]);

  // Register Export Handlers
  useEffect(() => {
    if (!onRegisterExportHandlers) return;

    const exportCsv = () => {
      const headers = ['Lender Name', 'Loan Type', 'A/C No', 'Sanction Amount', 'Disbursed Date', 'Interest Rate %', 'Tenor (Mo)', 'EMI (INR)', 'Principal Outstanding', 'Status'];
      const rows = filteredLoans.map((l) => [
        l.lenderName,
        l.loanType,
        l.accountNumber || '-',
        l.sanctionAmount,
        l.disbursedDate,
        `${l.interestRateAnnual}%`,
        l.tenorMonths,
        l.emiAmount || 0,
        l.currentPrincipalOutstanding,
        l.status,
      ]);
      exportReportToCsv(`LoanStatement_${Date.now()}`, headers, rows);
    };

    const exportPdf = () => {
      printReportDocument({
        title: 'Loan & Borrowings Statement',
        subtitle: `Schedule of Loans, EMIs & Outstanding Debt • ${dateRangeLabel}`,
        company,
        dateRangeLabel,
        kpis: [
          { label: 'Total Borrowed', value: formatINR(kpis.totalSanctioned) },
          { label: 'Active Debt Outstanding', value: formatINR(kpis.totalOutstanding) },
          { label: 'Principal Repaid', value: formatINR(kpis.totalPrincipalRepaid) },
          { label: 'Active Loans Count', value: String(kpis.activeLoansCount) },
        ],
        headers: ['Lender Name', 'Facility Type', 'A/C No', 'Sanction Amount', 'Interest Rate', 'Tenor', 'Monthly EMI', 'Outstanding Principal', 'Status'],
        rows: filteredLoans.map((l) => [
          l.lenderName,
          l.loanType.replace(/_/g, ' '),
          l.accountNumber || '-',
          formatINR(l.sanctionAmount),
          `${l.interestRateAnnual}%`,
          `${l.tenorMonths} Mo`,
          l.emiAmount ? formatINR(l.emiAmount) : '-',
          formatINR(l.currentPrincipalOutstanding),
          l.status,
        ]),
        columnAlignments: ['left', 'left', 'left', 'right', 'left', 'left', 'right', 'right', 'center'],
      });
    };

    onRegisterExportHandlers({ exportCsv, exportPdf });
  }, [filteredLoans, kpis, company, dateRangeLabel, onRegisterExportHandlers]);

  const handleCreateLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoan.lenderName?.trim() || !newLoan.sanctionAmount) return;

    const loanAccount: LoanAccount = {
      id: `loan-${Date.now()}`,
      lenderName: newLoan.lenderName.trim(),
      accountNumber: newLoan.accountNumber?.trim() || undefined,
      loanType: newLoan.loanType || 'TERM_LOAN',
      sanctionAmount: Number(newLoan.sanctionAmount) || 0,
      disbursedDate: newLoan.disbursedDate || new Date().toISOString().split('T')[0],
      interestRateAnnual: Number(newLoan.interestRateAnnual) || 10,
      tenorMonths: Number(newLoan.tenorMonths) || 36,
      emiAmount: Number(newLoan.emiAmount) || undefined,
      currentPrincipalOutstanding: Number(newLoan.currentPrincipalOutstanding || newLoan.sanctionAmount) || 0,
      collateralDetails: newLoan.collateralDetails || undefined,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveLoan?.(loanAccount);
    setIsAddLoanModalOpen(false);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Loan KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-surface-container-low p-3 sm:p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
          <div className="text-[11px] sm:text-xs text-on-surface-variant font-bold uppercase tracking-wide">
            Total Sanctioned Principal
          </div>
          <div className="text-sm sm:text-xl font-bold font-mono text-on-surface my-0.5 sm:my-1">
            {formatINR(kpis.totalSanctioned)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant truncate">
            Across {loans.length} loan accounts
          </div>
        </div>

        <div className="bg-surface-container-low p-3 sm:p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
          <div className="text-[11px] sm:text-xs text-on-surface-variant font-bold uppercase tracking-wide">
            Total Outstanding Debt
          </div>
          <div className="text-base sm:text-2xl font-extrabold font-mono text-rose-600 dark:text-rose-400 my-0.5 sm:my-1">
            {formatINR(kpis.totalOutstanding)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant truncate">
            {kpis.activeLoansCount} active loans
          </div>
        </div>

        <div className="bg-surface-container-low p-3 sm:p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
          <div className="text-[11px] sm:text-xs text-on-surface-variant font-bold uppercase tracking-wide">
            Principal Repaid
          </div>
          <div className="text-sm sm:text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 my-0.5 sm:my-1">
            {formatINR(kpis.totalPrincipalRepaid)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant truncate">
            Total principal settled
          </div>
        </div>

        <div className="bg-surface-container-low p-3 sm:p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
          <div className="text-[11px] sm:text-xs text-on-surface-variant font-bold uppercase tracking-wide">
            Interest Paid
          </div>
          <div className="text-sm sm:text-xl font-bold font-mono text-amber-600 dark:text-amber-400 my-0.5 sm:my-1">
            {formatINR(kpis.totalInterestPaid)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant truncate">
            Finance & borrowing cost
          </div>
        </div>
      </div>

      {/* Tabs & Add Loan Button */}
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/30 pb-3 flex-wrap">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('LOANS_LIST')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'LOANS_LIST'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface hover:bg-surface-container text-on-surface-variant'
            }`}
          >
            Loan Accounts ({loans.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('REPAYMENT_SCHEDULE')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'REPAYMENT_SCHEDULE'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface hover:bg-surface-container text-on-surface-variant'
            }`}
          >
            Repayment Ledger ({loanTransactions.length})
          </button>
        </div>

        {onSaveLoan && (
          <button
            type="button"
            onClick={() => setIsAddLoanModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all cursor-pointer"
          >
            <Plus size={14} />
            <span>Add Loan Account</span>
          </button>
        )}
      </div>

      {/* Active Loans Table */}
      {activeTab === 'LOANS_LIST' && (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/30 font-semibold">
                  <th className="py-3 px-4">Lender / Facility</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Sanction Amount</th>
                  <th className="py-3 px-4">Rate & Tenor</th>
                  <th className="py-3 px-4 text-right">Monthly EMI</th>
                  <th className="py-3 px-4 text-right">Outstanding Principal</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {filteredLoans.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-on-surface-variant">
                      No loan accounts recorded yet. Click &quot;Add Loan Account&quot; to track business borrowings.
                    </td>
                  </tr>
                ) : (
                  filteredLoans.map((loan) => (
                    <tr key={loan.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-on-surface">{loan.lenderName}</div>
                        {loan.accountNumber && (
                          <div className="text-[11px] font-mono text-on-surface-variant">A/C: {loan.accountNumber}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-container text-on-surface border border-outline-variant/20">
                          {loan.loanType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-on-surface">
                        {formatINR(loan.sanctionAmount)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-on-surface">{loan.interestRateAnnual}% p.a.</div>
                        <div className="text-[11px] text-on-surface-variant">{loan.tenorMonths} months</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-on-surface">
                        {loan.emiAmount ? formatINR(loan.emiAmount) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-extrabold text-rose-600 dark:text-rose-400">
                        {formatINR(loan.currentPrincipalOutstanding)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            loan.status === 'ACTIVE'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-surface-container text-on-surface-variant'
                          }`}
                        >
                          {loan.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Repayment Schedule / Ledger */}
      {activeTab === 'REPAYMENT_SCHEDULE' && (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/30 font-semibold">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4 text-right">Principal Paid</th>
                  <th className="py-3 px-4 text-right">Interest Paid</th>
                  <th className="py-3 px-4 text-right">Total Paid</th>
                  <th className="py-3 px-4 text-right">Remaining Principal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {loanTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-on-surface-variant">
                      No loan repayments or disbursements logged.
                    </td>
                  </tr>
                ) : (
                  loanTransactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="py-3 px-4 font-mono whitespace-nowrap text-on-surface">{txn.date}</td>
                      <td className="py-3 px-4 font-semibold text-on-surface">{txn.type}</td>
                      <td className="py-3 px-4 font-mono text-xs text-on-surface-variant">{txn.referenceNo || '-'}</td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatINR(txn.principalPaid)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-amber-600 dark:text-amber-400">
                        {formatINR(txn.interestPaid)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-on-surface">
                        {formatINR(txn.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-extrabold text-rose-600 dark:text-rose-400">
                        {formatINR(txn.remainingPrincipal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Loan Modal */}
      {isAddLoanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-3xl max-w-md w-full p-6 shadow-xl border border-outline-variant/40 space-y-4">
            <h3 className="text-lg font-bold text-on-surface m-0">Add Loan / Borrowing Facility</h3>
            <form onSubmit={handleCreateLoan} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-on-surface-variant block mb-1">
                  Lender / Bank Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HDFC Bank Business Loan"
                  value={newLoan.lenderName || ''}
                  onChange={(e) => setNewLoan({ ...newLoan, lenderName: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant/40 rounded-xl text-on-surface focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant block mb-1">
                    Facility Type
                  </label>
                  <select
                    value={newLoan.loanType}
                    onChange={(e) => setNewLoan({ ...newLoan, loanType: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant/40 rounded-xl text-on-surface"
                  >
                    <option value="TERM_LOAN">Term Loan</option>
                    <option value="WORKING_CAPITAL">Working Capital</option>
                    <option value="VEHICLE_LOAN">Vehicle Loan</option>
                    <option value="EQUIPMENT_LOAN">Equipment Loan</option>
                    <option value="DIRECTOR_LOAN">Director / Promoter Loan</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-on-surface-variant block mb-1">
                    Account / Loan No
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 5010023456"
                    value={newLoan.accountNumber || ''}
                    onChange={(e) => setNewLoan({ ...newLoan, accountNumber: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant/40 rounded-xl text-on-surface"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant block mb-1">
                    Sanction Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newLoan.sanctionAmount || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setNewLoan({
                        ...newLoan,
                        sanctionAmount: val,
                        currentPrincipalOutstanding: val,
                      });
                    }}
                    className="w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant/40 rounded-xl text-on-surface"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-on-surface-variant block mb-1">
                    Interest Rate (% p.a.)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newLoan.interestRateAnnual || ''}
                    onChange={(e) => setNewLoan({ ...newLoan, interestRateAnnual: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant/40 rounded-xl text-on-surface"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant block mb-1">
                    Tenor (Months)
                  </label>
                  <input
                    type="number"
                    value={newLoan.tenorMonths || ''}
                    onChange={(e) => setNewLoan({ ...newLoan, tenorMonths: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant/40 rounded-xl text-on-surface"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-on-surface-variant block mb-1">
                    Monthly EMI (₹)
                  </label>
                  <input
                    type="number"
                    value={newLoan.emiAmount || ''}
                    onChange={(e) => setNewLoan({ ...newLoan, emiAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm bg-surface-container-low border border-outline-variant/40 rounded-xl text-on-surface"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setIsAddLoanModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-on-surface-variant bg-surface hover:bg-surface-container rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-on-primary bg-primary rounded-xl shadow-xs hover:bg-primary/90 cursor-pointer"
                >
                  Save Loan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
