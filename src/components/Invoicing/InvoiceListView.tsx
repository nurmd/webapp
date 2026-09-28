import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { Search, Plus, Eye, Trash2, Download, Printer } from 'lucide-react';

interface InvoiceListViewProps {
  invoices: Invoice[];
  onNewInvoice: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
}

export const InvoiceListView: React.FC<InvoiceListViewProps> = ({
  invoices,
  onNewInvoice,
  onViewInvoice,
  onDeleteInvoice,
}) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  const filtered = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.partyName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.partyGstin && inv.partyGstin.toLowerCase().includes(search.toLowerCase()));

    const matchesType = filterType === 'ALL' || inv.invoiceType === filterType;
    return matchesSearch && matchesType;
  });

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const headers = ['Invoice No', 'Date', 'Customer Name', 'GSTIN', 'Type', 'Taxable Value', 'Total Tax', 'Grand Total', 'Payment Mode'];
    const rows = filtered.map((inv) => [
      inv.invoiceNumber,
      formatDate(inv.date),
      `"${inv.partyName}"`,
      inv.partyGstin || '',
      inv.invoiceType,
      inv.totalTaxableAmount,
      inv.totalTax,
      inv.grandTotal,
      inv.paymentMode,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sales_register_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header and Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
            Sales Tax Invoices
          </h2>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Register of all outward GST supplies (B2B, B2CS, B2CL)
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={exportCsv}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              backgroundColor: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              padding: '0.5rem 0.85rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            <Download size={15} /> Export CSV
          </button>
          <button
            onClick={onNewInvoice}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 0.85rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            <Plus size={15} /> Create Invoice
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        padding: '0.75rem',
        borderRadius: '8px',
        border: '1px solid #334155',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, backgroundColor: '#0f172a', padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #334155' }}>
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search by Invoice #, Customer name, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              outline: 'none',
              width: '100%',
              fontSize: '0.85rem',
            }}
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            color: '#fff',
            padding: '0.45rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
          }}
        >
          <option value="ALL">All Types</option>
          <option value="B2B">B2B Only</option>
          <option value="B2CS">B2C Small</option>
          <option value="B2CL">B2C Large</option>
        </select>
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: '1px solid #334155',
        overflow: 'hidden',
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No matching invoices found.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Invoice #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Customer / Party</th>
                <th style={{ padding: '0.75rem 1rem' }}>GSTIN</th>
                <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Taxable</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>GST Tax</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Grand Total</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr
                  key={inv.id}
                  style={{
                    borderBottom: '1px solid #334155',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  onClick={() => onViewInvoice(inv)}
                >
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#60a5fa' }}>
                    {inv.invoiceNumber}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>
                    {formatDate(inv.date)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#f8fafc', fontWeight: 500 }}>
                    {inv.partyName}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                    {inv.partyGstin || <span style={{ color: '#64748b' }}>Unregistered</span>}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      backgroundColor: inv.invoiceType === 'B2B' ? '#1e3a8a' : '#14532d',
                      color: inv.invoiceType === 'B2B' ? '#93c5fd' : '#86efac',
                    }}>
                      {inv.invoiceType}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#cbd5e1' }}>
                    {formatINR(inv.totalTaxableAmount)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#cbd5e1' }}>
                    {formatINR(inv.totalTax)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                    {formatINR(inv.grandTotal)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onViewInvoice(inv)}
                        title="View & Print"
                        style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: '0.2rem' }}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => onDeleteInvoice(inv.id)}
                        title="Delete"
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.2rem' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
