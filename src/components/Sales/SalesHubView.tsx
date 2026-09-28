import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getWhatsAppShareUrl } from '../../core/utils/upiAndShare.ts';
import { db } from '../../services/db.ts';
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
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Send,
  Calendar,
} from 'lucide-react';

interface SalesHubViewProps {
  invoices: Invoice[];
  onOpenStandardInvoice: () => void;
  onOpenTableGridInvoice: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
  onQuickPos?: () => void;
}

export const SalesHubView: React.FC<SalesHubViewProps> = ({
  invoices,
  onOpenStandardInvoice,
  onOpenTableGridInvoice,
  onViewInvoice,
  onDeleteInvoice,
  onQuickPos,
}) => {
  const company = db.getCompany();
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNPAID' | 'PAID' | 'ESTIMATES' | 'CHALLANS'>('ALL');
  const [search, setSearch] = useState('');
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);

  // Metrics
  const totalSales = invoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalTax = invoices.reduce((s, i) => s + i.totalTax, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const totalPending = invoices.reduce((s, i) => s + i.balanceAmount, 0);
  const overdueCount = invoices.filter((i) => i.balanceAmount > 0).length;
  const avgTicket = invoices.length > 0 ? Math.round(totalSales / invoices.length) : 0;
  const targetSales = 550000;
  const targetAchieved = Math.min(100, Math.round((totalSales / targetSales) * 100));

  const filtered = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.partyName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.partyGstin && inv.partyGstin.toLowerCase().includes(search.toLowerCase()));

    if (activeTab === 'UNPAID') return matchesSearch && inv.balanceAmount > 0;
    if (activeTab === 'PAID') return matchesSearch && inv.paymentStatus === 'PAID';
    if (activeTab === 'ESTIMATES') return matchesSearch && inv.invoiceType === 'ESTIMATE';
    if (activeTab === 'CHALLANS') return matchesSearch && inv.invoiceType === 'DELIVERY_CHALLAN';
    return matchesSearch;
  });

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInvoice || paymentAmount <= 0) return;

    const newPaid = Math.min(paymentModalInvoice.grandTotal, paymentModalInvoice.paidAmount + paymentAmount);
    const newBal = Math.max(0, paymentModalInvoice.grandTotal - newPaid);
    const updated: Invoice = {
      ...paymentModalInvoice,
      paidAmount: newPaid,
      balanceAmount: newBal,
      paymentStatus: newBal === 0 ? 'PAID' : 'PARTIAL',
      updatedAt: new Date().toISOString(),
    };

    db.saveInvoice(updated);
    setPaymentModalInvoice(null);
    setPaymentAmount(0);
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Banner & Quick Metrics (Stitch sales_hub KPI Bento Stack) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '1rem',
      }}>
        {/* Main Monthly Sales Card with Target */}
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '14px',
          padding: '1.25rem',
          border: '1px solid #334155',
          gridColumn: 'span 2',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Monthly Sales Overview • Oct 2024
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>
                {formatINR(totalSales)}
              </div>
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: 700,
            }}>
              <TrendingUp size={14} /> +12.4% MoM
            </span>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
              <span>Monthly Target: {formatINR(targetSales)}</span>
              <span style={{ color: '#34d399', fontWeight: 700 }}>{targetAchieved}% achieved</span>
            </div>
            <div style={{ width: '100%', height: '8px', backgroundColor: '#0f172a', borderRadius: '9999px', overflow: 'hidden' }}>
              <div style={{ width: `${targetAchieved}%`, height: '100%', backgroundColor: '#10b981', borderRadius: '9999px' }} />
            </div>
          </div>
        </div>

        {/* Pending Due Overdue Card */}
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '14px',
          padding: '1.25rem',
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f87171', textTransform: 'uppercase' }}>
                Pending Due
              </span>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f87171', marginTop: '4px' }}>
              {formatINR(totalPending)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
              {overdueCount} Invoices Due for collection
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.5rem' }}>
            Tax Included: {formatINR(totalTax)}
          </div>
        </div>

        {/* Average Ticket Size */}
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '14px',
          padding: '1.25rem',
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Avg Ticket Size
              </span>
              <Receipt size={16} style={{ color: '#38bdf8' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>
              {formatINR(avgTicket)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#34d399', marginTop: '2px' }}>
              {invoices.length} Bills Processed
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.5rem' }}>
            Paid in Full: {formatINR(totalPaid)}
          </div>
        </div>
      </div>

      {/* Operational Quick Action Ribbon (Stitch Sales Hub) */}
      <div style={{
        backgroundColor: '#0f172a',
        borderRadius: '12px',
        padding: '0.75rem 1rem',
        border: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flex: 1 }}>
          <button
            onClick={onOpenTableGridInvoice}
            style={{
              height: '44px',
              padding: '0 1.25rem',
              backgroundColor: '#10b981',
              color: '#002113',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
            }}
          >
            <Plus size={18} />
            + New Bill (Grid POS)
          </button>

          <button
            onClick={onOpenStandardInvoice}
            style={{
              height: '44px',
              padding: '0 1rem',
              backgroundColor: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
            }}
          >
            <Receipt size={16} style={{ color: '#38bdf8' }} />
            Standard Form
          </button>

          {onQuickPos && (
            <button
              onClick={onQuickPos}
              style={{
                height: '44px',
                padding: '0 1rem',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              POS Quick Counter
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            placeholder="Search invoice, customer, GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              height: '40px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              paddingLeft: '36px',
              paddingRight: '12px',
              color: '#f8fafc',
              fontSize: '0.85rem',
            }}
          />
        </div>
      </div>

      {/* Filter Segmented Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('ALL')}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            backgroundColor: activeTab === 'ALL' ? '#3b82f6' : '#1e293b',
            color: activeTab === 'ALL' ? '#ffffff' : '#94a3b8',
          }}
        >
          All Invoices ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab('UNPAID')}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            backgroundColor: activeTab === 'UNPAID' ? '#ef4444' : '#1e293b',
            color: activeTab === 'UNPAID' ? '#ffffff' : '#94a3b8',
          }}
        >
          Pending Due ({overdueCount})
        </button>
        <button
          onClick={() => setActiveTab('PAID')}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            backgroundColor: activeTab === 'PAID' ? '#10b981' : '#1e293b',
            color: activeTab === 'PAID' ? '#ffffff' : '#94a3b8',
          }}
        >
          Paid in Full ({invoices.filter((i) => i.paymentStatus === 'PAID').length})
        </button>
        <button
          onClick={() => setActiveTab('ESTIMATES')}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            backgroundColor: activeTab === 'ESTIMATES' ? '#8b5cf6' : '#1e293b',
            color: activeTab === 'ESTIMATES' ? '#ffffff' : '#94a3b8',
          }}
        >
          Quotations / Estimates ({invoices.filter((i) => i.invoiceType === 'ESTIMATE').length})
        </button>
        <button
          onClick={() => setActiveTab('CHALLANS')}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            backgroundColor: activeTab === 'CHALLANS' ? '#f59e0b' : '#1e293b',
            color: activeTab === 'CHALLANS' ? '#ffffff' : '#94a3b8',
          }}
        >
          Delivery Challans ({invoices.filter((i) => i.invoiceType === 'DELIVERY_CHALLAN').length})
        </button>
      </div>

      {/* Invoice Register Table */}
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
                <th style={{ padding: '0.85rem 1rem' }}>Invoice # & Date</th>
                <th style={{ padding: '0.85rem 1rem' }}>Customer / Party</th>
                <th style={{ padding: '0.85rem 1rem' }}>Type</th>
                <th style={{ padding: '0.85rem 1rem' }}>Payment Status</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Tax Amount</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Grand Total</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
                    No sales invoices found matching the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    style={{
                      borderBottom: '1px solid #334155',
                      color: '#f8fafc',
                    }}
                  >
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 700, color: '#f8fafc' }}>{inv.invoiceNumber}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{formatDate(inv.date)}</div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 600 }}>{inv.partyName}</div>
                      {inv.partyGstin ? (
                        <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>{inv.partyGstin}</div>
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Unregistered Consumer</div>
                      )}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: inv.invoiceType === 'B2B' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                        color: inv.invoiceType === 'B2B' ? '#60a5fa' : '#c084fc',
                      }}>
                        {inv.invoiceType}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: inv.paymentStatus === 'PAID' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: inv.paymentStatus === 'PAID' ? '#34d399' : '#f87171',
                      }}>
                        {inv.paymentStatus}
                      </span>
                      {inv.balanceAmount > 0 && (
                        <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '2px' }}>
                          Due: {formatINR(inv.balanceAmount)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#94a3b8' }}>
                      {formatINR(inv.totalTax)}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 800, fontSize: '0.95rem' }}>
                      {formatINR(inv.grandTotal)}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                        <button
                          onClick={() => onViewInvoice(inv)}
                          style={{
                            backgroundColor: '#334155',
                            border: 'none',
                            color: '#f8fafc',
                            padding: '0.35rem 0.65rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                          title="View & Print Invoice"
                        >
                          <Eye size={14} />
                        </button>

                        {inv.balanceAmount > 0 && (
                          <button
                            onClick={() => {
                              setPaymentModalInvoice(inv);
                              setPaymentAmount(inv.balanceAmount);
                            }}
                            style={{
                              backgroundColor: '#059669',
                              border: 'none',
                              color: '#ffffff',
                              padding: '0.35rem 0.5rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                            title="Record Payment"
                          >
                            ₹ Pay
                          </button>
                        )}

                        <button
                          onClick={() => {
                            const url = getWhatsAppShareUrl(inv, company);
                            window.open(url, '_blank');
                          }}
                          style={{
                            backgroundColor: '#25D366',
                            border: 'none',
                            color: '#ffffff',
                            padding: '0.35rem 0.5rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                          title="Share on WhatsApp"
                        >
                          <Send size={13} />
                        </button>

                        <button
                          onClick={() => onDeleteInvoice(inv.id)}
                          style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            padding: '0.35rem',
                            cursor: 'pointer',
                          }}
                          title="Delete Invoice"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {paymentModalInvoice && (
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
            maxWidth: '440px',
            padding: '1.5rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 0.5rem 0' }}>
              Record Payment In
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
              Invoice {paymentModalInvoice.invoiceNumber} • {paymentModalInvoice.partyName}
            </p>

            <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                  <span>Grand Total:</span>
                  <span style={{ color: '#f8fafc', fontWeight: 600 }}>{formatINR(paymentModalInvoice.grandTotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
                  <span>Already Paid:</span>
                  <span style={{ color: '#34d399', fontWeight: 600 }}>{formatINR(paymentModalInvoice.paidAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#f87171', marginTop: '4px', fontWeight: 700 }}>
                  <span>Outstanding Due:</span>
                  <span>{formatINR(paymentModalInvoice.balanceAmount)}</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                  Payment Amount Received (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={paymentModalInvoice.balanceAmount}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    padding: '0.625rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '1rem',
                    fontWeight: 700,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setPaymentModalInvoice(null)}
                  style={{
                    padding: '0.5rem 1rem',
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
                    padding: '0.5rem 1.25rem',
                    backgroundColor: '#10b981',
                    color: '#002113',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Save & Update Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
