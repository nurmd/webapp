import React from 'react';
import { Expense } from '../../models/expense.ts';
import { CompanyProfile } from '../../models/company.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { ExpenseDetailSheet } from '../Expenses/ExpenseDetailSheet.tsx';

export interface DashboardExpenseModalProps {
  expense: Expense | null;
  company: CompanyProfile;
  onClose: () => void;
}

export const DashboardExpenseModal: React.FC<DashboardExpenseModalProps> = ({
  expense,
  company,
  onClose,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, !!expense, 25);

  if (!expense) return null;

  return (
    <ExpenseDetailSheet
      expense={expense}
      company={company}
      onClose={onClose}
    />
  );
};
