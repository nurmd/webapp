import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import {
  Search,
  Plus,
  Table,
  Receipt,
  FileCheck,
  Truck,
  RotateCcw,
  Eye,
  Trash2,
  Share2,
  Download,
} from 'lucide-react';

interface SalesHubViewProps {
  invoices: Invoice[];
  onOpenStandardInvoice: () => void;
  onOpenTableGridInvoice: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
}

export const SalesHubView: React.FC<SalesHubViewProps> = ({
  invoices,
  onOpenStandardInvoice,
  onOpenTableGridInvoice,
  onViewInvoice,
  onDeleteInvoice,
}) => {
  const [activeTab, setActiveTab] = useState<'INVOICES' | 'ESTIMATES' | 'CHALLANS' | 'CREDIT_NOTES'>('INVOICES');
  const [search, setSearch] = useState('');

  // Metrics
  const totalSales = invoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalTax = invoices.reduce((s, i) => s + i.totalTax, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const totalPending = invoices.reduce((s, i) => s + i.balanceAmount, 0);

  const filtered = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.partyName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.partyGstin && inv.partyGstin.toLowerCase().includes(search.toLowerCase()));

    if (activeTab === 'ESTIMATES') return matchesSearch && inv.invoiceType === 'ESTIMATE';
    if (activeTab === 'CHALLANS') return matchesSearch && inv.invoiceType === 'DELIVERY_CHALLAN';
    return matchesSearch && inv.invoiceType !== 'ESTIMATE' && inv.invoiceType !== 'DELIVERY_CHALLAN';
  });

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Banner & Quick Launchers */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#162035',
        padding: '1.25rem 1.5rem',
        borderRadius: '12px',
        border: '1px solid #273754',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
            Sales & Revenue Hub
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
            GST Sales Invoices, Quotations, Delivery Challans, and Receivables
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={onOpenTableGridInvoice}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: '#1d2a42',
              color: '#60a5fa',
              border: '1px solid #273754',
              padding: '0.5rem 0.9rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            <Table size={15} />
            Desktop Grid Mode
          </button>

          <button
            onClick={onOpenStandardInvoice}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: '#00875a',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            <Plus size={16} />
            New Tax Invoice
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div style={{ backgroundColor: '#162035', padding: '1.1rem', borderRadius: '8px', border: '1px solid #273754' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Total Invoiced</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>{formatINR(totalSales)}</div>
          <div style={{ fontSize: '0.75rem', color: '#6cf8bb', marginTop: '2px' }}>{invoices.length} transactions</div>
        </div>

        <div style={{ backgroundColor: '#162035', padding: '1.1rem', borderRadius: '8px', border: '1px solid #273754' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>GST Output Liability</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#60a5fa', marginTop: '4px' }}>{formatINR(totalTax)}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>CGST + SGST + IGST</div>
        </div>

        <div style={{ backgroundColor: '#162035', padding: '1.1rem', borderRadius: '8px', border: '1px solid #273754' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Collected Amount</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#6cf8bb', marginTop: '4px' }}>{formatINR(totalPaid)}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>Cash & Bank receipts</div>
        </div>

        <div style={{ backgroundColor: '#162035', padding: '1.1rem', borderRadius: '8px', border: '1px solid #273754' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Pending Receivables</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: totalPending > 0 ? '#f59e0b' : '#6cf8bb', marginTop: '4px' }}>
            {formatINR(totalPending)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>Outstanding from customers</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #273754', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('INVOICES')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: activeTab === 'INVOICES' ? '#2563eb' : 'transparent',
            color: activeTab === 'INVOICES' ? '#fff' : '#94a3b8',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          <Receipt size={15} /> Invoices ({invoices.filter((i) => i.invoiceType !== 'ESTIMATE' && i.invoiceType !== 'DELIVERY_CHALLAN').length})
        </button>

        <button
          onClick={() => setActiveTab('ESTIMATES')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: activeTab === 'ESTIMATES' ? '#2563eb' : 'transparent',
            color: activeTab === 'ESTIMATES' ? '#fff' : '#94a3b8',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          <FileCheck size={15} /> Quotations / Estimates
        </button>

        <button
          onClick={() => setActiveTab('CHALLANS')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: activeTab === 'CHALLANS' ? '#2563eb' : 'transparent',
            color: activeTab === 'CHALLANS' ? '#fff' : '#94a3b8',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          <Truck size={15} /> Delivery Challans
        </button>
      </div>

      {/* Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        backgroundColor: '#162035',
        padding: '0.5rem 0.85rem',
        borderRadius: '8px',
        border: '1px solid #273754',
      }}>
        <Search size={16} color="#94a3b8" />
        <input
          type="text"
          placeholder="Search by invoice number, party name, or GSTIN..."
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

      {/* Invoices List Table */}
      <div style={{ backgroundColor: '#162035', borderRadius: '8px', border: '1px solid #273754', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No sales documents found.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#0a0f1d', color: '#94a3b8', borderBottom: '1px solid #273754' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Invoice #</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Customer / Party</th>
                <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Taxable</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>GST Tax</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Grand Total</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr
                  key={inv.id}
                  style={{ borderBottom: '1px solid #1d2a42', cursor: 'pointer' }}
                  onClick={() => onViewInvoice(inv)}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1c273f')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#60a5fa' }}>{inv.invoiceNumber}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{formatDate(inv.date)}</td>
                  <td style={{ padding: '0.75rem 1rem', color: '#f8fafc', fontWeight: 600 }}>{inv.partyName}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      backgroundColor: inv.invoiceType === 'B2B' ? 'rgba(37, 99, 235, 0.2)' : 'rgba(0, 135, 90, 0.2)',
                      color: inv.invoiceType === 'B2B' ? '#93c5fd' : '#6cf8bb',
                    }}>
                      {inv.invoiceType}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#cbd5e1' }}>{formatINR(inv.totalTaxableAmount)}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#cbd5e1' }}>{formatINR(inv.totalTax)}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>{formatINR(inv.grandTotal)}</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      backgroundColor: inv.paymentStatus === 'PAID' ? 'rgba(0, 135, 90, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: inv.paymentStatus === 'PAID' ? '#6cf8bb' : '#f59e0b',
                    }}>
                      {inv.paymentStatus}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem' }} onClick={(e) => e.stopPropagation()}>
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
