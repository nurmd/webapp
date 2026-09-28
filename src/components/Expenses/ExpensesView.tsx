import React, { useState } from 'react';
import { Expense, ExpenseCategory } from '../../models/expense.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import {
  Receipt,
  Plus,
  Trash2,
  Filter,
  CheckCircle,
  XCircle,
  ArrowDownRight,
  TrendingDown,
  Building,
  CreditCard,
  FileSpreadsheet,
} from 'lucide-react';

interface ExpensesViewProps {
  expenses: Expense[];
  onSaveExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
}

const CATEGORIES: ExpenseCategory[] = [
  'Rent & Utilities',
  'Electricity & Water',
  'Transport & Logistics',
  'Salaries & Wages',
  'Packaging & Courier',
  'Repairs & Maintenance',
  'Tea, Coffee & Refreshments',
  'Marketing & Advertising',
  'Software & Telecom',
  'General Operational',
];

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  expenses,
  onSaveExpense,
  onDeleteExpense,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Expense form state
  const [category, setCategory] = useState<ExpenseCategory>('General Operational');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(18);
  const [paymentMode, setPaymentMode] = useState<Expense['paymentMode']>('UPI');
  const [vendorName, setVendorName] = useState('');
  const [vendorGstin, setVendorGstin] = useState('');
  const [voucherNumber, setVoucherNumber] = useState('');
  const [itcEligible, setItcEligible] = useState(true);
  const [notes, setNotes] = useState('');

  // Calculations
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalItcClaimable = expenses
    .filter((e) => e.itcEligible)
    .reduce((sum, e) => sum + e.taxAmount, 0);
  const cashExpenses = expenses
    .filter((e) => e.paymentMode === 'CASH')
    .reduce((sum, e) => sum + e.amount, 0);

  const filteredExpenses = selectedCategory === 'ALL'
    ? expenses
    : expenses.filter((e) => e.category === selectedCategory);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || amount <= 0) {
      alert('Please enter a valid expense title and amount.');
      return;
    }

    // Auto tax breakdown
    const taxable = gstRate > 0 ? (amount * 100) / (100 + gstRate) : amount;
    const tax = amount - taxable;
    const halfTax = tax / 2;

    const newExpense: Expense = {
      id: 'EXP-' + Date.now(),
      category,
      title: title.trim(),
      amount,
      taxableAmount: Math.round(taxable * 100) / 100,
      gstRate,
      taxAmount: Math.round(tax * 100) / 100,
      cgstAmount: Math.round(halfTax * 100) / 100,
      sgstAmount: Math.round(halfTax * 100) / 100,
      igstAmount: 0,
      date: new Date().toISOString().split('T')[0],
      paymentMode,
      vendorName: vendorName.trim() || undefined,
      vendorGstin: vendorGstin.trim().toUpperCase() || undefined,
      voucherNumber: voucherNumber.trim() || undefined,
      itcEligible,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    onSaveExpense(newExpense);
    setIsModalOpen(false);
    // Reset
    setTitle('');
    setAmount(0);
    setVendorName('');
    setVendorGstin('');
    setVoucherNumber('');
    setNotes('');
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header & Quick Action */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Receipt style={{ color: '#ef4444' }} />
            Business Expenses & Overhead
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Track indirect operational costs, utilities, and claim eligible Input Tax Credit (ITC).
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: '#ef4444',
            color: '#ffffff',
            padding: '0.625rem 1.25rem',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
          }}
        >
          <Plus size={18} />
          Record Expense
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <div style={{
          backgroundColor: '#1e293b',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              Total Expenses
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>
              {formatINR(totalExpenses)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '4px' }}>
              {expenses.length} expense vouchers logged
            </div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
            <TrendingDown size={22} />
          </div>
        </div>

        <div style={{
          backgroundColor: '#1e293b',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              Claimable ITC (GSTR-3B)
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
              {formatINR(totalItcClaimable)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6ee7b7', marginTop: '4px' }}>
              Eligible GST input credit
            </div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
            <CheckCircle size={22} />
          </div>
        </div>

        <div style={{
          backgroundColor: '#1e293b',
          padding: '1.25rem',
          borderRadius: '12px',
          border: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              Cash Outflow
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
              {formatINR(cashExpenses)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#fcd34d', marginTop: '4px' }}>
              Petty cash disbursements
            </div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
            <CreditCard size={22} />
          </div>
        </div>
      </div>

      {/* Category Pills */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setSelectedCategory('ALL')}
          style={{
            padding: '0.4rem 0.85rem',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            backgroundColor: selectedCategory === 'ALL' ? '#3b82f6' : '#1e293b',
            color: selectedCategory === 'ALL' ? '#ffffff' : '#94a3b8',
            whiteSpace: 'nowrap',
          }}
        >
          All ({expenses.length})
        </button>
        {CATEGORIES.map((cat) => {
          const count = expenses.filter((e) => e.category === cat).length;
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                backgroundColor: isSelected ? '#3b82f6' : '#1e293b',
                color: isSelected ? '#ffffff' : '#94a3b8',
                whiteSpace: 'nowrap',
              }}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Expenses List Table */}
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '12px',
        border: '1px solid #334155',
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '0.85rem 1rem' }}>Date & Voucher</th>
                <th style={{ padding: '0.85rem 1rem' }}>Title & Category</th>
                <th style={{ padding: '0.85rem 1rem' }}>Vendor / Payee</th>
                <th style={{ padding: '0.85rem 1rem' }}>Mode</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>GST & ITC</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Total Amount</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
                    No expenses found in this category.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr
                    key={exp.id}
                    style={{
                      borderBottom: '1px solid #334155',
                      color: '#f8fafc',
                      transition: 'background-color 0.15s',
                    }}
                  >
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 600 }}>{formatDate(exp.date)}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{exp.voucherNumber || exp.id}</div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 600 }}>{exp.title}</div>
                      <span style={{
                        fontSize: '0.7rem',
                        backgroundColor: '#334155',
                        color: '#cbd5e1',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        display: 'inline-block',
                        marginTop: '2px',
                      }}>
                        {exp.category}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div>{exp.vendorName || '—'}</div>
                      {exp.vendorGstin && (
                        <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>GSTIN: {exp.vendorGstin}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: exp.paymentMode === 'CASH' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        color: exp.paymentMode === 'CASH' ? '#f59e0b' : '#60a5fa',
                      }}>
                        {exp.paymentMode}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <div>{exp.gstRate}% GST ({formatINR(exp.taxAmount)})</div>
                      <div style={{ fontSize: '0.75rem', color: exp.itcEligible ? '#10b981' : '#64748b' }}>
                        {exp.itcEligible ? '✓ ITC Eligible' : '✗ ITC Ineligible'}
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, fontSize: '0.95rem' }}>
                      {formatINR(exp.amount)}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                      <button
                        onClick={() => onDeleteExpense(exp.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '0.35rem',
                          borderRadius: '4px',
                        }}
                        title="Delete expense"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Expense Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '12px',
            border: '1px solid #334155',
            width: '100%',
            maxWidth: '520px',
            padding: '1.5rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 1rem 0' }}>
              Record New Expense
            </h3>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  style={{
                    width: '100%',
                    padding: '0.625rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.875rem',
                  }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                  Expense Description / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Warehouse Rent Oct 2024"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.625rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Total Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="0.00"
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                      fontWeight: 700,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                    GST Tax Rate (%)
                  </label>
                  <select
                    value={gstRate}
                    onChange={(e) => setGstRate(parseFloat(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value={0}>0% (Exempt)</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Payment Mode
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value="UPI">UPI / QR Code</option>
                    <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                    <option value="CASH">Cash</option>
                    <option value="CREDIT_CARD">Credit / Debit Card</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Voucher / Bill No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. VR-2024-01"
                    value={voucherNumber}
                    onChange={(e) => setVoucherNumber(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Vendor / Payee Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Landlord or Supplier"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Vendor GSTIN (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="15-character GSTIN"
                    maxLength={15}
                    value={vendorGstin}
                    onChange={(e) => setVendorGstin(e.target.value.toUpperCase())}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              </div>

              {/* ITC Checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '6px' }}>
                <input
                  type="checkbox"
                  id="itcEligible"
                  checked={itcEligible}
                  onChange={(e) => setItcEligible(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="itcEligible" style={{ fontSize: '0.85rem', color: '#f8fafc', cursor: 'pointer' }}>
                  Eligible for GST Input Tax Credit (ITC Claim in GSTR-3B)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '0.625rem 1rem',
                    backgroundColor: 'transparent',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '0.625rem 1.25rem',
                    backgroundColor: '#ef4444',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
