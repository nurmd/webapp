import React from 'react';
import { Invoice } from '../../models/invoice.ts';
import { InventoryItem } from '../../models/item.ts';
import { Party } from '../../models/party.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import {
  TrendingUp,
  Receipt,
  AlertTriangle,
  Users,
  ArrowUpRight,
  ShoppingCart,
  PlusCircle,
  FileText,
} from 'lucide-react';

interface DashboardViewProps {
  invoices: Invoice[];
  items: InventoryItem[];
  parties: Party[];
  onNewInvoice: () => void;
  onQuickPos: () => void;
  onViewInvoice: (invoice: Invoice) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  invoices,
  items,
  parties,
  onNewInvoice,
  onQuickPos,
  onViewInvoice,
}) => {
  // Aggregate Metrics
  const totalSales = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const totalGstLiability = invoices.reduce((sum, inv) => sum + inv.totalTax, 0);
  const totalReceivables = parties
    .filter((p) => p.currentBalance > 0)
    .reduce((sum, p) => sum + p.currentBalance, 0);

  const lowStockItems = items.filter((i) => i.currentStock <= i.minStockAlert);

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner / Welcome */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        padding: '1.25rem 1.5rem',
        borderRadius: '8px',
        border: '1px solid #334155',
      }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
            GST Financial Overview
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Real-time tax compliance, sales register, and inventory tracking.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={onQuickPos}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              backgroundColor: '#059669',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 0.85rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            <ShoppingCart size={15} />
            Quick POS Sale
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
            <PlusCircle size={15} />
            Create Tax Invoice
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
      }}>
        {/* Total Sales */}
        <div style={{
          backgroundColor: '#1e293b',
          padding: '1.25rem',
          borderRadius: '8px',
          border: '1px solid #334155',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Total Invoiced</span>
            <TrendingUp size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f8fafc', marginTop: '0.5rem' }}>
            {formatINR(totalSales)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            {invoices.length} Invoices generated
          </div>
        </div>

        {/* GST Liability */}
        <div style={{
          backgroundColor: '#1e293b',
          padding: '1.25rem',
          borderRadius: '8px',
          border: '1px solid #334155',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>GST Tax Liability</span>
            <Receipt size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981', marginTop: '0.5rem' }}>
            {formatINR(totalGstLiability)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            CGST + SGST + IGST Output
          </div>
        </div>

        {/* Receivables */}
        <div style={{
          backgroundColor: '#1e293b',
          padding: '1.25rem',
          borderRadius: '8px',
          border: '1px solid #334155',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Customer Receivables</span>
            <Users size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.5rem' }}>
            {formatINR(totalReceivables)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            Outstanding ledger balance
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div style={{
          backgroundColor: '#1e293b',
          padding: '1.25rem',
          borderRadius: '8px',
          border: '1px solid #334155',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Stock Alerts</span>
            <AlertTriangle size={18} color={lowStockItems.length > 0 ? '#ef4444' : '#10b981'} />
          </div>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: lowStockItems.length > 0 ? '#ef4444' : '#f8fafc',
            marginTop: '0.5rem',
          }}>
            {lowStockItems.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            {lowStockItems.length > 0 ? 'Items below re-order level' : 'Stock levels healthy'}
          </div>
        </div>
      </div>

      {/* Recent Invoices Table */}
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: '1px solid #334155',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
            Recent GST Sales Invoices
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Showing latest {Math.min(invoices.length, 5)} records
          </span>
        </div>

        {invoices.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
            <FileText size={40} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
            <div>No invoices generated yet.</div>
            <button
              onClick={onNewInvoice}
              style={{
                marginTop: '1rem',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Generate First Invoice
            </button>
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
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Tax</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.slice(0, 5).map((inv) => (
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
                  <td style={{ padding: '0.75rem 1rem', color: '#f8fafc' }}>
                    {inv.partyName}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                    {inv.partyGstin || 'Unregistered'}
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewInvoice(inv);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#60a5fa',
                        cursor: 'pointer',
                        padding: '0.25rem',
                      }}
                    >
                      <ArrowUpRight size={16} />
                    </button>
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
