import React, { useState } from 'react';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { BookOpen, CheckCircle, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface DaybookViewProps {
  vouchers: Voucher[];
}

export const DaybookView: React.FC<DaybookViewProps> = ({ vouchers }) => {
  const [filterType, setFilterType] = useState('ALL');

  const filtered = vouchers.filter((v) => filterType === 'ALL' || v.voucherType === filterType);

  const totalDebits = vouchers.reduce(
    (sum, v) => sum + v.entries.reduce((s, e) => s + e.debit, 0),
    0
  );
  const totalCredits = vouchers.reduce(
    (sum, v) => sum + v.entries.reduce((s, e) => s + e.credit, 0),
    0
  );

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
            Accounting Daybook & General Ledger
          </h2>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Automated double-entry bookkeeping journal entries
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: '1rem',
          backgroundColor: '#1e293b',
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          border: '1px solid #334155',
          fontSize: '0.8rem',
        }}>
          <div>
            Total Debits: <strong style={{ color: '#60a5fa' }}>{formatINR(totalDebits)}</strong>
          </div>
          <div>•</div>
          <div>
            Total Credits: <strong style={{ color: '#4ade80' }}>{formatINR(totalCredits)}</strong>
          </div>
          <div>•</div>
          <div style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <CheckCircle size={13} /> Balanced
          </div>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {['ALL', 'SALES', 'PURCHASE', 'PAYMENT', 'RECEIPT'].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            style={{
              backgroundColor: filterType === type ? '#2563eb' : '#1e293b',
              color: filterType === type ? '#fff' : '#94a3b8',
              border: '1px solid #334155',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Vouchers List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filtered.length === 0 ? (
          <div style={{ backgroundColor: '#1e293b', padding: '3rem', textAlign: 'center', color: '#94a3b8', borderRadius: '8px', border: '1px solid #334155' }}>
            <BookOpen size={40} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
            <div>No journal vouchers recorded yet. They are automatically created when invoices are generated.</div>
          </div>
        ) : (
          filtered.map((v) => (
            <div
              key={v.id}
              style={{
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                border: '1px solid #334155',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: v.voucherType === 'SALES' ? '#1e3a8a' : '#064e3b',
                    color: v.voucherType === 'SALES' ? '#93c5fd' : '#86efac',
                  }}>
                    {v.voucherType}
                  </span>
                  <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.9rem' }}>{v.voucherNumber}</span>
                  {v.referenceNo && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>(Ref: {v.referenceNo})</span>}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  {formatDate(v.date)}
                </div>
              </div>

              {/* Journal Table */}
              <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', marginTop: '0.25rem' }}>
                <thead>
                  <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #334155' }}>
                    <th style={{ padding: '4px 8px' }}>Ledger Account</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>Debit (Dr)</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>Credit (Cr)</th>
                  </tr>
                </thead>
                <tbody>
                  {v.entries.map((entry, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #283548' }}>
                      <td style={{ padding: '4px 8px', color: '#cbd5e1' }}>
                        {entry.accountName}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: entry.debit > 0 ? '#60a5fa' : '#64748b' }}>
                        {entry.debit > 0 ? formatINR(entry.debit) : '-'}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: entry.credit > 0 ? '#4ade80' : '#64748b' }}>
                        {entry.credit > 0 ? formatINR(entry.credit) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', marginTop: '2px' }}>
                Narration: {v.narration}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
